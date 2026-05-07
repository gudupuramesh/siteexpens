/**
 * `setMemberRole` — server-only mutation of `organizations/{orgId}.roles[uid]`.
 *
 * Why this exists: Firestore rules block ALL client writes to the
 * `roles` map (closes the self-promotion hole where any member could
 * `update organizations/{id}` and rewrite their own role to admin).
 * The only path that mutates roles is through this callable, which:
 *
 *   1. Verifies the caller has high-enough role to grant the target
 *      role (Super Admin can grant any; Admin can grant non-admin).
 *   2. Mirrors the role transition into project membership: if a
 *      member is changed to `client` they're moved from
 *      `projects.memberIds` → `projects.clientUids`; the reverse for
 *      a client being promoted out.
 *   3. Refreshes the target user's auth-token claims so their next
 *      token rotation surfaces the new role without any
 *      Firestore round-trip on the client.
 *
 * The caller (the Team & Roles screen) used to do all of this
 * client-side; that path is removed in this PR.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore';

import { refreshUserClaims } from './userClaims';

const ASSIGNABLE_ROLES = [
  'admin',
  'manager',
  'accountant',
  'siteEngineer',
  'supervisor',
  'viewer',
  'client',
] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
type RoleKey = AssignableRole | 'superAdmin';

type SetMemberRoleRequest = {
  orgId: string;
  /** UID of the member whose role is being changed. */
  uid: string;
  /** New role to assign. `superAdmin` is rejected — owner transfer
   *  is a separate flow and not exposed via this callable. */
  role: AssignableRole;
};

type SetMemberRoleResponse = { ok: true };

/** Read the caller's effective role inside the org. Mirrors the
 *  client `usePermissions` and the Firestore-rules `effectiveOrgRole`
 *  so all three paths agree. */
async function readEffectiveRole(orgId: string, uid: string): Promise<RoleKey | null> {
  const db = getFirestore();
  const snap = await db.collection('organizations').doc(orgId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown> | undefined;
  const roles = data?.roles as Record<string, RoleKey> | undefined;
  if (roles?.[uid]) return roles[uid];
  if (data?.ownerId === uid) return 'superAdmin';
  const members = data?.memberIds as string[] | undefined;
  if (members?.includes(uid)) return 'admin';
  return null;
}

export const setMemberRole = onCall<SetMemberRoleRequest, Promise<SetMemberRoleResponse>>(
  { region: 'us-central1' },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const data = request.data;
    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Request body is missing.');
    }
    const { orgId, uid: targetUid, role: newRole } = data;
    if (typeof orgId !== 'string' || !orgId) {
      throw new HttpsError('invalid-argument', '`orgId` is required.');
    }
    if (typeof targetUid !== 'string' || !targetUid) {
      throw new HttpsError('invalid-argument', '`uid` is required.');
    }
    if (typeof newRole !== 'string' || !ASSIGNABLE_ROLES.includes(newRole as AssignableRole)) {
      throw new HttpsError(
        'invalid-argument',
        `\`role\` must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
      );
    }
    if (callerUid === targetUid) {
      throw new HttpsError(
        'invalid-argument',
        'You cannot change your own role. Ask another Admin / Super Admin.',
      );
    }

    const callerRole = await readEffectiveRole(orgId, callerUid);
    if (callerRole !== 'superAdmin' && callerRole !== 'admin') {
      throw new HttpsError(
        'permission-denied',
        'Only Super Admin or Admin can change member roles.',
      );
    }

    // Promotion to `admin` is reserved for Super Admin per the docs.
    // (Demotion FROM admin → other roles is also Super-Admin-only,
    // which we enforce by reading the OLD role below.)
    if (newRole === 'admin' && callerRole !== 'superAdmin') {
      throw new HttpsError(
        'permission-denied',
        'Only Super Admin can grant the Admin role.',
      );
    }

    const db = getFirestore();
    const orgRef = db.collection('organizations').doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      throw new HttpsError('not-found', 'Organization not found.');
    }
    const orgData = orgSnap.data() as Record<string, unknown>;
    const currentRoles = (orgData.roles as Record<string, RoleKey>) ?? {};
    const oldRole = currentRoles[targetUid] ?? null;

    if (oldRole === 'superAdmin') {
      throw new HttpsError(
        'permission-denied',
        'Super Admin cannot be demoted. Transfer ownership first.',
      );
    }
    if (oldRole === 'admin' && callerRole !== 'superAdmin') {
      throw new HttpsError(
        'permission-denied',
        'Only Super Admin can change an Admin’s role.',
      );
    }

    if (oldRole === newRole) {
      // No-op. Don't bother refreshing claims either.
      return { ok: true as const };
    }

    // Mirror the role transition into project membership when the
    // user is moving in/out of the `client` role. Clients live in
    // `projects.clientUids` (read-only access); everyone else lives
    // in `projects.memberIds`. Done in chunks of ~400 to stay under
    // Firestore's per-batch 500-op limit.
    const wasClient = oldRole === 'client';
    const nowClient = newRole === 'client';
    if (wasClient !== nowClient) {
      const projectsSnap = await db
        .collection('projects')
        .where('orgId', '==', orgId)
        .get();
      const affected = projectsSnap.docs.filter((d) => {
        const v = d.data() as { memberIds?: string[]; clientUids?: string[] };
        if (nowClient) return v.memberIds?.includes(targetUid);
        return v.clientUids?.includes(targetUid);
      });
      for (let i = 0; i < affected.length; i += 400) {
        const slice = affected.slice(i, i + 400);
        const batch = db.batch();
        for (const doc of slice) {
          if (nowClient) {
            batch.update(doc.ref, {
              memberIds: FieldValue.arrayRemove(targetUid),
              clientUids: FieldValue.arrayUnion(targetUid),
            });
          } else {
            batch.update(doc.ref, {
              clientUids: FieldValue.arrayRemove(targetUid),
              memberIds: FieldValue.arrayUnion(targetUid),
            });
          }
        }
        await batch.commit();
      }
    }

    // Org-level role write — also keep `memberIds` in sync. Clients
    // are NOT in `memberIds` (they live only in `roles` + project
    // `clientUids`); everyone else IS in `memberIds`.
    const orgUpdate: Record<string, unknown> = {
      [`roles.${targetUid}`]: newRole,
    };
    if (nowClient && !wasClient) {
      orgUpdate.memberIds = FieldValue.arrayRemove(targetUid);
    } else if (!nowClient && wasClient) {
      orgUpdate.memberIds = FieldValue.arrayUnion(targetUid);
    }
    await orgRef.update(orgUpdate);

    // Sync the target's auth-token claims so the role change shows
    // up in `claims.orgs[orgId]` on their next token refresh. Their
    // local `useTokenClaims().refresh()` (e.g. on app foreground)
    // pulls it into the in-memory state.
    await refreshUserClaims(targetUid);

    return { ok: true as const };
  },
);
