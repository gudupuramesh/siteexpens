/**
 * Aggregates the Subscribers state into the Revenue dashboard's
 * KPIs: tier distribution, MRR estimate, ARR estimate, status mix,
 * and counts of trialing / past-due orgs.
 *
 * MRR is estimated client-side from the displayed pricing because
 * the actual paid amount lives in App Store / Play Store / RC.
 * Until Phase C wires RC, this is "what they WOULD pay if they
 * upgraded" — useful for planning, not for an audit. Phase C will
 * pull the real numbers from RC's Charts API.
 *
 * Cost: O(n) read on the orgs collection. At early-stage scale
 * (< 5K orgs) this is fine; later we should cache the aggregates
 * on a `system/revenueSnapshot` doc updated by a daily scheduled
 * function.
 */
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { assertAppOwner } from './auth';

const db = getFirestore();

// Estimated INR/month per tier. These mirror PLAN_PRICING_INR on
// the client. When App Store products are live (Phase C), swap
// these for RC-reported actuals.
const MRR_BY_TIER_INR: Record<string, number> = {
  free: 0,
  solo: 499,
  studio: 1999,
  agency: 4999,
};

type TierMix = Record<'free' | 'solo' | 'studio' | 'agency', number>;
type StatusMix = Record<
  'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired',
  number
>;

export type RevenueAnalytics = {
  totalOrgs: number;
  tierMix: TierMix;
  statusMix: StatusMix;
  /** Estimated MRR in INR. Only counts active+trialing paid tiers. */
  mrrInr: number;
  /** Estimated ARR — `mrrInr * 12` for now. Phase C will pull RC actuals. */
  arrInr: number;
  /** Trialing orgs whose `expiresAt` is within the next 14 days —
   *  the "to convert" cohort. */
  trialEndingSoon: number;
  /** Orgs flagged with manual override — useful for finding comp
   *  accounts that may need attention. */
  manuallyOverridden: number;
};

export const adminGetRevenueAnalytics = onCall<
  Record<string, never>,
  Promise<RevenueAnalytics>
>(async (request) => {
  assertAppOwner(request);

  const snap = await db.collection('organizations').get();

  const tierMix: TierMix = { free: 0, solo: 0, studio: 0, agency: 0 };
  const statusMix: StatusMix = {
    active: 0,
    trialing: 0,
    past_due: 0,
    cancelled: 0,
    expired: 0,
  };
  let mrrInr = 0;
  let trialEndingSoon = 0;
  let manuallyOverridden = 0;

  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  for (const doc of snap.docs) {
    const sub =
      (doc.data().subscription as Record<string, unknown> | undefined) ?? {};
    const tier =
      typeof sub.tier === 'string' &&
      ['free', 'solo', 'studio', 'agency'].includes(sub.tier)
        ? (sub.tier as keyof TierMix)
        : 'free';
    const status =
      typeof sub.status === 'string' &&
      ['active', 'trialing', 'past_due', 'cancelled', 'expired'].includes(
        sub.status,
      )
        ? (sub.status as keyof StatusMix)
        : 'active';

    tierMix[tier] += 1;
    statusMix[status] += 1;

    // MRR contribution: only active + trialing paid tiers count.
    // A trialing Studio org will convert (or churn) — we count
    // them as forecast revenue; the dashboard makes this clear.
    if (status === 'active' || status === 'trialing') {
      mrrInr += MRR_BY_TIER_INR[tier] ?? 0;
    }

    if (status === 'trialing') {
      const expiresAt = sub.expiresAt as
        | { toMillis?: () => number }
        | undefined;
      if (
        expiresAt &&
        typeof expiresAt.toMillis === 'function'
      ) {
        const ms = expiresAt.toMillis();
        if (ms > now && ms - now <= fourteenDaysMs) {
          trialEndingSoon += 1;
        }
      }
    }

    if (sub.source === 'manual') {
      manuallyOverridden += 1;
    }
  }

  return {
    totalOrgs: snap.size,
    tierMix,
    statusMix,
    mrrInr,
    arrInr: mrrInr * 12,
    trialEndingSoon,
    manuallyOverridden,
  };
});
