/**
 * Server-side mirror of the client's product ID → (tier, period) map.
 *
 * MUST stay in lock-step with `src/features/billing/productIds.ts`.
 * Mismatched IDs would cause webhook events to fall through with
 * "Unknown product_id" warnings and the org would never get the
 * tier upgrade reflected.
 */
export type PaidTier = 'solo' | 'studio' | 'agency';
export type SubscriptionPeriod = 'monthly' | 'annual';

const PRODUCT_IDS: Record<PaidTier, Record<SubscriptionPeriod, string>> = {
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
};

export function tierAndPeriodFromProductIdServer(
  id: string,
): { tier: PaidTier; period: SubscriptionPeriod } | null {
  for (const tier of ['solo', 'studio', 'agency'] as PaidTier[]) {
    for (const period of ['monthly', 'annual'] as SubscriptionPeriod[]) {
      if (PRODUCT_IDS[tier][period] === id) return { tier, period };
    }
  }
  return null;
}
