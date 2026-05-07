/**
 * Org-scoped custom staff roles — extends the default preset list at
 * `roles.ts`. Mirrors the `taskCategoryLibrary` pattern so the Staff
 * Role Library page can reuse the same UX shape.
 *
 * Doc id is `${orgId}_${roleKey}` so the same role can't be added
 * twice (Firestore set-with-merge gives idempotent create).
 */
import { firestore } from '@/src/lib/firebase';
import { db } from '@/src/lib/firebase';
import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

import { toRoleKey } from './roles';

export type StaffRoleLibraryItem = {
  id: string;
  orgId: string;
  key: string;
  label: string;
  normalizedLabel: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};

export async function createStaffRole(input: {
  orgId: string;
  label: string;
  createdBy: string;
}): Promise<string> {
  const cleanLabel = input.label.trim();
  const normalized = cleanLabel.toLowerCase();
  const key = toRoleKey(cleanLabel);
  const ref = db.collection('staffRoleLibrary').doc(`${input.orgId}_${key}`);
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

export async function deleteStaffRole(id: string): Promise<void> {
  await db.collection('staffRoleLibrary').doc(id).delete();
}
