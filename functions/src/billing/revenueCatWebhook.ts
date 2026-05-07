/**
 * RevenueCat webhook receiver.
 *
 * RevenueCat POSTs JSON to this endpoint on every subscription event:
 *   - INITIAL_PURCHASE       — first paid transaction for a user
 *   - RENEWAL                — auto-renewal succeeded
 *   - PRODUCT_CHANGE         — user upgraded/downgraded mid-period
 *   - CANCELLATION           — user turned off auto-renew
 *   - UNCANCELLATION         — user re-enabled auto-renew before expiry
 *   - EXPIRATION             — paid window elapsed without renewal
 *   - BILLING_ISSUE          — payment retry started (grace period)
 *   - SUBSCRIBER_ALIAS       — RC merged anonymous → identified user
 *   - NON_RENEWING_PURCHASE  — one-time IAP (we don't use these today)
 *   - TRANSFER               — purchase moved to a different App User ID
 *
 * Authentication: RC sends an `Authorization: Bearer <secret>` header
 * matching what we configured in the RC dashboard. Stored as the
 * `REVENUECAT_WEBHOOK_AUTH` Firebase secret. Reject anything else.
 *
 * Identity model: we set `App User ID = orgId` via `Purchases.logIn(orgId)`
 * in the client (see `src/features/billing/initRevenueCat.ts`). So
 * `event.app_user_id` on every webhook IS the orgId. No translation
 * needed — we write directly to `organizations/{app_user_id}.subscription`.
 *
 * Idempotency: RC may retry on 5xx with the same `event.id`. We dedupe
 * by writing to `webhookEvents/{event.id}` first; if that doc already
 * exists, we ack-and-skip. Without this, a retried INITIAL_PURCHASE
 * could land twice and shift `expiresAt` forward incorrectly when the
 * second delivery races with a manual override.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

import { tierAndPeriodFromProductIdServer } from './productIdMap';
import type { Subscription, SubscriptionStatus } from './types';

// ── Secret ───────────────────────────────────────────────────────────
//
// Set via:  firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
// Paste the SAME secret string into RevenueCat dashboard → Project
// Settings → Integrations → Webhooks → "Authorization header value".
// Convention: `Bearer <random-32-char-hex>` — RC sends the value
// verbatim in the Authorization header.

const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

// ── Types (subset — we only read what we use) ────────────────────────

type RCEvent = {
  /** Unique event id — used for idempotency. */
  id: string;
  /** One of the event types listed in the file header. */
  type: string;
  /** Our orgId (we set this via Purchases.logIn(orgId) on the client). */
  app_user_id: string;
  /** The product purchased / renewed (e.g. `interioros.studio.monthly`). */
  product_id: string;
  /** Current paid window ends here. ms since epoch. Null for free. */
  expiration_at_ms: number | null;
  /** Set on cancellation events; null otherwise. */
  cancel_reason?: string | null;
  /** ms since epoch the event happened on RC's side. */
  event_timestamp_ms: number;
};

type RCWebhookPayload = {
  event: RCEvent;
  api_version: string;
};

// ── Status mapping ────────────────────────────────────────────────────

function statusFromEventType(type: string): SubscriptionStatus | null {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'TRANSFER':
      return 'active';
    case 'CANCELLATION':
      // User turned off auto-renew but is still inside the paid window.
      // Tier stays intact until expiry; status reflects the cancellation.
      return 'cancelled';
    case 'EXPIRATION':
      return 'expired';
    case 'BILLING_ISSUE':
      // RC is retrying payment — keep the user on tier during the
      // ~16-day grace period. Status surfaces the issue so the client
      // can show a banner.
      return 'past_due';
    case 'SUBSCRIBER_ALIAS':
    case 'NON_RENEWING_PURCHASE':
      // SUBSCRIBER_ALIAS doesn't change subscription state on its own;
      // a PRODUCT_CHANGE or RENEWAL event arrives separately.
      // NON_RENEWING_PURCHASE — we don't sell consumables.
      return null;
    default:
      return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────

export const revenueCatWebhook = onRequest(
  {
    region: 'us-central1',
    secrets: [REVENUECAT_WEBHOOK_AUTH],
    // RC retries on 5xx; we dedupe in code so it's safe.
    memory: '256MiB',
    cpu: 1,
  },
  async (req, res) => {
    // Only accept POST. RC's "test webhook" button sends POST too.
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed');
      return;
    }

    // Auth check — header value must match the configured secret.
    // Both sides are normalised (strip optional "Bearer " prefix +
    // trim whitespace) so the operator can paste the secret with or
    // without "Bearer " into the RevenueCat dashboard. RevenueCat sends
    // whatever string the operator types in the Authorization header
    // verbatim — there's no enforced format.
    const expected = REVENUECAT_WEBHOOK_AUTH.value();
    const got = req.header('authorization') ?? '';
    const normalise = (s: string) => s.replace(/^Bearer\s+/i, '').trim();
    if (!expected || normalise(got) !== normalise(expected)) {
      // Log a one-line diagnostic (no secret material) so we can see
      // whether the header arrived at all + what its rough shape is.
      console.warn('[revenueCatWebhook] auth mismatch', {
        headerPresent: got.length > 0,
        headerLen: got.length,
        headerStart: got.slice(0, 10),
        expectedLen: expected ? expected.length : 0,
      });
      res.status(401).send('unauthorized');
      return;
    }

    const payload = req.body as RCWebhookPayload | undefined;
    const event = payload?.event;
    if (!event || typeof event !== 'object') {
      res.status(400).send('bad payload');
      return;
    }

    const { id: eventId, type, app_user_id: orgId, product_id: productId } = event;
    if (!eventId || !orgId) {
      res.status(400).send('missing event.id or app_user_id');
      return;
    }

    const db = getFirestore();

    // Idempotency — if we've seen this event id before, ack and skip.
    // Stored in a top-level collection so the read doesn't require any
    // org context (we may receive events for orgs deleted between
    // delivery and retry).
    const eventRef = db.collection('webhookEvents').doc(eventId);
    const eventSnap = await eventRef.get();
    if (eventSnap.exists) {
      res.status(200).send('ok (duplicate)');
      return;
    }

    // Record the event up-front so a concurrent retry sees it. We
    // include the type + orgId so the audit trail is searchable.
    await eventRef.set({
      type,
      orgId,
      productId: productId ?? null,
      receivedAt: FieldValue.serverTimestamp(),
      eventTimestamp: event.event_timestamp_ms
        ? Timestamp.fromMillis(event.event_timestamp_ms)
        : null,
    });

    // Resolve the new subscription state.
    const status = statusFromEventType(type);
    if (!status) {
      // Event type we don't handle (SUBSCRIBER_ALIAS, etc.).
      // Audit it but don't touch org.subscription.
      res.status(200).send('ok (no-op)');
      return;
    }

    const tierAndPeriod = productId
      ? tierAndPeriodFromProductIdServer(productId)
      : null;

    // EXPIRATION → downgrade to free regardless of which product expired.
    // Other events take their tier from the product.
    const tier = type === 'EXPIRATION'
      ? ('free' as const)
      : tierAndPeriod?.tier ?? null;

    if (!tier) {
      // We got an event for a product we don't recognize. Log via the
      // webhookEvents doc and ack (don't 500 — that triggers RC retries
      // for an event we'll never handle).
      await eventRef.update({
        warning: `Unknown product_id: ${productId}`,
      });
      res.status(200).send('ok (unknown product)');
      return;
    }

    const subscription: Subscription = {
      tier,
      status,
      productId: tier === 'free' ? null : productId,
      period: tierAndPeriod?.period ?? null,
      revenueCatId: orgId,
      expiresAt: event.expiration_at_ms
        ? Timestamp.fromMillis(event.expiration_at_ms)
        : null,
      willRenew:
        // Active states with no cancel reason renew. CANCELLATION
        // means user turned off auto-renew (willRenew=false but tier
        // stays intact until expiry). EXPIRATION & BILLING_ISSUE
        // are non-renewing terminal/intermediate states.
        status === 'active' && !event.cancel_reason,
      updatedAt: null, // Firestore serverTimestamp set inline below.
      source: 'webhook',
    };

    // Write atomically — only the subscription field touched, so other
    // org doc fields (memberIds, roles, counters) stay untouched.
    await db.collection('organizations').doc(orgId).set(
      {
        subscription: {
          ...subscription,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );

    res.status(200).send('ok');
  },
);
