import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';

export type CreateLaminateInput = {
  projectId: string;
  orgId: string;
  roomName: string;
  brand: string;
  finish: string;
  edgeBandCode: string;
  laminateCode?: string;
  photoUrl?: string;
  photoStoragePath?: string;
  notes?: string;
  createdBy: string;
};

export async function createLaminate(input: CreateLaminateInput): Promise<string> {
  const ref = db.collection('laminates').doc();
  const doc: Record<string, unknown> = {
    projectId: input.projectId,
    orgId: input.orgId,
    roomName: input.roomName,
    brand: input.brand,
    finish: input.finish,
    edgeBandCode: input.edgeBandCode,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  };
  if (input.laminateCode) doc.laminateCode = input.laminateCode;
  if (input.photoUrl) doc.photoUrl = input.photoUrl;
  if (input.photoStoragePath) doc.photoStoragePath = input.photoStoragePath;
  if (input.notes) doc.notes = input.notes;

  await ref.set(doc);
  return ref.id;
}

export async function updateLaminate(
  id: string,
  data: Partial<Omit<CreateLaminateInput, 'createdBy'>>,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (data.roomName !== undefined) updates.roomName = data.roomName;
  if (data.brand !== undefined) updates.brand = data.brand;
  if (data.finish !== undefined) updates.finish = data.finish;
  if (data.edgeBandCode !== undefined) updates.edgeBandCode = data.edgeBandCode;
  if (data.laminateCode !== undefined) updates.laminateCode = data.laminateCode || firestore.FieldValue.delete();
  if (data.photoUrl !== undefined) updates.photoUrl = data.photoUrl || firestore.FieldValue.delete();
  if (data.photoStoragePath !== undefined) updates.photoStoragePath = data.photoStoragePath || firestore.FieldValue.delete();
  if (data.notes !== undefined) updates.notes = data.notes || firestore.FieldValue.delete();
  await db.collection('laminates').doc(id).update(updates);
}

export async function deleteLaminate(id: string): Promise<void> {
  await db.collection('laminates').doc(id).delete();
}
