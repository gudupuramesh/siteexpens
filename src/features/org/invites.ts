/**
 * Studio invite client — wraps the cloud-function callables that mutate
 * organization membership. Phone is the join key; the server normalizes
 * to E.164 and either adds the existing user immediately or stashes a
 * pending invite under `invites/{phone}`.
 */
import { callFunction } from '@/src/lib/firebase';
import { normalizeIndianPhoneE164 } from '@/src/lib/phone';
import { maybeWrapPlanLimitError } from '@/src/features/billing/errors';

import type { RoleKey } from './types';

/**
 * Thrown by `inviteMember` (and `removeMember` when phone-keyed)
 * when the supplied phone isn't a valid Indian mobile. Caught at
 * the call site to show an inline error instead of round-tripping
 * to the server only to be rejected.
 */
export class InvalidInvitePhoneError extends Error {
  constructor(message = 'Enter a valid 10-digit Indian phone number') {
    super(message);
    this.name = 'InvalidInvitePhoneError';
  }
}

export type InviteMemberArgs = {
  orgId: string;
  /** Raw phone string — server normalizes to E.164 before lookup. */
  phoneNumber: string;
  role: Exclude<RoleKey, 'superAdmin'>;
  /**
   * Project ids the new member should have access to. For non-superAdmin
   * roles this is the source of truth for project visibility. Empty for
   * admin/accountant means "all projects" (client-side default fills it
   * with the current org's project ids before calling).
   */
  projectIds?: string[];
  /** Legacy single-project field, kept for back-compat with old callers. */
  projectId?: string;
  /** Optional name from the contact picker (used in invite previews). */
  displayName?: string;
};

export type InviteMemberResult = {
  /** True when the invitee already had an account and was added immediately. */
  joinedNow: boolean;
  /** uid of the invitee when `joinedNow` is true. */
  uid?: string;
};

export async function inviteMember(args: InviteMemberArgs): Promise<InviteMemberResult> {
  // Pre-normalise on the client so the user gets instant feedback
  // for an invalid phone instead of a network round-trip + opaque
  // server error. The server's own normaliser
  // (`functions/src/invites.ts`) is the source of truth for the
  // rule path; this is defence in depth.
  const normalized = normalizeIndianPhoneE164(args.phoneNumber);
  if (!normalized) throw new InvalidInvitePhoneError();
  try {
    const { data } = await callFunction<InviteMemberArgs, InviteMemberResult>(
      'inviteMember',
      { ...args, phoneNumber: normalized },
    );
    return data;
  } catch (err) {
    // Translate `failed-precondition` paywall responses (member-cap
    // hit) into a typed PlanLimitError so the UI can route to the
    // paywall sheet uniformly across all four invite call sites
    // (PartyTab + 3 spots in team-roles.tsx).
    throw maybeWrapPlanLimitError(err);
  }
}

export type ClaimInvitesResult = {
  joined: { orgId: string; role: RoleKey }[];
  primaryOrgId: string | null;
  /**
   * Orgs whose pending invite was VALID but rejected because the
   * org's plan is at member capacity. The pending doc is preserved
   * server-side so the user can retry once admin frees a slot or
   * upgrades. UI can surface a toast like "Studio X is at member
   * limit — ask admin to upgrade or remove a pending invite."
   * Optional for back-compat with older function deployments.
   */
  skippedDueToCap?: { orgId: string; orgName?: string }[];
};

/** Called from AuthProvider on first sign-in to claim any pending invites. */
export async function claimInvites(): Promise<ClaimInvitesResult> {
  const { data } = await callFunction<Record<string, never>, ClaimInvitesResult>(
    'claimInvites',
    {},
  );
  return data;
}

/**
 * Re-mint the caller's auth-token custom claims from the live
 * `organizations.roles[uid]` data. Useful as a self-heal on app
 * launch / foreground when the local token has stale claims
 * (e.g. role was changed but the user's app didn't pick it up).
 *
 * The client must call `auth.getIdTokenResult({ forceRefresh: true })`
 * AFTER this returns to actually pull the new claims into the local
 * cache. Use `useTokenClaims().refresh(true)` to do both in one
 * step.
 */
export async function forceRefreshClaims(): Promise<{ ok: true }> {
  const { data } = await callFunction<Record<string, never>, { ok: true }>(
    'forceRefreshClaims',
    {},
  );
  return data;
}

export type RemoveMemberArgs =
  | { orgId: string; uid: string }
  | { orgId: string; phoneNumber: string };

/**
 * Drops a member from this org. Accepts either:
 *  - `uid` for already-joined members, OR
 *  - `phoneNumber` for pending invitees who haven't signed up yet.
 *
 * The same callable handles both — pending and joined members are
 * treated identically in the Team and Roles UX.
 */
export async function removeMember(args: RemoveMemberArgs): Promise<{ ok: true }> {
  // For the phone-keyed branch (pending invites), normalise client-
  // side so the server lookup hits the right `invites/{E164}` doc.
  let payload: RemoveMemberArgs = args;
  if ('phoneNumber' in args) {
    const normalized = normalizeIndianPhoneE164(args.phoneNumber);
    if (!normalized) throw new InvalidInvitePhoneError();
    payload = { orgId: args.orgId, phoneNumber: normalized };
  }
  const { data } = await callFunction<RemoveMemberArgs, { ok: true }>(
    'removeMember',
    payload,
  );
  return data;
}
