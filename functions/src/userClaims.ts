/**
 * User token-claim sync. The authoritative source of role is
 * `organizations/{orgId}.roles[uid]`; this module mirrors that into
 * Firebase Auth custom claims so the client can know the user's role
 * synchronously from the auth token (no Firestore round-trip).
 *
 * Two exports:
 *   - `refreshUserClaims(uid)` — internal helper used by other
 *     callables (inviteMember / claimInvites / setMemberRole /
 *     setPrimaryOrganization / removeMember) to keep claims in sync
 *     after they mutate org membership / roles.
 *   - `forceRefreshClaims` — onCall wrapper so the client can
 *     manually trigger a recompute (e.g. on app launch as a safety
 *     net, or when the claims look stale after a long offline gap).
 *
 * Claim shape (kept under Firebase's 1KB limit):
 *
 *   {
 *     orgs: { [orgId: string]: RoleKey }, // ~30B per membership
 *     primaryOrgId: string,                // ~28B
 *   }
 *
 * Reading on the client:
 *   const t = await user.getIdTokenResult();
 *   const role = (t.claims.orgs as any)?.[t.claims.primaryOrgId as string];
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/** Mirror of the app-side `RoleKey`. Keep in sync with
 *  `src/features/org/types.ts`. */
type RoleKey =
  | 'superAdmin'
  | 'admin'
  | 'manager'
  | 'accountant'
  | 'siteEngineer'
  | 'supervisor'
  | 'viewer'
  | 'client';

type UserClaims = {
  orgs: Record<string, RoleKey>;
  primaryOrgId: string;
};

/**
 * Walk every organization the user is in and emit
 * `{ orgs: { orgId: role }, primaryOrgId }`.
 *
 * Membership is computed as the UNION of:
 *   - `organizations/*` where `memberIds` contains uid (real members)
 *   - `organizations/*` where `roles[uid]` is set (clients aren't in
 *     memberIds — they live only in `projects.clientUids` + a roles
 *     entry; we surface them here so client-only memberships also
 *     get a token claim).
 *
 * Role for each org follows the same backfill rule as the rest of
 * the app: explicit `roles[uid]` wins; otherwise ownerId → superAdmin,
 * memberIds → admin.
 */
export async function computeUserClaims(uid: string): Promise<UserClaims> {
  const db = getFirestore();

  // 1. Primary org id — read straight off the user doc; users can be
  //    in multiple orgs but only one is "active" at a time.
  const userSnap = await db.collection('users').doc(uid).get();
  const primaryOrgId =
    userSnap.exists && typeof userSnap.get('primaryOrgId') === 'string'
      ? (userSnap.get('primaryOrgId') as string)
      : '';

  // 2. Pull every org membership we can find. Two parallel queries
  //    cover the union (members + clients).
  const [membersSnap, rolesSnap] = await Promise.all([
    db.collection('organizations').where('memberIds', 'array-contains', uid).get(),
    // Firestore can't query map keys directly, so for clients we fall
    // back to scanning every org — fine at our scale (<1k orgs total).
    // Replace with a denormalised `users/{uid}.memberOrgIds` field if
    // that ever stops being true.
    db.collection('organizations').get(),
  ]);

  const orgs: Record<string, RoleKey> = {};

  for (const doc of membersSnap.docs) {
    const role = roleForOrg(doc.data() as Record<string, unknown>, uid);
    if (role) orgs[doc.id] = role;
  }
  for (const doc of rolesSnap.docs) {
    if (orgs[doc.id]) continue; // already covered by the members query
    const data = doc.data() as Record<string, unknown>;
    const rolesMap = data.roles as Record<string, RoleKey> | undefined;
    if (rolesMap?.[uid]) {
      orgs[doc.id] = rolesMap[uid];
    }
  }

  return { orgs, primaryOrgId };
}

/** Compute the effective role for `uid` inside one org doc. Mirrors
 *  `effectiveOrgRole` in `firestore.rules` and `usePermissions`. */
function roleForOrg(data: Record<string, unknown>, uid: string): RoleKey | null {
  const rolesMap = data.roles as Record<string, RoleKey> | undefined;
  if (rolesMap?.[uid]) return rolesMap[uid];
  if (data.ownerId === uid) return 'superAdmin';
  const members = data.memberIds as string[] | undefined;
  if (members?.includes(uid)) return 'admin';
  return null;
}

/**
 * Recompute and write fresh custom claims for `uid`. Idempotent —
 * call it any time membership or role might have changed:
 *   - after `inviteMember` adds the user to a new org
 *   - after `claimInvites` adds the user to one or more orgs
 *   - after `setMemberRole` changes the user's role in some org
 *   - after `setPrimaryOrganization` changes the active org
 *   - after `removeMember` drops the user from an org
 *
 * Failures are logged but never thrown. The caller has already
 * persisted the underlying Firestore writes; the claims sync is a
 * "fast path cache" that the client falls back from gracefully if
 * it ever sees stale data (`usePermissions` reads Firestore as a
 * safety net during the first few seconds of mismatch).
 */
export async function refreshUserClaims(uid: string): Promise<void> {
  try {
    const claims = await computeUserClaims(uid);
    await getAuth().setCustomUserClaims(uid, claims);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[refreshUserClaims] failed for uid=${uid}: ${msg}`);
  }
}

/**
 * Client-callable: refresh the CALLER's own claims. Used as a safety
 * net by the client at app launch (in case server-side refresh missed)
 * and by the org switcher to confirm new claims are live before
 * re-rendering.
 *
 * The client must call `user.getIdToken({ forceRefresh: true })` AFTER
 * this returns to actually pull the new claims into the local token.
 */
export const forceRefreshClaims = onCall<unknown, Promise<{ ok: true }>>(
  { region: 'us-central1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    await refreshUserClaims(uid);
    return { ok: true as const };
  },
);
