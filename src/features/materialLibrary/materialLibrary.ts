import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';
import type { MaterialCategory } from './types';

export type CreateLibraryItemInput = {
  orgId: string;
  category: MaterialCategory;
  name: string;
  brand: string;
  variety: string;
  make: string;
  size: string;
  unit: string;
  defaultRate?: number;
  createdBy: string;
};

export async function createLibraryItem(input: CreateLibraryItemInput): Promise<string> {
  const ref = db.collection('materialLibrary').doc();
  const doc: Record<string, unknown> = {
    orgId: input.orgId,
    category: input.category,
    name: input.name,
    brand: input.brand,
    variety: input.variety,
    make: input.make,
    size: input.size,
    unit: input.unit,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  };
  if (input.defaultRate != null && input.defaultRate > 0) {
    doc.defaultRate = input.defaultRate;
  }
  await ref.set(doc);
  return ref.id;
}

export async function updateLibraryItem(
  id: string,
  data: Partial<Omit<CreateLibraryItemInput, 'orgId' | 'createdBy'>>,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (data.category !== undefined) updates.category = data.category;
  if (data.name !== undefined) updates.name = data.name;
  if (data.brand !== undefined) updates.brand = data.brand;
  if (data.variety !== undefined) updates.variety = data.variety;
  if (data.make !== undefined) updates.make = data.make;
  if (data.size !== undefined) updates.size = data.size;
  if (data.unit !== undefined) updates.unit = data.unit;
  if (data.defaultRate !== undefined) {
    updates.defaultRate = data.defaultRate > 0 ? data.defaultRate : firestore.FieldValue.delete();
  }
  await db.collection('materialLibrary').doc(id).update(updates);
}

export async function deleteLibraryItem(id: string): Promise<void> {
  await db.collection('materialLibrary').doc(id).delete();
}
