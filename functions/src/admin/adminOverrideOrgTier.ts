/**
 * Manually set an org's subscription tier.
 *
 * Use cases:
 *   - Comp account: push a free org onto Studio for a partner / VIP
 *   - Refund stand-in: drop a paid org back to Free outside the
 *     normal RevenueCat lifecycle
 *   - Trial extension: bump a trialing org's expiresAt forward
 *
 * Always wins over RevenueCat — when an org has BOTH an active RC
 * subscription AND a manual override, the override is the truth.
 * RC webhooks for that org are still recorded (in audit) but don't
 * overwrite the override until the App Owner clears it.
 *
 * The override is recorded on the subscription doc itself
 * (`source: 'manual'`, `manualOverriderUid`, `manualOverrideNote`)
 * so the Subscribers screen can flag it and the org-detail screen
 * can show "manually overridden by ..." with one-click revert.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

import { assertAppOwner } from './auth';
import { logAdminAction } from './audit';

const db = getFirestore();

type Request = {
  orgId: string;
  /** Target tier. Pass 'free' to drop them down. */
  tier: 'free' | 'solo' | 'studio' | 'agency';
  /** ISO date string OR null for "never expires" (permanent override). */
  expiresAt: string | null;
  /** Optional operator note shown in audit + on the org-detail screen. */
  note?: string;
};

type Response = { ok: true };

export const adminOverrideOrgTier = onCall<Request, Promise<Response>>(
  async (request) => {
    const actorUid = assertAppOwner(request);

    const { orgId, tier, expiresAt, note } = request.data ?? ({} as Request);

    if (!orgId || typeof orgId !== 'string') {
      throw new HttpsError('invalid-argument', '`orgId` is required.');
    }
    if (!['free', 'solo', 'studio', 'agency'].includes(tier)) {
      throw new HttpsError(
        'invalid-argument',
        '`tier` must be one of free / solo / studio / agency.',
      );
    }

    let expiresAtTs: Timestamp | null = null;
    if (expiresAt !== null && expiresAt !== undefined) {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) {
        throw new HttpsError('invalid-argument', '`expiresAt` must be ISO or null.');
      }
      expiresAtTs = Timestamp.fromDate(d);
    }

    const orgRef = db.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      throw new HttpsError('not-found', 'Organization not found.');
    }
    const before = orgSnap.data()?.subscription ?? null;

    // For Free overrides, expiresAt is meaningless (Free never
    // expires) — null it out so the admin UI doesn't show a
    // misleading countdown.
    const finalExpiresAt = tier === 'free' ? null : expiresAtTs;

    const next = {
      tier,
      // Manual overrides are always 'active' (or 'trialing' when
      // expiresAt is set in the future — we use 'active' uniformly
      // and let the UI infer "trialing" from expiresAt being set).
      status: 'active' as const,
      expiresAt: finalExpiresAt,
      willRenew: false,
      // Preserve any prior RC linkage so we know what state was
      // overridden if we need to revert. Reading from `before`.
      revenueCatId:
        (before as { revenueCatId?: string | null } | null)?.revenueCatId ??
        null,
      productId:
        (before as { productId?: string | null } | null)?.productId ?? null,
      period:
        (before as { period?: string | null } | null)?.period ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      source: 'manual' as const,
      manualOverriderUid: actorUid,
      manualOverriddenAt: FieldValue.serverTimestamp(),
      manualOverrideNote: note ?? null,
    };

    await orgRef.set({ subscription: next }, { merge: true });

    await logAdminAction({
      actorUid,
      action: 'override_org_tier',
      targetOrgId: orgId,
      before: (before as Record<string, unknown> | null) ?? undefined,
      after: { ...next, updatedAt: 'server-ts', manualOverriddenAt: 'server-ts' },
      note,
    });

    return { ok: true };
  },
);
