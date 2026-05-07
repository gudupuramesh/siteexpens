/**
 * deleteProjectCascade — wipe a project + every byte and doc attached
 * to it. No orphans in Firestore, no orphans in Cloudflare R2.
 *
 * Why a Cloud Function: the cascade touches ~10 Firestore collections
 * across hundreds-to-thousands of docs and potentially thousands of
 * R2 objects. Doing this from the mobile client would (a) require
 * far more permissions in firestore.rules than we want to grant,
 * (b) be brittle if the user's network drops mid-cascade, and (c)
 * be slow because every R2 delete is a separate round-trip. The
 * function uses Admin SDK (bypasses rules), batched Firestore
 * writes (500 ops/batch), and S3 `DeleteObjects` bulk requests
 * (1000 keys/batch).
 *
 * Phases (each phase is idempotent — safe to retry on failure):
 *   1. Auth + project-membership check (caller must be in the org)
 *   2. Collect every R2 key for this project from `storageEvents`
 *      (this is the *only* reliable source — `tasks.photoUris[]`
 *      and `dpr.photoUris[]` store URLs only, no keys, so a doc-
 *      walk would miss those bytes; the events log catches
 *      everything ever uploaded under the project's umbrella)
 *   3. Bulk-delete R2 objects (DeleteObjects in batches of 1000)
 *   4. Cascade-delete Firestore docs:
 *        - tasks (drain `updates` + `comments` subcollections first)
 *        - transactions, designs, attendance, dpr, laminates,
 *          whiteboards, materials, materialRequests, storageEvents
 *        - projectStorage/{projectId} (running totals doc)
 *   5. Delete the project doc itself (last — every prior step
 *      validates membership by reading projects/{id}.orgId)
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { DeleteObjectsCommand, type ObjectIdentifier } from '@aws-sdk/client-s3';

import { buildR2Client } from './r2Client';

const R2_ACCOUNT_ID = defineSecret('R2_ACCOUNT_ID');
const R2_ACCESS_KEY_ID = defineSecret('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = defineSecret('R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = defineSecret('R2_BUCKET_NAME');

/** Top-level Firestore collections that link to a project via a
 *  `projectId` field. `tasks` is handled separately because of its
 *  subcollections; the project doc itself is also handled separately. */
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
] as const;

/** R2 supports DeleteObjects with up to 1000 keys per request. */
const R2_BATCH_SIZE = 1000;

/** Firestore batch limit is 500 ops; keep some safety margin. */
const FS_BATCH_SIZE = 400;

type CascadeResult = {
  ok: true;
  /** Number of R2 objects we attempted to delete. */
  deletedR2: number;
  /** Number of Firestore docs deleted (excluding the project doc). */
  deletedDocs: number;
};

export const deleteProjectCascade = onCall(
  {
    region: 'us-central1',
    // Large projects can have thousands of files. Give the cascade
    // up to 9 minutes to finish.
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: [R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME],
  },
  async (request): Promise<CascadeResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign-in is required.');
    }
    const data = request.data as { projectId?: string } | undefined;
    const projectId = data?.projectId;
    if (!projectId || typeof projectId !== 'string') {
      throw new HttpsError('invalid-argument', '`projectId` is required.');
    }

    const db = getFirestore();

    // ── Phase 1: auth + project-membership check ─────────────────
    const projRef = db.collection('projects').doc(projectId);
    const projSnap = await projRef.get();
    if (!projSnap.exists) {
      // Already gone — nothing to do. Return success so retries are
      // idempotent.
      return { ok: true, deletedR2: 0, deletedDocs: 0 };
    }
    const orgId = projSnap.get('orgId') as string | undefined;
    if (!orgId) {
      throw new HttpsError('failed-precondition', 'Project has no orgId.');
    }
    const orgSnap = await db.collection('organizations').doc(orgId).get();
    if (!orgSnap.exists) {
      throw new HttpsError('not-found', 'Organization does not exist.');
    }
    const memberIds = (orgSnap.get('memberIds') as string[] | undefined) ?? [];
    if (!memberIds.includes(uid)) {
      throw new HttpsError('permission-denied', 'You are not a member of this project.');
    }

    // ── Phase 2: collect every R2 key for this project ───────────
    // storageEvents is the canonical source — every successful upload
    // is logged with its key. Pulling 'upload' events catches keys
    // even when the parent doc only stores URLs (tasks.photoUris[],
    // dpr.photoUris[]). DeleteObjects is idempotent, so re-attempting
    // a key whose object is already gone (e.g. logged 'delete' later)
    // is harmless.
    const r2Keys = new Set<string>();

    // Project cover — usually also in storageEvents, but include from
    // the doc itself as a belt-and-braces fallback for very old
    // projects whose cover predates the storage tracking system.
    const coverKey = projSnap.get('photoR2Key') as string | undefined;
    if (coverKey) r2Keys.add(coverKey);

    const eventsSnap = await db
      .collection('storageEvents')
      .where('projectId', '==', projectId)
      .where('action', '==', 'upload')
      .get();
    for (const d of eventsSnap.docs) {
      const k = d.get('key') as string | undefined;
      if (k) r2Keys.add(k);
    }

    // ── Phase 3: bulk-delete R2 objects ──────────────────────────
    let deletedR2 = 0;
    if (r2Keys.size > 0) {
      const s3 = buildR2Client({
        accountId: R2_ACCOUNT_ID.value(),
        accessKeyId: R2_ACCESS_KEY_ID.value(),
        secretAccessKey: R2_SECRET_ACCESS_KEY.value(),
      });
      const allKeys = [...r2Keys];
      for (let i = 0; i < allKeys.length; i += R2_BATCH_SIZE) {
        const batch = allKeys.slice(i, i + R2_BATCH_SIZE);
        const objects: ObjectIdentifier[] = batch.map((Key) => ({ Key }));
        try {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: R2_BUCKET_NAME.value(),
              Delete: { Objects: objects, Quiet: true },
            }),
          );
          deletedR2 += batch.length;
        } catch (e) {
          // Best-effort. An orphan in R2 is a small recoverable cost
          // ($0.015/GB-month); failing the whole cascade because one
          // batch errored would be worse — the Firestore wipe still
          // runs and the user's project disappears. A future sweep
          // can reclaim the bytes.
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[deleteProjectCascade] R2 batch ${i}-${i + batch.length} failed: ${msg}`);
        }
      }
    }

    // ── Phase 4: cascade-delete Firestore docs ───────────────────
    let deletedDocs = 0;

    // 4a. Tasks — drain subcollections (updates, comments) first so
    // we don't leave orphan child docs after the parent task goes.
    const tasksSnap = await db
      .collection('tasks')
      .where('projectId', '==', projectId)
      .get();
    for (const taskDoc of tasksSnap.docs) {
      for (const sub of ['updates', 'comments']) {
        const subSnap = await taskDoc.ref.collection(sub).get();
        if (subSnap.size > 0) {
          deletedDocs += await batchDelete(
            db,
            subSnap.docs.map((d) => d.ref),
          );
        }
      }
    }
    deletedDocs += await batchDelete(
      db,
      tasksSnap.docs.map((d) => d.ref),
    );

    // 4b. All other top-level project-scoped collections.
    for (const col of PROJECT_SCOPED_COLLECTIONS) {
      const snap = await db
        .collection(col)
        .where('projectId', '==', projectId)
        .get();
      if (snap.size > 0) {
        deletedDocs += await batchDelete(
          db,
          snap.docs.map((d) => d.ref),
        );
      }
    }

    // 4c. projectStorage/{projectId} — running totals doc, id is the
    // project id (not queried by `projectId` field).
    try {
      await db.collection('projectStorage').doc(projectId).delete();
      deletedDocs += 1;
    } catch (e) {
      // Already gone or never existed — fine.
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[deleteProjectCascade] projectStorage delete: ${msg}`);
    }

    // ── Phase 5: delete the project doc ──────────────────────────
    await projRef.delete();

    return { ok: true, deletedR2, deletedDocs };
  },
);

/**
 * Delete an array of Firestore docs in batches of 400 (under the 500
 * ops-per-batch limit, with margin for any retry overhead). Returns
 * the number of docs deleted. Idempotent — re-running over already-
 * deleted refs is harmless.
 */
async function batchDelete(
  db: FirebaseFirestore.Firestore,
  refs: FirebaseFirestore.DocumentReference[],
): Promise<number> {
  let count = 0;
  for (let i = 0; i < refs.length; i += FS_BATCH_SIZE) {
    const slice = refs.slice(i, i + FS_BATCH_SIZE);
    const batch = db.batch();
    for (const ref of slice) batch.delete(ref);
    await batch.commit();
    count += slice.length;
  }
  return count;
}
