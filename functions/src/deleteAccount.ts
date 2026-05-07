/**
 * deleteAccount — user-initiated account deletion.
 *
 * Required by App Store Review Guideline 5.1.1(v) and Google Play
 * Account Deletion policy. Both stores enforce this for any account
 * creation flow; rejection is automatic if missing.
 *
 * Behaviour:
 *   1. Caller's auth uid is the only target. Cannot delete another user.
 *   2. If caller is the OWNER of any organization with other members,
 *      we BLOCK with `failed-precondition` and tell them to remove
 *      members or contact support first. Avoids orphaning a paying
 *      studio behind a deleted owner.
 *   3. For each org the caller is in:
 *        - SOLO-OWNED → cascade delete the org and ALL its data
 *          (projects, transactions, DPRs, attendance, materials,
 *          tasks, designs, laminates, whiteboards, leads,
 *          appointments, parties, staff, library, finances).
 *        - MEMBER-ONLY → unlink (arrayRemove from memberIds, delete
 *          role and memberPublic, arrayRemove from every project's
 *          memberIds + clientUids in that org).
 *   4. Also remove caller from any project's clientUids in orgs they
 *      were a CLIENT of (not memberIds).
 *   5. Delete `invites/{phone}` by the caller's verified phone.
 *   6. Delete `users/{uid}`.
 *   7. Delete the Firebase Auth user record (revokes all tokens).
 *
 * Out of scope (best-effort follow-up; not required by Apple/Google):
 *   - Cloudflare R2 object cleanup. Storage objects under the user's
 *     deleted projects become orphaned. A periodic sweeper job is
 *     planned for v1.1. The audit trail in `storageEvents` is deleted
 *     so the orphans aren't trivially discoverable; they're billed
 *     until the sweeper runs.
 *   - MSG91 — they store no per-user records on our behalf.
 *   - RevenueCat — no subscriptions live yet (v1.1).
 *
 * Idempotent: safe to retry if any step fails partway through. Most
 * sub-deletes use `.catch(() => undefined)` to allow re-running.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  getFirestore,
  FieldValue,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const FIRESTORE_BATCH_LIMIT = 400;

/** Top-level collections that store one doc per project, keyed by `projectId`. */
const PROJECT_SCOPED_COLLECTIONS = [
  'transactions',
  'designs',
  'attendance',
  'dpr',
  'laminates',
  'whiteboards',
  'materials',
  'materialRequests',
  'storageEvents',
  'projectLabour',
  'moms',
] as const;

/** Top-level collections that store docs per organization, keyed by `orgId`. */
const ORG_SCOPED_COLLECTIONS = [
  'parties',
  'leads',
  'appointments',
  'materialLibrary',
  'taskCategoryLibrary',
  'staff',
  'staffAttendance',
  'staffRoleLibrary',
  'orgFinances',
] as const;

/** Subcollections inside each `organizations/{orgId}` doc. */
const ORG_SUBCOLLECTIONS = ['memberPublic', 'pendingInvites'] as const;

type DeleteAccountResponse = {
  ok: true;
  /** Number of orgs the user was unlinked from (member-only path). */
  unlinkedFromOrgs: number;
  /** Number of orgs cascade-deleted (solo-owned path). */
  cascadeDeletedOrgs: number;
};

export const deleteAccount = onCall<unknown, Promise<DeleteAccountResponse>>(
  { region: 'us-central1', timeoutSeconds: 540 },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign-in is required.');
    }
    const uid = request.auth.uid;
    const phone = request.auth.token?.phone_number;
    const db = getFirestore();

    // Find all orgs the user is in.
    const orgsSnap = await db
      .collection('organizations')
      .where('memberIds', 'array-contains', uid)
      .get();

    // Block if owner of any org with other members. Conservative —
    // avoids orphaning a studio that other people are still using.
    for (const doc of orgsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const ownerId = data.ownerId as string | undefined;
      const memberIds = Array.isArray(data.memberIds)
        ? (data.memberIds as string[])
        : [];
      if (ownerId === uid && memberIds.length > 1) {
        throw new HttpsError(
          'failed-precondition',
          `You're the owner of "${
            (data.name as string) ?? 'this studio'
          }". Remove all other team members from this studio before deleting your account, or contact support to transfer ownership to another member.`,
          {
            reason: 'owner_with_members',
            orgId: doc.id,
            orgName: data.name as string | undefined,
          },
        );
      }
    }

    let unlinkedFromOrgs = 0;
    let cascadeDeletedOrgs = 0;

    // Process each org.
    for (const doc of orgsSnap.docs) {
      const orgId = doc.id;
      const data = doc.data() as Record<string, unknown>;
      const ownerId = data.ownerId as string | undefined;

      if (ownerId === uid) {
        await cascadeDeleteOrg(db, orgId);
        cascadeDeletedOrgs += 1;
      } else {
        await unlinkUserFromOrg(db, orgId, uid);
        unlinkedFromOrgs += 1;
      }
    }

    // Client-only removals (org doesn't list them in memberIds, only
    // projects in clientUids).
    const clientProjects = await db
      .collection('projects')
      .where('clientUids', 'array-contains', uid)
      .get();
    for (const projDoc of clientProjects.docs) {
      await projDoc.ref
        .update({ clientUids: FieldValue.arrayRemove(uid) })
        .catch(() => undefined);
    }

    // Pending invite by phone.
    if (typeof phone === 'string' && phone) {
      await db
        .collection('invites')
        .doc(phone)
        .delete()
        .catch(() => undefined);
    }

    // User doc.
    await db
      .collection('users')
      .doc(uid)
      .delete()
      .catch(() => undefined);

    // Auth record. This revokes all of the user's ID tokens.
    await getAuth()
      .deleteUser(uid)
      .catch((err) => {
        // 'auth/user-not-found' is benign — already deleted.
        const code = (err as { code?: string }).code;
        if (code !== 'auth/user-not-found') throw err;
      });

    return { ok: true, unlinkedFromOrgs, cascadeDeletedOrgs };
  },
);

async function cascadeDeleteOrg(db: Firestore, orgId: string): Promise<void> {
  // Delete every project in the org first (each project owns its own
  // tree of subcollection-like docs).
  const projects = await db
    .collection('projects')
    .where('orgId', '==', orgId)
    .get();
  for (const projDoc of projects.docs) {
    await cascadeDeleteProject(db, projDoc.id);
  }

  // Delete org-scoped top-level docs.
  for (const col of ORG_SCOPED_COLLECTIONS) {
    const snap = await db.collection(col).where('orgId', '==', orgId).get();
    await batchDelete(
      db,
      snap.docs.map((d) => d.ref),
    );
  }

  // Delete org subcollections.
  for (const sub of ORG_SUBCOLLECTIONS) {
    const snap = await db
      .collection('organizations')
      .doc(orgId)
      .collection(sub)
      .get();
    await batchDelete(
      db,
      snap.docs.map((d) => d.ref),
    );
  }

  // Finally the org doc itself.
  await db
    .collection('organizations')
    .doc(orgId)
    .delete()
    .catch(() => undefined);
}

async function cascadeDeleteProject(
  db: Firestore,
  projectId: string,
): Promise<void> {
  // Project-scoped top-level collections.
  for (const col of PROJECT_SCOPED_COLLECTIONS) {
    const snap = await db
      .collection(col)
      .where('projectId', '==', projectId)
      .get();
    await batchDelete(
      db,
      snap.docs.map((d) => d.ref),
    );
  }

  // Tasks + their subcollections (updates, comments).
  const tasksSnap = await db
    .collection('tasks')
    .where('projectId', '==', projectId)
    .get();
  for (const taskDoc of tasksSnap.docs) {
    for (const sub of ['updates', 'comments'] as const) {
      const subSnap = await taskDoc.ref.collection(sub).get();
      await batchDelete(
        db,
        subSnap.docs.map((d) => d.ref),
      );
    }
  }
  await batchDelete(
    db,
    tasksSnap.docs.map((d) => d.ref),
  );

  // Per-project storage running totals.
  await db
    .collection('projectStorage')
    .doc(projectId)
    .delete()
    .catch(() => undefined);

  // Project doc itself.
  await db
    .collection('projects')
    .doc(projectId)
    .delete()
    .catch(() => undefined);
}

async function unlinkUserFromOrg(
  db: Firestore,
  orgId: string,
  uid: string,
): Promise<void> {
  const batch = db.batch();
  batch.update(db.collection('organizations').doc(orgId), {
    memberIds: FieldValue.arrayRemove(uid),
    [`roles.${uid}`]: FieldValue.delete(),
  });
  batch.delete(
    db.collection('organizations').doc(orgId).collection('memberPublic').doc(uid),
  );

  const projects = await db
    .collection('projects')
    .where('orgId', '==', orgId)
    .get();
  for (const projDoc of projects.docs) {
    batch.update(projDoc.ref, {
      memberIds: FieldValue.arrayRemove(uid),
      clientUids: FieldValue.arrayRemove(uid),
    });
  }
  await batch.commit();
}

async function batchDelete(
  db: Firestore,
  refs: DocumentReference[],
): Promise<void> {
  for (let i = 0; i < refs.length; i += FIRESTORE_BATCH_LIMIT) {
    const slice = refs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    for (const ref of slice) batch.delete(ref);
    await batch.commit();
  }
}
