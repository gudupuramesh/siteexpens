/**
 * Subscription + billing types shared across the client.
 *
 * Mirrored on the server in `functions/src/billing/types.ts` (or
 * inlined per-callable). When you change the shape here, change it
 * there too — the webhook + counter triggers write the doc, the
 * client only reads it via Firestore snapshots.
 */
import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

/** The four pricing tiers. Stored on
 *  `organizations/{orgId}.subscription.tier`. */
export type PlanTier = 'free' | 'solo' | 'studio' | 'agency';

/** Lifecycle of a subscription. RevenueCat events drive transitions:
 *   - `trialing` — only used during the existing-org migration window
 *     (60-day trial of Studio); RevenueCat doesn't actually mint these
 *     for paying users since we're not offering a Store-side trial
 *   - `active` — subscription is in good standing and within paid window
 *   - `past_due` — billing failed; RevenueCat is retrying. Tier stays
 *     intact while RC retries (typically 16 days)
 *   - `cancelled` — user turned off auto-renew but is still inside the
 *     paid window (`willRenew=false`, `expiresAt` in the future)
 *   - `expired` — paid window elapsed without renewal; tier downgrades
 *     to `free` */
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'expired';

/** Renewal cadence. */
export type SubscriptionPeriod = 'monthly' | 'annual';

/** Shape of `organizations/{orgId}.subscription`. */
export type Subscription = {
  tier: PlanTier;
  status: SubscriptionStatus;
  /** When the current paid window ends. Null for `free` (no paid
   *  window) and migrating orgs before the migration runs. */
  expiresAt: FirebaseFirestoreTypes.Timestamp | null;
  /** True when auto-renew is on. From RevenueCat's customerInfo. */
  willRenew: boolean;
  /** RevenueCat App User ID — we use the orgId so purchases attach
   *  to the org, not the user. Null for free / migrated orgs. */
  revenueCatId: string | null;
  /** Active product ID (e.g. `studio_monthly_v1`). Null for free. */
  productId: string | null;
  period: SubscriptionPeriod | null;
  /** Server timestamp of the last write to this object. */
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
  /** What wrote this state — useful for audit. */
  source: 'webhook' | 'manual' | 'migration' | 'init';
};

/** Per-tier hard limits. Sourced from `system/planConfig` (or the
 *  hard-coded fallback in `limits.ts` when the doc isn't loaded yet). */
export type PlanLimits = {
  /** Org members count. Use `Number.POSITIVE_INFINITY` for unlimited. */
  maxMembers: number;
  /** Active projects. `Number.POSITIVE_INFINITY` for unlimited. */
  maxProjects: number;
  /** Per-org R2 storage cap, in bytes. */
  maxStorageBytes: number;
};

/** Full plan config — one row per tier plus metadata. Shape of
 *  `system/planConfig` once the App Owner portal can edit it; until
 *  then the client falls back to the hard-coded `PLAN_LIMITS`. */
export type PlanConfig = Record<PlanTier, PlanLimits> & {
  updatedAt?: FirebaseFirestoreTypes.Timestamp | null;
  updatedBy?: string;
};

/** Denormalised counters on `organizations/{orgId}`. Maintained by
 *  Firestore triggers in `functions/src/billing/counters.ts`. */
export type OrgCounters = {
  /** Length of `organizations.{orgId}.memberIds`. */
  memberCount: number;
  /** Count of `projects.where('orgId', '==', orgId)` (excludes
   *  soft-deleted / archived later if we add that). */
  projectCount: number;
  /** Sum of `projectStorage.{projectId}.totalBytes` across the org's
   *  projects. Updated less frequently than the others — eventually
   *  consistent. */
  storageBytes: number;
};
