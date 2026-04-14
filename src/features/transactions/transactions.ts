import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';
import type { PaymentMethod, TransactionCategory } from './types';

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
};

export async function createTransaction(input: CreateTransactionInput): Promise<string> {
  const ref = db.collection('transactions').doc();

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
  };

  if (input.partyId) doc.partyId = input.partyId;
  if (input.category) doc.category = input.category;
  if (input.paymentMethod) doc.paymentMethod = input.paymentMethod;
  if (input.referenceNumber) doc.referenceNumber = input.referenceNumber;
  if (input.photoUrl) doc.photoUrl = input.photoUrl;
  if (input.photoStoragePath) doc.photoStoragePath = input.photoStoragePath;

  await ref.set(doc);
  return ref.id;
}

export async function updateTransaction(
  id: string,
  data: Partial<Omit<CreateTransactionInput, 'projectId' | 'orgId' | 'createdBy'>>,
): Promise<void> {
  const updates: Record<string, unknown> = { ...data };
  if (data.date) {
    updates.date = firestore.Timestamp.fromDate(data.date);
  }
  await db.collection('transactions').doc(id).update(updates);
}
