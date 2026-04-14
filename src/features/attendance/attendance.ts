import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';
import type { AttendanceStatus } from './types';

export type MarkAttendanceInput = {
  orgId: string;
  projectId: string;
  labourId: string;
  labourName: string;
  labourRole: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  createdBy: string;
};

/**
 * Upsert attendance record. Uses composite key (projectId + labourId + date)
 * as doc ID so marking twice on the same day updates instead of duplicating.
 */
export async function markAttendance(input: MarkAttendanceInput): Promise<string> {
  const docId = `${input.projectId}_${input.labourId}_${input.date}`;
  const ref = db.collection('attendance').doc(docId);
  await ref.set({
    orgId: input.orgId,
    projectId: input.projectId,
    labourId: input.labourId,
    labourName: input.labourName,
    labourRole: input.labourRole,
    date: input.date,
    status: input.status,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return docId;
}

/** Update just the status field of an existing record. */
export async function updateAttendanceStatus(
  recordId: string,
  status: AttendanceStatus,
): Promise<void> {
  await db.collection('attendance').doc(recordId).update({ status });
}
