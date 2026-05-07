/**
 * App Store / Play Store / RevenueCat product identifiers.
 *
 * These MUST match exactly:
 *   1. App Store Connect → Subscriptions (iOS)
 *   2. Google Play Console → Subscriptions (Android)
 *   3. RevenueCat dashboard → Products
 *
 * Mismatched IDs across stores is the #1 RevenueCat configuration bug.
 *
 * Server mirror: `functions/src/billing/productIdMap.ts` — keep in lock-step.
 *
 * The id strings are deliberately lowercase + dot-namespaced so they're
 * legal on both Apple (alphanumeric + dots + underscores + hyphens) and
 * Google (alphanumeric + dots + underscores).
 */
import type { PlanTier, SubscriptionPeriod } from './types';

/** All paid product IDs (free tier has no product). */
export const PRODUCT_IDS = {
  solo: {
    monthly: 'interioros.solo.monthly',
    annual: 'interioros.solo.annual',
  },
  studio: {
    monthly: 'interioros.studio.monthly',
    annual: 'interioros.studio.annual',
  },
  agency: {
    monthly: 'interioros.agency.monthly',
    annual: 'interioros.agency.annual',
  },
} as const;

export type PaidTier = Exclude<PlanTier, 'free'>;

/** Resolve product id from (tier, period). Returns null for free. */
export function productIdFor(
  tier: PlanTier,
  period: SubscriptionPeriod,
): string | null {
  if (tier === 'free') return null;
  return PRODUCT_IDS[tier][period];
}

/** Reverse lookup — useful in the webhook handler when RC sends us a
 *  product_id and we need the tier + period. Returns null on unknown. */
export function tierAndPeriodFromProductId(
  id: string,
): { tier: PaidTier; period: SubscriptionPeriod } | null {
  for (const tier of ['solo', 'studio', 'agency'] as PaidTier[]) {
    for (const period of ['monthly', 'annual'] as SubscriptionPeriod[]) {
      if (PRODUCT_IDS[tier][period] === id) return { tier, period };
    }
  }
  return null;
}

/** RevenueCat entitlement identifier — any non-free tier grants `paid`.
 *  Tier-specific limits are enforced by `org.subscription.tier`, not by
 *  separate entitlements. Mirror in RevenueCat dashboard → Entitlements. */
export const ENTITLEMENT_ID = 'paid';

/** RevenueCat offering identifier — the bundle of packages shown to the
 *  user. We only have one offering ("default") today; future regional
 *  pricing tiers would live in additional offerings. Mirror in
 *  RevenueCat dashboard → Offerings. */
export const OFFERING_ID = 'default';
