/**
 * Keeps `organizations/{orgId}/memberPublic/{uid}` in sync for org-scoped,
 * rules-safe teammate profile reads (display surface only — no sensitive fields).
 *
 * Writers: Admin SDK only (triggers + optional backfill callable).
 * Clients read via Firestore rules: org members only.
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

const db = getFirestore();

const PROFILE_FIELDS = ['displayName', 'photoURL', 'phoneNumber'] as const;

function pickProfile(u: Record<string, unknown> | undefined): {
  displayName: string;
  photoURL: string | null;
  phoneNumber: string;
} {
  return {
    displayName: typeof u?.displayName === 'string' ? u.displayName : '',
    photoURL:
      typeof u?.photoURL === 'string'
        ? u.photoURL
        : u?.photoURL === null || u?.photoURL === undefined
          ? null
          : null,
    phoneNumber: typeof u?.phoneNumber === 'string' ? u.phoneNumber : '',
  };
}

/** Mirrors invite/removal backfill for orgs created before roles map existed. */
function effectiveRoleKey(org: Record<string, unknown>, uid: string): string {
  const roles = org.roles as Record<string, string> | undefined;
  if (roles?.[uid]) return roles[uid];
  if (org.ownerId === uid) return 'superAdmin';
  const memberIds = org.memberIds as string[] | undefined;
  if (memberIds?.includes(uid)) return 'admin';
  return 'viewer';
}

export async function writeMemberPublicDoc(
  orgId: string,
  org: Record<string, unknown>,
  uid: string,
): Promise<void> {
  const userSnap = await db.collection('users').doc(uid).get();
  const u = userSnap.data() as Record<string, unknown> | undefined;
  const p = pickProfile(u);
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('memberPublic')
    .doc(uid)
    .set(
      {
        ...p,
        roleKey: effectiveRoleKey(org, uid),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

/** Upsert/deletes memberPublic rows when org membership or roles change.
 *
 *  IMPORTANT — Membership of an org is the UNION of:
 *    • `memberIds[]`         (regular paid roles: admin / manager / etc.)
 *    • `Object.keys(roles)`  (anyone with an explicit role, INCLUDING clients
 *                             — clients deliberately do NOT live in
 *                             memberIds, see setMemberRole.ts)
 *    • `ownerId`             (always considered a member)
 *
 *  Earlier versions of this trigger only synced `memberIds`. That meant a
 *  user promoted from Manager → Client would be REMOVED from memberIds by
 *  setMemberRole, this trigger would see them as "no longer a member"
 *  and DELETE their memberPublic doc. Then the Team & Roles screen,
 *  which renders rows from memberPublic, would lose their displayName +
 *  phoneNumber and fall back to showing the raw UID. The fix below uses
 *  the union so clients keep their profile projection.
 */
export const onOrganizationWriteMemberPublic = onDocumentWritten(
  'organizations/{orgId}',
  async (event) => {
    const orgId = event.params.orgId as string;
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;

    const org = afterSnap.data() as Record<string, unknown>;
    const afterMemberIds = (org.memberIds as string[] | undefined) ?? [];
    const afterRoles = (org.roles as Record<string, string> | undefined) ?? {};
    const afterOwnerId = typeof org.ownerId === 'string' ? org.ownerId : '';

    const beforeMemberIds =
      (event.data?.before?.exists
        ? (event.data.before.data()?.memberIds as string[] | undefined)
        : undefined) ?? [];
    const beforeRoles =
      (event.data?.before?.exists
        ? (event.data.before.data()?.roles as Record<string, string> | undefined)
        : undefined) ?? {};
    const beforeOwnerId =
      event.data?.before?.exists && typeof event.data.before.data()?.ownerId === 'string'
        ? (event.data.before.data()!.ownerId as string)
        : '';

    // Union of every uid that's "in the org" in either snapshot.
    const beforeUnion = new Set<string>([
      ...beforeMemberIds,
      ...Object.keys(beforeRoles),
      ...(beforeOwnerId ? [beforeOwnerId] : []),
    ]);
    const afterUnion = new Set<string>([
      ...afterMemberIds,
      ...Object.keys(afterRoles),
      ...(afterOwnerId ? [afterOwnerId] : []),
    ]);

    // Delete memberPublic ONLY for uids that genuinely left the org
    // (gone from memberIds AND gone from roles AND not the owner).
    for (const uid of beforeUnion) {
      if (!afterUnion.has(uid)) {
        await db.collection('organizations').doc(orgId).collection('memberPublic').doc(uid).delete();
      }
    }

    // Upsert memberPublic for everyone currently in the org — regular
    // members, clients, and the owner all get a profile projection.
    for (const uid of afterUnion) {
      await writeMemberPublicDoc(orgId, org, uid);
    }
  },
);

/** Push profile/role projection when the user's public-facing fields change.
 *
 *  Scans every org the user belongs to in any capacity (memberIds OR
 *  roles map). The naïve `memberIds array-contains` query misses client
 *  memberships — those would keep showing the user's STALE profile in
 *  team-roles UIs after they updated their displayName / photoURL.
 *  Firestore doesn't support querying map keys directly, so we fan out
 *  with a parallel pair of queries and dedupe.
 */
async function findOrgsContainingUser(uid: string): Promise<Map<string, FirebaseFirestore.DocumentSnapshot>> {
  const seen = new Map<string, FirebaseFirestore.DocumentSnapshot>();

  // Path 1: efficient indexed query — orgs where the user is in memberIds.
  const memberIdsQuery = await db
    .collection('organizations')
    .where('memberIds', 'array-contains', uid)
    .get();
  for (const doc of memberIdsQuery.docs) seen.set(doc.id, doc);

  // Path 2: orgs where the user is ONLY in roles (clients). Firestore
  // can't query nested map fields cheaply, so we scan all orgs and
  // filter. Acceptable at our current scale (<1k orgs total — same
  // assumption as computeUserClaims in userClaims.ts).
  const allOrgsQuery = await db.collection('organizations').get();
  for (const doc of allOrgsQuery.docs) {
    if (seen.has(doc.id)) continue;
    const data = doc.data() as Record<string, unknown>;
    const roles = data?.roles as Record<string, string> | undefined;
    if (roles?.[uid]) seen.set(doc.id, doc);
  }

  return seen;
}

export const onUserWriteMemberPublic = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid as string;

  if (!event.data?.after?.exists) {
    // User doc deleted — wipe their projection from every org.
    const orgs = await findOrgsContainingUser(uid);
    for (const [, orgDoc] of orgs) {
      await orgDoc.ref.collection('memberPublic').doc(uid).delete();
    }
    return;
  }

  const before = event.data.before.exists ? event.data.before.data() : undefined;
  const after = event.data.after.data() as Record<string, unknown>;

  const profileChanged =
    !before || PROFILE_FIELDS.some((k) => before[k] !== after[k]);

  if (!profileChanged) return;

  const orgs = await findOrgsContainingUser(uid);
  for (const [, orgDoc] of orgs) {
    const org = orgDoc.data() as Record<string, unknown>;
    await writeMemberPublicDoc(orgDoc.id, org, uid);
  }
});

type BackfillPayload = { orgId?: string };

/** Super Admin only — fills memberPublic for an existing org after first deploy.
 *
 *  Backfills the UNION of `memberIds` + `Object.keys(roles)` + `ownerId`
 *  so existing client memberships (which the old single-source trigger
 *  may have wiped) get their profile projection rebuilt.
 */
export const backfillMemberPublic = onCall<BackfillPayload>(async (req) => {
  const caller = req.auth?.uid;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');

  const orgId = typeof req.data?.orgId === 'string' ? req.data.orgId.trim() : '';
  if (!orgId) throw new HttpsError('invalid-argument', '`orgId` is required.');

  const orgSnap = await db.collection('organizations').doc(orgId).get();
  if (!orgSnap.exists) throw new HttpsError('not-found', 'Organization not found.');

  const org = orgSnap.data() as Record<string, unknown>;
  const memberIds = (org.memberIds as string[] | undefined) ?? [];
  if (!memberIds.includes(caller) && org.ownerId !== caller) {
    throw new HttpsError('permission-denied', 'Not a member of this organization.');
  }

  if (effectiveRoleKey(org, caller) !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'Only Super Admin can run backfill.');
  }

  // Union: memberIds + roles map keys + ownerId. Same shape as the
  // trigger above — keeps client uids present.
  const roles = (org.roles as Record<string, string> | undefined) ?? {};
  const ownerId = typeof org.ownerId === 'string' ? org.ownerId : '';
  const allUids = new Set<string>([
    ...memberIds,
    ...Object.keys(roles),
    ...(ownerId ? [ownerId] : []),
  ]);

  for (const uid of allUids) {
    await writeMemberPublicDoc(orgId, org, uid);
  }

  return { ok: true as const, count: allUids.size };
});
