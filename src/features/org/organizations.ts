/**
 * Organization writes. Creating an org is an atomic two-doc operation:
 *
 *   1. organizations/{orgId}   — new document with the company profile
 *   2. users/{uid}             — patched with primaryOrgId (+ email) so
 *                                the client knows onboarding is complete
 *
 * We do both in a single batched write so a partial failure can't leave
 * the user in a half-onboarded state.
 */
import { callFunction, db, firestore } from '@/src/lib/firebase';

import type { OrganizationProfileExtras } from './types';

function omitUndefined(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export type StudioProfileOrgPatch = Partial<
  { name: string; email: string } & OrganizationProfileExtras
>;

export type StudioProfileUserPatch = Partial<{
  displayName: string;
  email: string;
  role: string;
  altEmail: string;
  altPhone: string;
}>;

/**
 * Batch-update organization profile fields and mirrored user fields (work email,
 * display name, role). Values may include `FieldValue.delete()` for clearing
 * optional scalars.
 */
export async function updateStudioProfile(args: {
  orgId: string;
  uid: string;
  org: StudioProfileOrgPatch | Record<string, unknown>;
  user: StudioProfileUserPatch | Record<string, unknown>;
}): Promise<void> {
  const orgPayload = omitUndefined(args.org as Record<string, unknown>);
  const userPayload = omitUndefined(args.user as Record<string, unknown>);
  if (Object.keys(orgPayload).length === 0 && Object.keys(userPayload).length === 0) {
    return;
  }
  const batch = db.batch();
  if (Object.keys(orgPayload).length > 0) {
    batch.update(db.collection('organizations').doc(args.orgId), orgPayload);
  }
  if (Object.keys(userPayload).length > 0) {
    batch.update(db.collection('users').doc(args.uid), userPayload);
  }
  await batch.commit();
}

export type CreateOrganizationInput = {
  /** No longer used — server reads `request.auth.uid`. Kept on the
   *  type so callers don't all need a churn change at once. */
  uid?: string;
  name: string;
  email: string;
};

/**
 * Create the user's studio. Goes through the `createOrganization`
 * Cloud Function which enforces "at most one studio owned per
 * user" — clients cannot bypass this by writing to Firestore
 * directly (the rules block direct `organizations.create`).
 *
 * Throws when the user already owns a studio. The onboarding
 * screen surfaces the message inline; the profile screen guards
 * the entry point so this case is rare in practice.
 */
export async function createOrganization({
  name,
  email,
}: CreateOrganizationInput): Promise<string> {
  const { data } = await callFunction<
    { name: string; email: string },
    { ok: true; orgId: string }
  >('createOrganization', { name, email });
  return data.orgId;
}

/** Switches active workspace after server verifies org membership. */
export async function setPrimaryOrganization(orgId: string): Promise<{ ok: true }> {
  const { data } = await callFunction<{ orgId: string }, { ok: true }>(
    'setPrimaryOrganization',
    { orgId },
  );
  return data;
}

/**
 * Mutate a member's role inside an org. Server enforces:
 *   - Caller must be Super Admin or Admin in the org.
 *   - Only Super Admin may grant or change Admin roles.
 *   - Caller cannot change their own role.
 *   - Super Admin role itself can't be assigned via this callable
 *     (use the ownership-transfer flow).
 *
 * Side effects (server-side):
 *   - Mirrors role transitions in/out of `client` into project
 *     `memberIds` ↔ `clientUids`.
 *   - Refreshes the target's auth-token custom claims.
 */
export type SetMemberRoleArgs = {
  orgId: string;
  uid: string;
  role:
    | 'admin'
    | 'manager'
    | 'accountant'
    | 'siteEngineer'
    | 'supervisor'
    | 'viewer'
    | 'client';
};

export async function setMemberRole(args: SetMemberRoleArgs): Promise<{ ok: true }> {
  const { data } = await callFunction<SetMemberRoleArgs, { ok: true }>(
    'setMemberRole',
    args,
  );
  return data;
}

/** Super Admin: populate `memberPublic` after first deploying projection triggers. */
export async function backfillMemberPublic(orgId: string): Promise<{ ok: true; count: number }> {
  const { data } = await callFunction<{ orgId: string }, { ok: true; count: number }>(
    'backfillMemberPublic',
    { orgId },
  );
  return data;
}
