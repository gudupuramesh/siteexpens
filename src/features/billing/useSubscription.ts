/**
 * `useSubscription` — single source of truth for the active org's
 * billing state on the client.
 *
 * What it returns:
 *   - `subscription` — the raw doc-shape state (tier, status,
 *     expiresAt, ...). Falls back to a Free placeholder when the
 *     org doc hasn't loaded or has no `subscription` field yet.
 *   - `limits` — the resolved `PlanLimits` for the EFFECTIVE tier.
 *     "Effective" means: if status is `expired` / `past_due` /
 *     `cancelled` (after the paid window), we degrade to Free
 *     limits even though `tier` may still say `studio`. This
 *     mirrors the server-side `effectiveLimits()` exactly.
 *   - `counters` — denormalised `{ memberCount, projectCount,
 *     storageBytes }`. Maintained by Firestore triggers on the
 *     server; the client only reads.
 *   - `canAddMember` / `canAddProject` / `canUploadBytes(size)` —
 *     pre-computed booleans the UI gates use to decide whether to
 *     show a paywall vs. let the action proceed.
 *   - `storageUsagePercent` — for the usage banner.
 *
 * Reactivity: this hook composes `useCurrentOrganization` (live
 * snapshot of the active org doc) so any change to `subscription`
 * or `counters` (RevenueCat webhook, manual override, counter
 * trigger) propagates to every UI gate within ~1 frame.
 *
 * Failure modes:
 *   - Org doc not yet loaded → returns Free placeholder (safe
 *     default — UI shows paywall earlier rather than letting an
 *     action through that the server will reject)
 *   - `subscription` field missing on a real org → also Free
 *     fallback. Prevents pre-migration orgs from being silently
 *     "unlimited" before the migration runs.
 */
import { useMemo } from 'react';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';

import { PLAN_LIMITS } from './limits';
import type {
  OrgCounters,
  PlanLimits,
  PlanTier,
  Subscription,
  SubscriptionStatus,
} from './types';

const FREE_FALLBACK: Subscription = {
  tier: 'free',
  status: 'active',
  expiresAt: null,
  willRenew: false,
  revenueCatId: null,
  productId: null,
  period: null,
  updatedAt: null,
  source: 'init',
};

const ZERO_COUNTERS: OrgCounters = {
  memberCount: 0,
  projectCount: 0,
  storageBytes: 0,
};

export type UseSubscriptionResult = {
  /** Raw subscription doc state, or a Free fallback. */
  subscription: Subscription;
  /** EFFECTIVE limits — if the subscription is expired/past_due,
   *  these collapse to Free even though `subscription.tier` still
   *  reads the paid tier. UI gates always use these. */
  limits: PlanLimits;
  /** Effective tier (mirrors `limits` — may differ from
   *  `subscription.tier` when expired/past_due). */
  effectiveTier: PlanTier;
  counters: OrgCounters;
  /** True when adding ONE more member would still be within the cap.
   *  Use this to gate "+ Add member" buttons and the invite-flow
   *  entry points. */
  canAddMember: boolean;
  /** True when adding ONE more project would be within the cap. */
  canAddProject: boolean;
  /** True when an upload of `bytes` more bytes would still fit
   *  within the storage cap. Pass the file size BEFORE compression
   *  for safety; the server rechecks. */
  canUploadBytes: (bytes: number) => boolean;
  /** 0–100. Used to decide whether to show the storage banner
   *  ("you've used X% of your quota"). */
  storageUsagePercent: number;
  /** While the org doc is still loading the FIRST snapshot we don't
   *  know the real subscription state — UI should hold the click
   *  handler off rather than show a paywall in error. */
  loading: boolean;
};

/** Statuses that DO entitle the user to their paid tier's limits.
 *  Anything else degrades to Free. */
const ACTIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
]);

export function useSubscription(): UseSubscriptionResult {
  const { data: org, loading } = useCurrentOrganization();

  return useMemo(() => {
    const sub: Subscription =
      (org as unknown as { subscription?: Subscription } | null)?.subscription ??
      FREE_FALLBACK;
    const counters: OrgCounters =
      (org as unknown as { counters?: OrgCounters } | null)?.counters ??
      ZERO_COUNTERS;

    // Effective tier downgrades to Free when status is expired /
    // cancelled (after expiry) / past_due. This matches the server's
    // `effectiveLimits()` so client + server agree.
    const isActive = ACTIVE_STATUSES.has(sub.status);
    const effectiveTier: PlanTier = isActive ? sub.tier : 'free';
    const limits: PlanLimits = PLAN_LIMITS[effectiveTier];

    const canAddMember = counters.memberCount + 1 <= limits.maxMembers;
    const canAddProject = counters.projectCount + 1 <= limits.maxProjects;
    const canUploadBytes = (bytes: number) =>
      counters.storageBytes + Math.max(0, bytes) <= limits.maxStorageBytes;

    const storageUsagePercent = (() => {
      if (!isFinite(limits.maxStorageBytes) || limits.maxStorageBytes <= 0) {
        return 0;
      }
      const pct = Math.round(
        (counters.storageBytes / limits.maxStorageBytes) * 100,
      );
      return Math.max(0, Math.min(100, pct));
    })();

    return {
      subscription: sub,
      limits,
      effectiveTier,
      counters,
      canAddMember,
      canAddProject,
      canUploadBytes,
      storageUsagePercent,
      loading,
    };
  }, [org, loading]);
}
