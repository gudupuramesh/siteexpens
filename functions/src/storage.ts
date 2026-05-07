/**
 * Storage tracking + R2 object deletion.
 *
 * Two callables:
 *   - recordStorageEvent — append-only audit log + atomic counter bump
 *   - r2DeleteObject     — delete from R2 + automatically record the
 *                          delete as a storageEvent (counter goes
 *                          negative, fileCount drops by 1)
 *
 * Both are auth-gated and verify the caller is a member of the
 * project's organisation. Server-side counter mutations use Admin SDK
 * `FieldValue.increment` so concurrent uploads can't race the totals
 * out of sync.
 *
 * The `storageEvents` and `projectStorage` collections are written
 * ONLY by Cloud Functions — Firestore rules deny client writes — so
 * the totals can never drift from what the audit log shows.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

import { buildR2Client } from './r2Client';

// Mirror of the app-side `R2Kind` union. Keep these in lock-step.
const ALLOWED_KINDS = [
  'project_cover',
  'task_photo',
  'task_update',
  'transaction',
  'laminate',
  'dpr',
  'whiteboard_thumb',
  'design',
] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

const ALLOWED_ACTIONS = ['upload', 'delete'] as const;
type Action = (typeof ALLOWED_ACTIONS)[number];

// R2 secrets — only `r2DeleteObject` needs them; `recordStorageEvent`
// just touches Firestore.
const R2_ACCOUNT_ID = defineSecret('R2_ACCOUNT_ID');
const R2_ACCESS_KEY_ID = defineSecret('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = defineSecret('R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = defineSecret('R2_BUCKET_NAME');

// ────────────────────────────────────────────────────────────────────
// recordStorageEvent
// ────────────────────────────────────────────────────────────────────

type RecordStorageEventPayload = {
  projectId: string;
  kind: Kind;
  refId: string;
  key: string;
  sizeBytes: number;
  contentType: string;
  action: Action;
};

export const recordStorageEvent = onCall(
  { region: 'us-central1' },
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign-in is required.');
    }
    const data = request.data as Partial<RecordStorageEventPayload> | undefined;
    const validated = validateEventPayload(data);

    const db = getFirestore();

    // Verify the caller is a member of the project's org. We look up
    // the project doc, read its orgId, then check the org membership
    // doc. Cheap (one cached read each).
    const orgId = await assertCallerIsProjectMember(db, validated.projectId, uid);

    // Snapshot the caller's display name once for the event log.
    const userName = await readUserDisplayName(db, uid);

    await writeEventAndIncrement(db, {
      orgId,
      uid,
      userName,
      ...validated,
    });

    return { ok: true };
  },
);

// ────────────────────────────────────────────────────────────────────
// r2DeleteObject
// ────────────────────────────────────────────────────────────────────

type DeleteObjectPayload = {
  projectId: string;
  key: string;
  kind: Kind;
  refId: string;
  /** Bytes of the object being deleted — used for the counter
   *  decrement. If omitted, the audit log still records the event but
   *  the project total won't decrease (we have no other source of
   *  truth for the size at delete time). */
  sizeBytes?: number;
  /** MIME type of the deleted object — purely for audit clarity. */
  contentType?: string;
};

export const r2DeleteObject = onCall(
  {
    region: 'us-central1',
    secrets: [R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME],
  },
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign-in is required.');
    }
    const data = request.data as Partial<DeleteObjectPayload> | undefined;
    if (!data?.projectId || typeof data.projectId !== 'string') {
      throw new HttpsError('invalid-argument', '`projectId` is required.');
    }
    if (!data.key || typeof data.key !== 'string') {
      throw new HttpsError('invalid-argument', '`key` is required.');
    }
    if (!data.kind || !ALLOWED_KINDS.includes(data.kind as Kind)) {
      throw new HttpsError('invalid-argument', `\`kind\` must be one of: ${ALLOWED_KINDS.join(', ')}`);
    }
    if (!data.refId || typeof data.refId !== 'string') {
      throw new HttpsError('invalid-argument', '`refId` is required.');
    }

    const db = getFirestore();
    const orgId = await assertCallerIsProjectMember(db, data.projectId, uid);

    // Delete from R2.
    const s3 = buildR2Client({
      accountId: R2_ACCOUNT_ID.value(),
      accessKeyId: R2_ACCESS_KEY_ID.value(),
      secretAccessKey: R2_SECRET_ACCESS_KEY.value(),
    });
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME.value(),
          Key: data.key,
        }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpsError('internal', `R2 delete failed: ${msg}`);
    }

    const userName = await readUserDisplayName(db, uid);
    const sizeBytes = typeof data.sizeBytes === 'number' && data.sizeBytes > 0
      ? data.sizeBytes
      : 0;

    await writeEventAndIncrement(db, {
      orgId,
      uid,
      userName,
      projectId: data.projectId,
      kind: data.kind as Kind,
      refId: data.refId,
      key: data.key,
      sizeBytes,
      contentType: data.contentType ?? 'application/octet-stream',
      action: 'delete',
    });

    return { ok: true };
  },
);

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function validateEventPayload(
  data: Partial<RecordStorageEventPayload> | undefined,
): RecordStorageEventPayload {
  if (!data) {
    throw new HttpsError('invalid-argument', 'Request body is missing.');
  }
  if (!data.projectId || typeof data.projectId !== 'string') {
    throw new HttpsError('invalid-argument', '`projectId` is required.');
  }
  if (!data.kind || !ALLOWED_KINDS.includes(data.kind as Kind)) {
    throw new HttpsError('invalid-argument', `\`kind\` must be one of: ${ALLOWED_KINDS.join(', ')}`);
  }
  if (!data.refId || typeof data.refId !== 'string') {
    throw new HttpsError('invalid-argument', '`refId` is required.');
  }
  if (!data.key || typeof data.key !== 'string') {
    throw new HttpsError('invalid-argument', '`key` is required.');
  }
  if (typeof data.sizeBytes !== 'number' || data.sizeBytes < 0) {
    throw new HttpsError('invalid-argument', '`sizeBytes` must be a non-negative number.');
  }
  if (!data.contentType || typeof data.contentType !== 'string') {
    throw new HttpsError('invalid-argument', '`contentType` is required.');
  }
  if (!data.action || !ALLOWED_ACTIONS.includes(data.action as Action)) {
    throw new HttpsError('invalid-argument', `\`action\` must be one of: ${ALLOWED_ACTIONS.join(', ')}`);
  }
  return data as RecordStorageEventPayload;
}

async function assertCallerIsProjectMember(
  db: FirebaseFirestore.Firestore,
  projectId: string,
  uid: string,
): Promise<string> {
  const projSnap = await db.collection('projects').doc(projectId).get();
  if (!projSnap.exists) {
    throw new HttpsError('not-found', 'Project does not exist.');
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
  return orgId;
}

async function readUserDisplayName(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<string> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    return (snap.get('displayName') as string | undefined) ?? '';
  } catch {
    return '';
  }
}

/** Write the audit event AND bump the project totals atomically.
 *  Sign of the increment is driven by `action` (upload = +, delete = -). */
async function writeEventAndIncrement(
  db: FirebaseFirestore.Firestore,
  entry: {
    orgId: string;
    uid: string;
    userName: string;
    projectId: string;
    kind: Kind;
    refId: string;
    key: string;
    sizeBytes: number;
    contentType: string;
    action: Action;
  },
): Promise<void> {
  const sign = entry.action === 'upload' ? 1 : -1;
  const eventRef = db.collection('storageEvents').doc();
  const totalsRef = db.collection('projectStorage').doc(entry.projectId);

  const batch = db.batch();
  batch.set(eventRef, {
    orgId: entry.orgId,
    projectId: entry.projectId,
    kind: entry.kind,
    refId: entry.refId,
    key: entry.key,
    sizeBytes: entry.sizeBytes,
    contentType: entry.contentType,
    action: entry.action,
    userId: entry.uid,
    userName: entry.userName,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(
    totalsRef,
    {
      orgId: entry.orgId,
      projectId: entry.projectId,
      totalBytes: FieldValue.increment(sign * entry.sizeBytes),
      fileCount: FieldValue.increment(sign * 1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
}
