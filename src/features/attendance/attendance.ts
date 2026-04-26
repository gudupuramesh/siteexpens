import firestore from '@react-native-firebase/firestore';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';
import type { AttendanceRecord, AttendanceStatus, ProjectLabour } from './types';

export type MarkAttendanceInput = {
  orgId: string;
  projectId: string;
  labourId: string;
  labourName: string;
  labourRole: string;
  description?: string;
  payRate?: number;
  payUnit?: 'day' | 'hour';
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  createdBy: string;
};

export type UpsertProjectLabourInput = {
  orgId: string;
  projectId: string;
  labourId: string;
  labourName: string;
  labourRole: string;
  description?: string;
  payRate?: number;
  payUnit?: 'day' | 'hour';
  createdBy: string;
  disabled?: boolean;
};

export function getProjectLabourDocId(projectId: string, labourId: string): string {
  return `${projectId}_${labourId}`;
}

export async function upsertProjectLabour(input: UpsertProjectLabourInput): Promise<string> {
  const docId = getProjectLabourDocId(input.projectId, input.labourId);
  const ref = db.collection('projectLabour').doc(docId);
  await ref.set(
    {
      orgId: input.orgId,
      projectId: input.projectId,
      labourId: input.labourId,
      labourName: input.labourName,
      labourRole: input.labourRole,
      ...(input.description ? { description: input.description } : {}),
      ...(input.payRate !== undefined ? { payRate: input.payRate } : {}),
      ...(input.payUnit ? { payUnit: input.payUnit } : {}),
      disabled: !!input.disabled,
      createdBy: input.createdBy,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return docId;
}

/**
 * Upsert attendance record. Uses composite key (projectId + labourId + date)
 * as doc ID so marking twice on the same day updates instead of duplicating.
 */
export async function markAttendance(input: MarkAttendanceInput): Promise<string> {
  await upsertProjectLabour({
    orgId: input.orgId,
    projectId: input.projectId,
    labourId: input.labourId,
    labourName: input.labourName,
    labourRole: input.labourRole,
    description: input.description,
    payRate: input.payRate,
    payUnit: input.payUnit,
    createdBy: input.createdBy,
    disabled: false,
  });

  const docId = `${input.projectId}_${input.labourId}_${input.date}`;
  const ref = db.collection('attendance').doc(docId);
  await ref.set({
    orgId: input.orgId,
    projectId: input.projectId,
    labourId: input.labourId,
    labourName: input.labourName,
    labourRole: input.labourRole,
    ...(input.description ? { description: input.description } : {}),
    ...(input.payRate !== undefined ? { payRate: input.payRate } : {}),
    ...(input.payUnit ? { payUnit: input.payUnit } : {}),
    disabled: false,
    date: input.date,
    status: input.status,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return docId;
}

export async function markAttendanceForDate(input: MarkAttendanceInput): Promise<string> {
  return markAttendance(input);
}

/** Update just the status field of an existing record. */
export async function updateAttendanceStatus(
  recordId: string,
  status: AttendanceStatus,
): Promise<void> {
  await db.collection('attendance').doc(recordId).update({ status });
}

export type UpdateAttendanceRecordInput = Partial<{
  labourName: string;
  labourRole: string;
  description: string;
  payRate: number;
  payUnit: 'day' | 'hour';
  status: AttendanceStatus;
  disabled: boolean;
}>;

export async function updateAttendanceRecord(
  recordId: string,
  input: UpdateAttendanceRecordInput,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.labourName !== undefined) payload.labourName = input.labourName;
  if (input.labourRole !== undefined) payload.labourRole = input.labourRole;
  if (input.description !== undefined) payload.description = input.description;
  if (input.payRate !== undefined) payload.payRate = input.payRate;
  if (input.payUnit !== undefined) payload.payUnit = input.payUnit;
  if (input.status !== undefined) payload.status = input.status;
  if (input.disabled !== undefined) payload.disabled = input.disabled;
  if (Object.keys(payload).length === 0) return;
  await db.collection('attendance').doc(recordId).update(payload);
}

export async function updateProjectLabour(
  projectId: string,
  labourId: string,
  input: Partial<Pick<ProjectLabour, 'labourName' | 'labourRole' | 'description' | 'payRate' | 'payUnit' | 'disabled'>>,
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: firestore.FieldValue.serverTimestamp() };
  if (input.labourName !== undefined) payload.labourName = input.labourName;
  if (input.labourRole !== undefined) payload.labourRole = input.labourRole;
  if (input.description !== undefined) payload.description = input.description;
  if (input.payRate !== undefined) payload.payRate = input.payRate;
  if (input.payUnit !== undefined) payload.payUnit = input.payUnit;
  if (input.disabled !== undefined) payload.disabled = input.disabled;
  await db.collection('projectLabour').doc(getProjectLabourDocId(projectId, labourId)).set(payload, { merge: true });
}

async function updateLabourRecordsInChunks(
  projectId: string,
  labourId: string,
  updater: (doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => Record<string, unknown> | null,
): Promise<number> {
  const snap = await db.collection('attendance').where('projectId', '==', projectId).get();
  const docs = snap.docs.filter((d) => (d.data() as { labourId?: string }).labourId === labourId);
  if (docs.length === 0) return 0;

  let updated = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    const batch = db.batch();
    for (const doc of chunk) {
      const payload = updater(doc);
      if (!payload || Object.keys(payload).length === 0) continue;
      batch.update(doc.ref, payload);
      updated += 1;
    }
    await batch.commit();
  }
  return updated;
}

export async function updateLabourAcrossProject(
  projectId: string,
  labourId: string,
  input: {
    labourName: string;
    labourRole: string;
    description?: string;
    payRate?: number;
    payUnit?: 'day' | 'hour';
  },
): Promise<number> {
  await updateProjectLabour(projectId, labourId, {
    labourName: input.labourName,
    labourRole: input.labourRole,
    description: input.description ?? '',
    ...(input.payRate !== undefined ? { payRate: input.payRate } : {}),
    ...(input.payUnit ? { payUnit: input.payUnit } : {}),
  });

  return updateLabourRecordsInChunks(projectId, labourId, () => ({
    labourName: input.labourName,
    labourRole: input.labourRole,
    description: input.description ?? '',
    ...(input.payRate !== undefined ? { payRate: input.payRate } : {}),
    ...(input.payUnit ? { payUnit: input.payUnit } : {}),
  }));
}

export async function setLabourDisabledAcrossProject(
  projectId: string,
  labourId: string,
  disabled: boolean,
): Promise<number> {
  await updateProjectLabour(projectId, labourId, { disabled });
  return updateLabourRecordsInChunks(projectId, labourId, () => ({ disabled }));
}

export async function deleteLabourAcrossProject(
  projectId: string,
  labourId: string,
): Promise<number> {
  const rosterRef = db.collection('projectLabour').doc(getProjectLabourDocId(projectId, labourId));
  const rosterSnap = await rosterRef.get();
  if (rosterSnap.exists()) {
    await rosterRef.delete();
  }

  const snap = await db.collection('attendance').where('projectId', '==', projectId).get();
  const docs = snap.docs.filter((d) => (d.data() as { labourId?: string }).labourId === labourId);
  if (docs.length === 0) return 0;

  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    const batch = db.batch();
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
  }
  return docs.length;
}

export function toProjectLabour(doc: FirebaseFirestoreTypes.QueryDocumentSnapshot): ProjectLabour {
  return {
    id: doc.id,
    ...(doc.data() as Omit<ProjectLabour, 'id'>),
  };
}

export function toAttendanceRecord(doc: FirebaseFirestoreTypes.QueryDocumentSnapshot): AttendanceRecord {
  return {
    id: doc.id,
    ...(doc.data() as Omit<AttendanceRecord, 'id'>),
  };
}
