/**
 * Typed error thrown by client wrappers around tier-gated callables
 * (`createProject`, `inviteMember`, `r2PresignedUploadUrl`-via-upload).
 *
 * Pattern:
 *   1. Server callable rejects with `failed-precondition` and
 *      `details: { reason, tier, limit }`
 *   2. `callFunction` surfaces that as `FirebaseCallableHttpError` with
 *      `code` + `details` preserved from the HTTPS body.
 *   3. Client wrapper runs `maybeWrapPlanLimitError` → `PlanLimitError`
 *      with user-facing copy (not raw server strings).
 *   4. UI catches `instanceof PlanLimitError` and calls
 *      `openPaywall({ reason: err.reason })`.
 */

import {
  FirebaseCallableHttpError,
  type FirebaseCallableErrorDetails,
} from '@/src/lib/firebase';

export type PlanLimitReason =
  | 'plan_limit_members'
  | 'plan_limit_projects'
  | 'plan_limit_storage';

export class PlanLimitError extends Error {
  constructor(
    message: string,
    public readonly reason: PlanLimitReason,
    public readonly tier: string,
    public readonly limit: number,
  ) {
    super(message);
    this.name = 'PlanLimitError';
  }
}

function tierLabel(tier: string): string {
  const labels: Record<string, string> = {
    free: 'Free',
    solo: 'Solo',
    studio: 'Studio',
    agency: 'Agency',
  };
  return labels[tier] ?? tier;
}

/** Short, product-ready copy for alerts / optional paywall headline overrides. */
function planLimitFriendlyMessage(
  reason: PlanLimitReason,
  tier: string,
  limit: number,
): string {
  const t = tierLabel(tier);
  switch (reason) {
    case 'plan_limit_members':
      if (tier === 'free') {
        return "You're on the Free plan, which includes one team member. To invite others, upgrade to Solo, Studio, or Agency.";
      }
      if (tier === 'solo' || limit <= 1) {
        return 'Your Solo plan includes one team member. Upgrade to Studio or Agency to add more seats.';
      }
      return `Your ${t} plan is limited to ${limit} team members. Upgrade to add more seats.`;
    case 'plan_limit_projects':
      if (tier === 'free' && limit <= 1) {
        return "You're on the Free plan, which supports one project. Upgrade to Solo or a higher plan to create more.";
      }
      return `Your ${t} plan is limited to ${limit} project${limit === 1 ? '' : 's'}. Upgrade to add more.`;
    case 'plan_limit_storage':
      return `Your ${t} plan has reached its storage limit. Upgrade for more space, or remove files to continue.`;
    default:
      return 'Plan limit reached.';
  }
}

function extractCallableDetails(
  err: unknown,
): FirebaseCallableErrorDetails | undefined {
  if (err instanceof FirebaseCallableHttpError) return err.details;
  const e = err as { details?: FirebaseCallableErrorDetails };
  return e?.details;
}

function extractCallableCode(err: unknown): string | undefined {
  if (err instanceof FirebaseCallableHttpError) return err.code;
  const e = err as { code?: string };
  return e?.code;
}

/** Detect the server's `failed-precondition` paywall response and
 *  rewrap as a typed `PlanLimitError`. Returns the original error
 *  unchanged when it isn't a paywall response — caller can re-throw. */
export function maybeWrapPlanLimitError(err: unknown): unknown {
  const code = extractCallableCode(err);
  const details = extractCallableDetails(err);
  const reason = details?.reason;

  if (
    code === 'failed-precondition' &&
    (reason === 'plan_limit_members' ||
      reason === 'plan_limit_projects' ||
      reason === 'plan_limit_storage')
  ) {
    const tier = details?.tier ?? 'unknown';
    const limit =
      typeof details?.limit === 'number' ? details.limit : 0;
    const msg = planLimitFriendlyMessage(reason, tier, limit);
    return new PlanLimitError(msg, reason, tier, limit);
  }
  return err;
}
