import { firestore } from '@/src/lib/firebase';
import { db } from '@/src/lib/firebase';

import type { MaterialRequestItem, DeliveryStatus } from './types';
import { materialAutoApprovesOnCreate } from './materialApproval';
import type { RoleKey } from '@/src/features/org/types';

export type CreateMaterialRequestInput = {
  orgId: string;
  projectId: string;
  title: string;
  items: MaterialRequestItem[];
  createdBy: string;
  creatorRole: RoleKey;
  designatedApproverUids?: string[];
};

export type UpdateMaterialRequestInput = {
  requestId: string;
  title: string;
  items: MaterialRequestItem[];
  /** UID of whoever made this edit — written to `editedBy` for the
   *  "Last edited by X" footnote on the detail screen. */
  editedBy: string;
};

export type ResubmitMaterialRequestInput = {
  requestId: string;
  title: string;
  items: MaterialRequestItem[];
  /** Creator's UID — same as the original `createdBy`. Stored in
   *  `editedBy` so the audit trail shows who pushed the resubmit. */
  editedBy: string;
};

export async function createMaterialRequest(
  input: CreateMaterialRequestInput,
): Promise<string> {
  const ref = db.collection('materialRequests').doc();
  const totalValue = input.items.reduce((sum, i) => sum + i.totalCost, 0);
  const title =
    input.title || `Request #${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const base = {
    orgId: input.orgId,
    projectId: input.projectId,
    title,
    items: input.items,
    totalValue,
    createdBy: input.createdBy,
    createdByRole: input.creatorRole,
    createdAt: firestore.FieldValue.serverTimestamp(),
  };

  if (materialAutoApprovesOnCreate(input.creatorRole)) {
    await ref.set({
      ...base,
      status: 'approved',
      approvedBy: input.createdBy,
      approvedAt: firestore.FieldValue.serverTimestamp(),
      autoApproved: true,
    });
  } else {
    const designated = input.designatedApproverUids?.filter(Boolean) ?? [];
    await ref.set({
      ...base,
      status: 'pending',
      ...(designated.length > 0 ? { designatedApproverUids: designated } : {}),
    });
  }
  return ref.id;
}

export async function updateMaterialRequest(
  input: UpdateMaterialRequestInput,
): Promise<void> {
  const totalValue = input.items.reduce((sum, i) => sum + i.totalCost, 0);
  await db.collection('materialRequests').doc(input.requestId).update({
    title:
      input.title || `Request #${Date.now().toString(36).slice(-4).toUpperCase()}`,
    items: input.items,
    totalValue,
    updatedAt: firestore.FieldValue.serverTimestamp(),
    editedAt: firestore.FieldValue.serverTimestamp(),
    editedBy: input.editedBy,
  });
}

/** Used by the creator on a rejected request to push it back into the
 *  approval queue. Flips status to 'pending' and clears the rejection
 *  metadata — the existing onMaterialRequestWrite trigger sees the
 *  rejected→pending transition and re-fires the approver push. */
export async function resubmitRejectedRequest(
  input: ResubmitMaterialRequestInput,
): Promise<void> {
  const totalValue = input.items.reduce((sum, i) => sum + i.totalCost, 0);
  await db.collection('materialRequests').doc(input.requestId).update({
    title:
      input.title || `Request #${Date.now().toString(36).slice(-4).toUpperCase()}`,
    items: input.items,
    totalValue,
    status: 'pending',
    rejectionNote: firestore.FieldValue.delete(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
    editedAt: firestore.FieldValue.serverTimestamp(),
    editedBy: input.editedBy,
  });
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
  rejectedBy: string,
  rejectionNote: string,
): Promise<void> {
  await db.collection('materialRequests').doc(requestId).update({
    status: 'rejected',
    rejectionNote,
    rejectedBy,
    rejectedAt: firestore.FieldValue.serverTimestamp(),
  });
}

export async function updateItemDeliveryStatus(
  requestId: string,
  itemIndex: number,
  status: DeliveryStatus,
  updatedBy: string,
): Promise<void> {
  const snap = await db.collection('materialRequests').doc(requestId).get();
  const data = snap.data();
  if (!data?.items) return;
  const items = [...data.items] as MaterialRequestItem[];
  if (itemIndex < 0 || itemIndex >= items.length) return;
  if (items[itemIndex].deliveryStatus === status) return; // no-op guard
  items[itemIndex] = { ...items[itemIndex], deliveryStatus: status };
  await db.collection('materialRequests').doc(requestId).update({
    items,
    lastDeliveryUpdateAt: firestore.FieldValue.serverTimestamp(),
    lastDeliveryUpdateBy: updatedBy,
  });
}

export async function deleteMaterialRequest(id: string): Promise<void> {
  await db.collection('materialRequests').doc(id).delete();
}
