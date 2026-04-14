import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';
import type { MaterialRequestItem, DeliveryStatus } from './types';

export type CreateMaterialRequestInput = {
  orgId: string;
  projectId: string;
  title: string;
  items: MaterialRequestItem[];
  createdBy: string;
};

export async function createMaterialRequest(
  input: CreateMaterialRequestInput,
): Promise<string> {
  const ref = db.collection('materialRequests').doc();
  const totalValue = input.items.reduce((sum, i) => sum + i.totalCost, 0);
  await ref.set({
    orgId: input.orgId,
    projectId: input.projectId,
    title: input.title || `Request #${Date.now().toString(36).slice(-4).toUpperCase()}`,
    status: 'pending',
    items: input.items,
    totalValue,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function approveRequest(
  requestId: string,
  approvedBy: string,
): Promise<void> {
  await db.collection('materialRequests').doc(requestId).update({
    status: 'approved',
    approvedBy,
    approvedAt: firestore.FieldValue.serverTimestamp(),
  });
}

export async function rejectRequest(
  requestId: string,
  rejectionNote: string,
): Promise<void> {
  await db.collection('materialRequests').doc(requestId).update({
    status: 'rejected',
    rejectionNote,
  });
}

export async function updateItemDeliveryStatus(
  requestId: string,
  itemIndex: number,
  status: DeliveryStatus,
): Promise<void> {
  const snap = await db.collection('materialRequests').doc(requestId).get();
  const data = snap.data();
  if (!data?.items) return;
  const items = [...data.items] as MaterialRequestItem[];
  if (itemIndex < 0 || itemIndex >= items.length) return;
  items[itemIndex] = { ...items[itemIndex], deliveryStatus: status };
  await db.collection('materialRequests').doc(requestId).update({ items });
}

export async function deleteMaterialRequest(id: string): Promise<void> {
  await db.collection('materialRequests').doc(id).delete();
}
