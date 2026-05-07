/**
 * Cross-org list of subscribers for the App Owner Subscribers screen.
 *
 * Returns one row per org with the fields the table needs:
 *   id, name, ownerId, ownerContact, tier, status, expiresAt,
 *   memberCount, projectCount, storageBytes, createdAt
 *
 * Admin SDK reads bypass Firestore rules, so we get every org
 * regardless of the caller's per-org membership. The caller must
 * still be the App Owner (custom-claim check at the top).
 *
 * Pagination: offset / limit cursor is sufficient for the early-
 * stage scale (< 5K orgs); switch to startAfter for true pagination
 * when the org count grows past a few thousand.
 *
 * Optional filters: tier + status — for the table's segmented filter
 * chips. Server-side filtering keeps payloads small.
 */
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { assertAppOwner } from './auth';

const db = getFirestore();

type Filters = {
  tier?: 'free' | 'solo' | 'studio' | 'agency';
  status?: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
};

type Request = {
  pageSize?: number;
  filters?: Filters;
};

export type SubscriberRow = {
  id: string;
  name: string;
  ownerId: string;
  ownerContact: string | null;
  tier: string;
  status: string;
  expiresAt: number | null; // ms epoch
  memberCount: number;
  projectCount: number;
  storageBytes: number;
  createdAt: number | null;
};

type Response = {
  rows: SubscriberRow[];
  total: number;
};

export const adminListSubscribers = onCall<Request, Promise<Response>>(
  async (request) => {
    assertAppOwner(request);

    const pageSize = Math.min(
      Math.max(1, request.data?.pageSize ?? 200),
      500,
    );
    const filters = request.data?.filters ?? {};

    // Read every org (early-stage scale; switch to paginated when
    // we cross ~2k orgs). Admin SDK bypasses rules.
    const snap = await db.collection('organizations').get();

    const rows: SubscriberRow[] = [];
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const sub =
        (d.subscription as Record<string, unknown> | undefined) ?? {};
      const counters =
        (d.counters as Record<string, unknown> | undefined) ?? {};

      const tier = typeof sub.tier === 'string' ? sub.tier : 'free';
      const status = typeof sub.status === 'string' ? sub.status : 'active';

      // Apply filters
      if (filters.tier && tier !== filters.tier) continue;
      if (filters.status && status !== filters.status) continue;

      const expiresAt =
        sub.expiresAt && typeof (sub.expiresAt as { toMillis?: () => number }).toMillis === 'function'
          ? (sub.expiresAt as { toMillis: () => number }).toMillis()
          : null;
      const createdAt =
        d.createdAt && typeof (d.createdAt as { toMillis?: () => number }).toMillis === 'function'
          ? (d.createdAt as { toMillis: () => number }).toMillis()
          : null;

      rows.push({
        id: doc.id,
        name: typeof d.name === 'string' ? d.name : '',
        ownerId: typeof d.ownerId === 'string' ? d.ownerId : '',
        // Owner contact (email field on the org doc — the studio
        // contact email, separate from any user.email).
        ownerContact: typeof d.email === 'string' ? d.email : null,
        tier,
        status,
        expiresAt,
        memberCount:
          typeof counters.memberCount === 'number' ? counters.memberCount : 0,
        projectCount:
          typeof counters.projectCount === 'number' ? counters.projectCount : 0,
        storageBytes:
          typeof counters.storageBytes === 'number' ? counters.storageBytes : 0,
        createdAt,
      });
    }

    // Sort by created (newest first) for the default table view
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    // Apply page size limit
    const total = rows.length;
    const limited = rows.slice(0, pageSize);

    return { rows: limited, total };
  },
);
