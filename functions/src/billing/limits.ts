/**
 * Server-side mirror of `src/features/billing/limits.ts`.
 *
 * These constants gate every callable that adds work for an org
 * (inviteMember, createProject, r2PresignedUploadUrl). They MUST
 * match the client-side limits exactly — a mismatch means the
 * paywall says "you're fine" but the callable rejects, or vice
 * versa.
 *
 * When the App Owner portal is built (Phase E), the limits move to
 * `system/planConfig` and these constants become the bootstrap
 * default that's used until the doc loads.
 */

export type PlanTier = 'free' | 'solo' | 'studio' | 'agency';

export type PlanLimits = {
  maxMembers: number;
  maxProjects: number;
  maxStorageBytes: number;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    maxMembers: 1,
    maxProjects: 1,
    maxStorageBytes: 100 * 1024 * 1024,
  },
  solo: {
    maxMembers: 1,
    maxProjects: Number.POSITIVE_INFINITY,
    maxStorageBytes: 5 * 1024 ** 3,
  },
  studio: {
    maxMembers: 6,
    maxProjects: Number.POSITIVE_INFINITY,
    maxStorageBytes: 50 * 1024 ** 3,
  },
  agency: {
    maxMembers: Number.POSITIVE_INFINITY,
    maxProjects: Number.POSITIVE_INFINITY,
    maxStorageBytes: 200 * 1024 ** 3,
  },
};

/** Read the active tier off an org doc. Defaults to `free` when the
 *  field is missing — matters during the migration window before
 *  `migrateExistingOrgs` runs. */
export function tierOf(org: Record<string, unknown> | undefined): PlanTier {
  const sub = org?.subscription as { tier?: unknown } | undefined;
  const tier = typeof sub?.tier === 'string' ? sub.tier : 'free';
  if (tier === 'solo' || tier === 'studio' || tier === 'agency') {
    return tier;
  }
  return 'free';
}

/** True when the subscription is in a state that grants the tier's
 *  full benefits — `active` and `trialing` count, others fall back
 *  to free limits. */
export function tierIsActive(org: Record<string, unknown> | undefined): boolean {
  const sub = org?.subscription as { status?: unknown } | undefined;
  const status = sub?.status;
  return status === 'active' || status === 'trialing';
}

/** Effective limits for an org. If the subscription is past_due,
 *  cancelled (after expiry), or expired, we return Free limits — the
 *  caller treats them as if they had no subscription. */
export function effectiveLimits(
  org: Record<string, unknown> | undefined,
): { tier: PlanTier; limits: PlanLimits } {
  const tier = tierOf(org);
  const active = tierIsActive(org);
  if (!active && tier !== 'free') {
    return { tier: 'free', limits: PLAN_LIMITS.free };
  }
  return { tier, limits: PLAN_LIMITS[tier] };
}
