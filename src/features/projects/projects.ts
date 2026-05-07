/**
 * Project writes.
 *
 * `createProject` is a Cloud Function callable now (was a direct
 * Firestore write). The server-side path is what enforces the
 * per-tier project-count cap and atomically increments the org's
 * `counters.projectCount` inside a transaction — Firestore rules
 * can't safely do counted writes, so the callable is the security
 * boundary. The thrown HttpsError carries `code: 'failed-precondition'`
 * and a `details: { reason, tier, limit }` payload that the client
 * paywall reads to route to the right upgrade target.
 *
 * Updates and deletes still go through direct Firestore writes
 * (rule-gated); they can't push the org over a quota.
 */
import { callFunction, db, firestore } from '@/src/lib/firebase';
import {
  PlanLimitError,
  maybeWrapPlanLimitError,
} from '@/src/features/billing/errors';

import type { ProjectStatus, ProjectTypology } from './types';

// Re-export so existing callers (`new.tsx`) that import from this
// module don't have to change their import path.
export { PlanLimitError };

export type CreateProjectInput = {
  uid: string;
  orgId: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  siteAddress: string;
  value: number;
  photoUri: string | null;
  /** R2 object key for the cover photo — stored alongside `photoUri`
   *  so the replace-flow can delete the old object cleanly. */
  photoR2Key?: string | null;

  // ── InteriorOS metadata (all optional) ──
  status?: ProjectStatus;
  client?: string;
  location?: string;
  typology?: ProjectTypology;
  subType?: string;
  progress?: number;
  team?: number;
};

type CreateProjectCallablePayload = {
  orgId: string;
  name: string;
  startDate: string; // ISO
  endDate: string | null;
  siteAddress: string;
  value: number;
  photoUri: string | null;
  photoR2Key?: string | null;
  status?: ProjectStatus;
  client?: string;
  location?: string;
  typology?: ProjectTypology;
  subType?: string;
  progress?: number;
  team?: number;
};

type CreateProjectCallableResponse = { projectId: string };

export async function createProject(input: CreateProjectInput): Promise<string> {
  // The `uid` field is no longer sent — the callable derives it
  // server-side from `request.auth.uid`, which is the source of
  // truth (the client can't lie about who they are).
  const payload: CreateProjectCallablePayload = {
    orgId: input.orgId,
    name: input.name,
    startDate: input.startDate.toISOString(),
    endDate: input.endDate ? input.endDate.toISOString() : null,
    siteAddress: input.siteAddress,
    value: input.value,
    photoUri: input.photoUri,
    status: input.status,
  };
  if (input.photoR2Key) payload.photoR2Key = input.photoR2Key;
  if (input.client) payload.client = input.client;
  if (input.location) payload.location = input.location;
  if (input.typology) payload.typology = input.typology;
  if (input.subType) payload.subType = input.subType;
  if (input.progress !== undefined && !Number.isNaN(input.progress)) {
    payload.progress = Math.max(0, Math.min(100, input.progress));
  }
  if (input.team !== undefined && !Number.isNaN(input.team) && input.team > 0) {
    payload.team = input.team;
  }

  try {
    const { data } = await callFunction<
      CreateProjectCallablePayload,
      CreateProjectCallableResponse
    >('createProject', payload);
    return data.projectId;
  } catch (err) {
    // Translate the server's `failed-precondition` paywall response
    // into a typed PlanLimitError so the UI can branch on
    // `instanceof PlanLimitError` to open the paywall sheet.
    throw maybeWrapPlanLimitError(err);
  }
}


/**
 * UpdateProjectInput — every field optional. Only keys that are
 * `!== undefined` are written, so callers can patch a single field
 * (status / progress) or the whole detail form (edit-project.tsx).
 *
 * `null` is a meaningful value for `endDate` (= "no target date") and
 * `photoUri` / `photoR2Key` (= "no cover photo / removed cover"); the
 * patch logic distinguishes those from `undefined` (= "leave alone").
 */
export type UpdateProjectInput = {
  projectId: string;
  name?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  siteAddress?: string;
  value?: number;
  /** Replace the cover photo URL. Pass `null` to clear. */
  photoUri?: string | null;
  /** Pass `null` to clear when clearing photoUri. */
  photoR2Key?: string | null;
  status?: ProjectStatus;
  /** Pass empty string to clear. */
  client?: string;
  location?: string;
  typology?: ProjectTypology;
  subType?: string;
  progress?: number;
  team?: number;
};

/**
 * Update project fields. All keys optional; only provided keys are
 * written. Numbers (progress / value / team) are clamped + sanitised.
 */
export async function updateProject(input: UpdateProjectInput): Promise<void> {
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.siteAddress !== undefined) patch.siteAddress = input.siteAddress.trim();
  if (input.location !== undefined) {
    // Empty string → drop the field so list views fall back cleanly.
    const v = input.location.trim();
    patch.location = v.length ? v : firestore.FieldValue.delete();
  }
  if (input.client !== undefined) {
    const v = input.client.trim();
    patch.client = v.length ? v : firestore.FieldValue.delete();
  }
  if (input.typology !== undefined) patch.typology = input.typology;
  if (input.subType !== undefined) {
    const v = input.subType.trim();
    patch.subType = v.length ? v : firestore.FieldValue.delete();
  }
  if (input.status) patch.status = input.status;

  if (input.startDate !== undefined) {
    patch.startDate = input.startDate
      ? firestore.Timestamp.fromDate(input.startDate)
      : null;
  }
  if (input.endDate !== undefined) {
    patch.endDate = input.endDate
      ? firestore.Timestamp.fromDate(input.endDate)
      : null;
  }

  if (input.value !== undefined && !Number.isNaN(input.value)) {
    patch.value = Math.max(0, Math.round(input.value));
  }
  if (input.progress !== undefined && !Number.isNaN(input.progress)) {
    patch.progress = Math.max(0, Math.min(100, Math.round(input.progress)));
  }
  if (input.team !== undefined && !Number.isNaN(input.team)) {
    if (input.team > 0) patch.team = Math.round(input.team);
    else patch.team = firestore.FieldValue.delete();
  }

  // Cover photo — keep URL + key in lockstep. Passing `null` clears
  // both fields; passing a fresh URL+key replaces both.
  if (input.photoUri !== undefined) patch.photoUri = input.photoUri;
  if (input.photoR2Key !== undefined) {
    patch.photoR2Key = input.photoR2Key === null
      ? firestore.FieldValue.delete()
      : input.photoR2Key;
  }

  if (Object.keys(patch).length === 0) return;

  await db.collection('projects').doc(input.projectId).update(patch);
}

/**
 * Delete a project AND every byte / doc attached to it via the
 * `deleteProjectCascade` Cloud Function. Server-side wipe covers:
 *   - Every R2 object ever uploaded under the project (queried from
 *     storageEvents — catches even orphan-prone fields like
 *     tasks.photoUris[] / dpr.photoUris[] that store URLs only)
 *   - Every Firestore doc with projectId === id across tasks (and
 *     their updates + comments subcollections), transactions, designs,
 *     attendance, dpr, laminates, whiteboards, materials,
 *     materialRequests, storageEvents
 *   - The projectStorage/{id} totals doc
 *   - The project doc itself
 *
 * Returns the counts so the caller can surface them to the user
 * (e.g. "Deleted 1.2 GB across 247 files and 891 records").
 */
export async function deleteProject(projectId: string): Promise<{
  deletedR2: number;
  deletedDocs: number;
}> {
  const result = await callFunction<
    { projectId: string },
    { ok: true; deletedR2: number; deletedDocs: number }
  >('deleteProjectCascade', { projectId });
  return {
    deletedR2: result.data.deletedR2,
    deletedDocs: result.data.deletedDocs,
  };
}
