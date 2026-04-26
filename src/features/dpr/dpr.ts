import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';
import type { Weather } from './types';

export type UpsertDprInput = {
  orgId: string;
  projectId: string;
  date: string; // YYYY-MM-DD
  workDone: string;
  weather: Weather;
  weatherNote: string;
  issues: string;
  tomorrowPlan: string;
  photoUris: string[];
  staffPresent: number;
  staffTotal: number;
  materialReceivedCount: number;
  materialUsedCount: number;
  createdBy: string;
};

export function dprDocId(projectId: string, date: string): string {
  return `${projectId}_${date}`;
}

/**
 * Idempotent upsert. Writes `createdAt` only when the doc is being created;
 * `updatedAt` always. set-merge keeps other future fields untouched.
 */
export async function upsertDpr(input: UpsertDprInput): Promise<string> {
  const id = dprDocId(input.projectId, input.date);
  const ref = db.collection('dpr').doc(id);
  const snap = await ref.get();
  const payload: Record<string, unknown> = {
    orgId: input.orgId,
    projectId: input.projectId,
    date: input.date,
    workDone: input.workDone,
    weather: input.weather,
    weatherNote: input.weatherNote,
    issues: input.issues,
    tomorrowPlan: input.tomorrowPlan,
    photoUris: input.photoUris,
    staffPresent: input.staffPresent,
    staffTotal: input.staffTotal,
    materialReceivedCount: input.materialReceivedCount,
    materialUsedCount: input.materialUsedCount,
    createdBy: input.createdBy,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };
  if (!snap.exists) {
    payload.createdAt = firestore.FieldValue.serverTimestamp();
  }
  await ref.set(payload, { merge: true });
  return id;
}

export async function deleteDpr(id: string): Promise<void> {
  await db.collection('dpr').doc(id).delete();
}
