/**
 * Project writes. Creating a project writes a single top-level document;
 * access control is driven by `memberIds`, which is seeded with the
 * creator's uid (and later extended by the invite flow).
 */
import firestore from '@react-native-firebase/firestore';

import { db } from '@/src/lib/firebase';

import type { ProjectStatus, ProjectTypology } from './types';

export type CreateProjectInput = {
  uid: string;
  orgId: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  siteAddress: string;
  value: number;
  photoUri: string | null;

  // ── InteriorOS metadata (all optional) ──
  status?: ProjectStatus;
  client?: string;
  location?: string;
  typology?: ProjectTypology;
  subType?: string;
  progress?: number;
  team?: number;
};

export async function createProject(input: CreateProjectInput): Promise<string> {
  const ref = db.collection('projects').doc();

  const doc: Record<string, unknown> = {
    orgId: input.orgId,
    name: input.name,
    startDate: firestore.Timestamp.fromDate(input.startDate),
    endDate: input.endDate ? firestore.Timestamp.fromDate(input.endDate) : null,
    siteAddress: input.siteAddress,
    value: input.value,
    photoUri: input.photoUri,
    status: input.status ?? 'active',
    ownerId: input.uid,
    memberIds: [input.uid],
    createdAt: firestore.FieldValue.serverTimestamp(),
  };

  // Only persist optional fields that have a meaningful value.
  if (input.client) doc.client = input.client;
  if (input.location) doc.location = input.location;
  if (input.typology) doc.typology = input.typology;
  if (input.subType) doc.subType = input.subType;
  if (input.progress !== undefined && !Number.isNaN(input.progress)) {
    doc.progress = Math.max(0, Math.min(100, input.progress));
  }
  if (input.team !== undefined && !Number.isNaN(input.team) && input.team > 0) {
    doc.team = input.team;
  }

  await ref.set(doc);
  return ref.id;
}

export type UpdateProjectInput = {
  projectId: string;
  status?: ProjectStatus;
  progress?: number;
};

/**
 * Update editable project overview controls (status / progress).
 * Keeps payload narrow so we do not accidentally overwrite unrelated fields.
 */
export async function updateProject(input: UpdateProjectInput): Promise<void> {
  const patch: Record<string, unknown> = {};

  if (input.status) {
    patch.status = input.status;
  }
  if (input.progress !== undefined && !Number.isNaN(input.progress)) {
    patch.progress = Math.max(0, Math.min(100, Math.round(input.progress)));
  }
  if (Object.keys(patch).length === 0) {
    return;
  }

  await db.collection('projects').doc(input.projectId).update(patch);
}
