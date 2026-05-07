import { auth, db, firestore } from '@/src/lib/firebase';

import type { CreateOrgFinanceInput, OrgFinance } from './types';

function requireUser() {
  const u = auth.currentUser;
  if (!u) throw new Error('You must be signed in.');
  return u.uid;
}

export async function createOrgFinance(input: CreateOrgFinanceInput): Promise<string> {
  requireUser();
  const ref = db.collection('orgFinances').doc();
  await ref.set({
    orgId: input.orgId,
    kind: input.kind,
    category: input.category,
    amount: input.amount,
    paidAt: firestore.Timestamp.fromDate(input.paidAt),
    payee: input.payee ?? '',
    payeeUid: input.payeeUid ?? null,
    paymentMethod: input.paymentMethod ?? 'bank',
    note: input.note ?? '',
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function updateOrgFinance(
  id: string,
  patch: Partial<
    Pick<
      OrgFinance,
      'kind' | 'category' | 'amount' | 'payee' | 'payeeUid' | 'paymentMethod' | 'note'
    >
  > & { paidAt?: Date },
): Promise<void> {
  requireUser();
  const ref = db.collection('orgFinances').doc(id);
  const data: Record<string, unknown> = {
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.amount !== undefined) data.amount = patch.amount;
  if (patch.payee !== undefined) data.payee = patch.payee;
  if (patch.payeeUid !== undefined) data.payeeUid = patch.payeeUid;
  if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod;
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.paidAt !== undefined) data.paidAt = firestore.Timestamp.fromDate(patch.paidAt);
  await ref.update(data);
}

export async function deleteOrgFinance(id: string): Promise<void> {
  requireUser();
  await db.collection('orgFinances').doc(id).delete();
}
