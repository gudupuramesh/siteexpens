import { firestore } from '@/src/lib/firebase';

import { db } from '@/src/lib/firebase';
import type { TaskCategory } from './types';

export type TaskCategoryLibraryItem = {
  id: string;
  orgId: string;
  key: TaskCategory;
  label: string;
  normalizedLabel: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};

import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

export function toCategoryKey(label: string): TaskCategory {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'general';
}

export async function createTaskCategory(input: {
  orgId: string;
  label: string;
  createdBy: string;
}): Promise<string> {
  const cleanLabel = input.label.trim();
  const normalized = cleanLabel.toLowerCase();
  const key = toCategoryKey(cleanLabel);
  const ref = db.collection('taskCategoryLibrary').doc(`${input.orgId}_${key}`);
  await ref.set(
    {
      orgId: input.orgId,
      key,
      label: cleanLabel,
      normalizedLabel: normalized,
      createdBy: input.createdBy,
      createdAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return ref.id;
}

export async function deleteTaskCategory(id: string): Promise<void> {
  await db.collection('taskCategoryLibrary').doc(id).delete();
}
