import { firestore } from '@/src/lib/firebase';
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
  materialRequestedCount: number;
  materialRequestedValue: number;
  materialReceivedCount: number;
  materialUsedCount: number;
  createdBy: string;
  /**
   * Whether the doc already exists. Caller knows this from the
   * `useDpr` snapshot — passing it in lets us SKIP the pre-write
   * `.get()` call. That get would fire the dpr-read rule against
   * the existing doc, which silently denied for any legacy doc
   * missing `orgId` (the rule used direct field access). We avoid
   * the read entirely; the rule on the actual `set` is the only
   * gate now.
   */
  isUpdate: boolean;
};

export function dprDocId(projectId: string, date: string): string {
  return `${projectId}_${date}`;
}

/**
 * Idempotent upsert. Writes `createdAt` only when the doc is being created;
 * `updatedAt` always. set-merge keeps other future fields untouched.
 *
 * No pre-read — caller passes `isUpdate` based on the snapshot they
 * already have, so we never trigger the dpr-read rule. Avoids the
 * "Missing or insufficient permissions" denial that legacy docs with
 * sparse fields would cause on the read step.
 */
export async function upsertDpr(input: UpsertDprInput): Promise<string> {
  const id = dprDocId(input.projectId, input.date);
  const ref = db.collection('dpr').doc(id);
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
    materialRequestedCount: input.materialRequestedCount,
    materialRequestedValue: input.materialRequestedValue,
    materialReceivedCount: input.materialReceivedCount,
    materialUsedCount: input.materialUsedCount,
    createdBy: input.createdBy,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };
  if (!input.isUpdate) {
    payload.createdAt = firestore.FieldValue.serverTimestamp();
  }
  try {
    await ref.set(payload, { merge: true });
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : 'unknown';
    // Surface the orgId/projectId in the error so a real permission
    // denial is debuggable from a single stack trace instead of
    // requiring the user to share more context.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Save DPR failed (${id}, org=${input.orgId}, project=${input.projectId}) [${code}]: ${msg}`,
    );
  }
  return id;
}

export async function deleteDpr(id: string): Promise<void> {
  await db.collection('dpr').doc(id).delete();
}
