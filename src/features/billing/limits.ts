/**
 * Hard-coded fallback for plan limits + display labels.
 *
 * This file is the source of truth UNTIL the App Owner portal lets us
 * edit `system/planConfig` live (Phase E of the billing rollout).
 * Both the client (`useSubscription`) and the server (callables +
 * webhook) read these constants.
 *
 * The server mirror is in `functions/src/billing/limits.ts` — keep
 * them in lock-step. A single typo between the two creates a paywall
 * mismatch that's painful to debug.
 *
 * Pricing (₹) is informational only — the actual money is set in App
 * Store Connect + Google Play Console as immutable product prices,
 * mirrored into RevenueCat. We display these strings in the paywall
 * and the marketing site, but the Stores own the truth.
 */
import type { PlanLimits, PlanTier } from './types';

/** Per-tier hard limits. */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    maxMembers: 1,
    maxProjects: 1,
    maxStorageBytes: 100 * 1024 * 1024, // 100 MB
  },
  solo: {
    maxMembers: 1,
    maxProjects: Number.POSITIVE_INFINITY,
    maxStorageBytes: 5 * 1024 ** 3, // 5 GB
  },
  studio: {
    maxMembers: 6,
    maxProjects: Number.POSITIVE_INFINITY,
    maxStorageBytes: 50 * 1024 ** 3, // 50 GB
  },
  agency: {
    maxMembers: Number.POSITIVE_INFINITY,
    maxProjects: Number.POSITIVE_INFINITY,
    maxStorageBytes: 200 * 1024 ** 3, // 200 GB
  },
};

/** Order tiers from cheapest → most expensive. Used in paywall
 *  rendering and "next tier up" suggestions. */
export const PLAN_ORDER: PlanTier[] = ['free', 'solo', 'studio', 'agency'];

/** Human-readable label for the paywall + admin portal. */
export const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  solo: 'Solo',
  studio: 'Studio',
  agency: 'Agency',
};

/** One-line value-prop shown under each tier card. */
export const PLAN_TAGLINES: Record<PlanTier, string> = {
  free: 'Try the app — 1 user, 1 project',
  solo: 'For solo designers — unlimited projects',
  studio: 'For small studios — up to 6 team members',
  agency: 'For larger studios — unlimited team',
};

/** Marketing pricing strings — actual purchase price comes from the
 *  RevenueCat package's `localizedPriceString`, which honours the
 *  Store's region + currency. These are India-only fallbacks for
 *  the static paywall preview.
 *
 *  Annual prices use Apple's "10× monthly" tier (closest available in
 *  Apple's fixed price ladder — `monthly × 9.6` like ₹19,199 isn't
 *  selectable). Saves the user ~16.6% vs paying monthly all year,
 *  which we surface as the "Save X%" callout via `annualSavingsPercent`. */
export const PLAN_PRICING_INR: Record<
  PlanTier,
  { monthly: number; annual: number } | null
> = {
  free: null,
  solo: { monthly: 499, annual: 4999 },
  studio: { monthly: 1999, annual: 19999 },
  agency: { monthly: 4999, annual: 49999 },
};

/** True when a number is "unlimited" for display purposes. We use
 *  `Number.POSITIVE_INFINITY` internally and render it as "∞" or
 *  the word "Unlimited" via this guard. */
export function isUnlimited(value: number): boolean {
  return value === Number.POSITIVE_INFINITY;
}

/** Find the next tier above `current` — returns null if already at
 *  the top. Used by paywall CTAs ("Upgrade to Studio"). */
export function nextTierAbove(current: PlanTier): PlanTier | null {
  const i = PLAN_ORDER.indexOf(current);
  if (i < 0 || i === PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[i + 1];
}
