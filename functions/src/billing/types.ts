/**
 * Server-side billing types.
 *
 * Mirror of `src/features/billing/types.ts` — keep in lock-step.
 * The webhook writes Subscription docs the client reads back via
 * `useSubscription`, so any drift would surface as a runtime
 * type mismatch.
 */
import type { Timestamp } from 'firebase-admin/firestore';

export type PlanTier = 'free' | 'solo' | 'studio' | 'agency';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'expired';

export type SubscriptionPeriod = 'monthly' | 'annual';

export type Subscription = {
  tier: PlanTier;
  status: SubscriptionStatus;
  expiresAt: Timestamp | null;
  willRenew: boolean;
  revenueCatId: string | null;
  productId: string | null;
  period: SubscriptionPeriod | null;
  /** Server-side, this is set to FieldValue.serverTimestamp() at write time.
   *  The type is `null` here because that's what the client reads after
   *  the SDK resolves the sentinel — the value is never inspected as a
   *  Timestamp on the server. */
  updatedAt: Timestamp | null;
  source: 'webhook' | 'manual' | 'migration' | 'init';
};
