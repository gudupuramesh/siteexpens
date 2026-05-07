import { firestore } from '@/src/lib/firebase';
import { db } from '@/src/lib/firebase';

import type {
  PaymentMethod,
  TransactionCategory,
  TransactionSubmissionKind,
  TransactionWorkflowStatus,
} from './types';

export type CreateTransactionInput = {
  projectId: string;
  orgId: string;
  type: 'payment_in' | 'payment_out';
  amount: number;
  description: string;
  partyId?: string;
  partyName: string;
  category?: TransactionCategory;
  paymentMethod?: PaymentMethod;
  referenceNumber?: string;
  photoUrl?: string;
  photoStoragePath?: string;
  status: 'paid' | 'pending' | 'partial';
  date: Date;
  createdBy: string;
  /** Default `posted` when omitted (legacy behaviour). */
  workflowStatus?: TransactionWorkflowStatus;
  /** Distinguishes "I paid out of pocket, please reimburse me" from
   *  "the company owes this party". Only used by submit-only roles. */
  submissionKind?: TransactionSubmissionKind;
};

export async function createTransaction(input: CreateTransactionInput): Promise<string> {
  const ref = db.collection('transactions').doc();

  const workflowStatus = input.workflowStatus ?? 'posted';

  const doc: Record<string, unknown> = {
    projectId: input.projectId,
    orgId: input.orgId,
    type: input.type,
    amount: input.amount,
    description: input.description,
    partyName: input.partyName,
    status: input.status,
    date: firestore.Timestamp.fromDate(input.date),
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
    workflowStatus,
  };

  if (workflowStatus === 'pending_approval') {
    doc.submittedAt = firestore.FieldValue.serverTimestamp();
  }

  if (input.partyId) doc.partyId = input.partyId;
  if (input.category) doc.category = input.category;
  if (input.paymentMethod) doc.paymentMethod = input.paymentMethod;
  if (input.referenceNumber) doc.referenceNumber = input.referenceNumber;
  if (input.photoUrl) doc.photoUrl = input.photoUrl;
  if (input.photoStoragePath) doc.photoStoragePath = input.photoStoragePath;
  if (input.submissionKind) doc.submissionKind = input.submissionKind;

  await ref.set(doc);
  return ref.id;
}

export type ApproveTransactionSettlementInput = {
  clearedToParty: boolean;
  payeeLabel?: string;
  note?: string;
  /** When true, the admin is also marking the money as actually cleared
   *  in the same step (one-tap "approve and pay"). When false (default),
   *  the txn is just approved; clearing happens later via
   *  `clearTransactionSettlement`. */
  markCleared?: boolean;
  /** Required when `markCleared` is true — the admin's payment proof. */
  settlementPhotoUrl?: string;
  settlementPhotoStoragePath?: string;
};

export async function approveTransaction(
  id: string,
  approvedBy: string,
  settlement?: ApproveTransactionSettlementInput,
): Promise<void> {
  const updates: Record<string, unknown> = {
    workflowStatus: 'posted',
    approvedBy,
    approvedAt: firestore.FieldValue.serverTimestamp(),
    rejectionNote: firestore.FieldValue.delete(),
    rejectedBy: firestore.FieldValue.delete(),
    rejectedAt: firestore.FieldValue.delete(),
  };

  if (settlement) {
    const payee = settlement.payeeLabel?.trim();
    const note = settlement.note?.trim();
    const settlementDoc: Record<string, unknown> = {
      clearedToParty: settlement.clearedToParty,
      recordedBy: approvedBy,
      recordedAt: firestore.FieldValue.serverTimestamp(),
    };
    if (payee) settlementDoc.payeeLabel = payee;
    if (note) settlementDoc.note = note;
    if (settlement.markCleared) {
      settlementDoc.clearedAt = firestore.FieldValue.serverTimestamp();
      settlementDoc.clearedBy = approvedBy;
      if (settlement.settlementPhotoUrl) {
        settlementDoc.settlementPhotoUrl = settlement.settlementPhotoUrl;
      }
      if (settlement.settlementPhotoStoragePath) {
        settlementDoc.settlementPhotoStoragePath = settlement.settlementPhotoStoragePath;
      }
    }
    updates.settlement = settlementDoc;
  }

  await db.collection('transactions').doc(id).update(updates);
}

export type ClearTransactionSettlementInput = {
  clearedBy: string;
  settlementPhotoUrl?: string;
  settlementPhotoStoragePath?: string;
  payeeLabel?: string;
  note?: string;
  /** True if the cleared payment went to the party; false if it was a
   *  reimbursement to the submitter. Used to keep the existing
   *  `clearedToParty` semantics consistent on already-posted txns. */
  clearedToParty?: boolean;
};

/** Mark a posted transaction's settlement as cleared (admin actually moved
 *  the money). Used in the "Mark as Cleared" CTA on the txn detail screen
 *  when the admin clears later, separately from approval.
 *
 *  Merges into `settlement` rather than overwriting so that whatever was
 *  recorded at approval time (note, payeeLabel) is preserved. */
export async function clearTransactionSettlement(
  id: string,
  input: ClearTransactionSettlementInput,
): Promise<void> {
  const fields: Record<string, unknown> = {
    'settlement.clearedAt': firestore.FieldValue.serverTimestamp(),
    'settlement.clearedBy': input.clearedBy,
  };
  if (input.clearedToParty !== undefined) {
    fields['settlement.clearedToParty'] = input.clearedToParty;
  }
  if (input.settlementPhotoUrl) {
    fields['settlement.settlementPhotoUrl'] = input.settlementPhotoUrl;
  }
  if (input.settlementPhotoStoragePath) {
    fields['settlement.settlementPhotoStoragePath'] = input.settlementPhotoStoragePath;
  }
  const payee = input.payeeLabel?.trim();
  const note = input.note?.trim();
  if (payee) fields['settlement.payeeLabel'] = payee;
  if (note) fields['settlement.note'] = note;
  // recordedBy/recordedAt only get set if the txn never had a settlement obj.
  // Safe to always set them — they'll be overwritten by approve flow normally.
  const snap = await db.collection('transactions').doc(id).get();
  const existingSettlement = snap.data()?.settlement;
  if (!existingSettlement) {
    fields['settlement.recordedBy'] = input.clearedBy;
    fields['settlement.recordedAt'] = firestore.FieldValue.serverTimestamp();
    if (input.clearedToParty === undefined) {
      fields['settlement.clearedToParty'] = false;
    }
  }
  await db.collection('transactions').doc(id).update(fields);
}

export async function rejectTransaction(
  id: string,
  rejectedBy: string,
  rejectionNote: string,
): Promise<void> {
  await db.collection('transactions').doc(id).update({
    workflowStatus: 'rejected',
    rejectedBy,
    rejectionNote: rejectionNote.trim(),
    rejectedAt: firestore.FieldValue.serverTimestamp(),
  });
}

export async function updateTransaction(
  id: string,
  data: Partial<Omit<CreateTransactionInput, 'projectId' | 'orgId' | 'createdBy'>>,
): Promise<void> {
  const updates: Record<string, unknown> = { ...data };
  if (data.date) {
    updates.date = firestore.Timestamp.fromDate(data.date);
  }
  for (const k of Object.keys(updates)) {
    if (updates[k] === undefined) delete updates[k];
  }
  await db.collection('transactions').doc(id).update(updates);
}
