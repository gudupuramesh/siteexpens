import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';
import type { BankDetails, PartyType } from './types';

export type CreatePartyInput = {
  orgId: string;
  name: string;
  phone: string;
  partyType: PartyType;
  createdBy: string;

  // Optional fields
  email?: string;
  fatherName?: string;
  dateOfJoining?: Date;
  address?: string;
  aadharNumber?: string;
  aadharFileUrl?: string;
  panNumber?: string;
  panFileUrl?: string;
  openingBalance?: number;
  openingBalanceType?: 'to_pay' | 'to_receive';
  bankDetails?: BankDetails;
};

export async function createParty(input: CreatePartyInput): Promise<string> {
  const ref = db.collection('parties').doc();

  const doc: Record<string, unknown> = {
    orgId: input.orgId,
    name: input.name,
    phone: input.phone,
    partyType: input.partyType,
    // Keep `role` for backward compat with old queries / party tab
    role: input.partyType,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  };

  // Only set optional fields that have values
  if (input.email) doc.email = input.email;
  if (input.fatherName) doc.fatherName = input.fatherName;
  if (input.dateOfJoining) doc.dateOfJoining = firestore.Timestamp.fromDate(input.dateOfJoining);
  if (input.address) doc.address = input.address;
  if (input.aadharNumber) doc.aadharNumber = input.aadharNumber;
  if (input.aadharFileUrl) doc.aadharFileUrl = input.aadharFileUrl;
  if (input.panNumber) doc.panNumber = input.panNumber;
  if (input.panFileUrl) doc.panFileUrl = input.panFileUrl;
  if (input.openingBalance !== undefined && input.openingBalance !== 0) {
    doc.openingBalance = input.openingBalance;
    doc.openingBalanceType = input.openingBalanceType ?? 'to_pay';
  }
  if (input.bankDetails && Object.values(input.bankDetails).some(Boolean)) {
    doc.bankDetails = input.bankDetails;
  }

  await ref.set(doc);
  return ref.id;
}

export async function updateParty(
  id: string,
  data: Partial<Omit<CreatePartyInput, 'orgId' | 'createdBy'>>,
): Promise<void> {
  const updates: Record<string, unknown> = { ...data };
  if (data.dateOfJoining) {
    updates.dateOfJoining = firestore.Timestamp.fromDate(data.dateOfJoining);
  }
  if (data.partyType) {
    updates.role = data.partyType; // keep in sync
  }
  await db.collection('parties').doc(id).update(updates);
}
