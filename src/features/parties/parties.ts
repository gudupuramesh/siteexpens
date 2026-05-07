import { firestore } from '@/src/lib/firebase';
import { db } from '@/src/lib/firebase';
import { normalizeIndianPhoneE164 } from '@/src/lib/phone';
import type { BankDetails, PartyType } from './types';

/**
 * Thrown by `createParty` / `updateParty` when the supplied phone
 * isn't a valid Indian mobile. UI catches this and surfaces an
 * inline error instead of letting an unnormalised number land in
 * Firestore (which would break cross-org member matching).
 */
export class InvalidPhoneError extends Error {
  constructor(message = 'Enter a valid 10-digit Indian phone number') {
    super(message);
    this.name = 'InvalidPhoneError';
  }
}

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
  // Phone is the only stable cross-org identifier we have for a
  // party — store the normalised E.164 form so the same person
  // matches across orgs and can be invited / cross-referenced
  // later. Reject anything that isn't a valid Indian mobile.
  const normalizedPhone = normalizeIndianPhoneE164(input.phone);
  if (!normalizedPhone) throw new InvalidPhoneError();

  const ref = db.collection('parties').doc();

  const doc: Record<string, unknown> = {
    orgId: input.orgId,
    name: input.name,
    phone: normalizedPhone,
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
  if (data.phone !== undefined) {
    // Phone change goes through the same strict normaliser as
    // create so the doc never holds an unnormalised value.
    const normalizedPhone = normalizeIndianPhoneE164(data.phone);
    if (!normalizedPhone) throw new InvalidPhoneError();
    updates.phone = normalizedPhone;
  }
  if (data.dateOfJoining) {
    updates.dateOfJoining = firestore.Timestamp.fromDate(data.dateOfJoining);
  }
  if (data.partyType) {
    updates.role = data.partyType; // keep in sync
  }
  // Firestore refuses to accept `undefined` anywhere in the doc — it
  // throws "Unsupported field value: undefined". Strip them defensively
  // so no caller has to remember.
  for (const k of Object.keys(updates)) {
    if (updates[k] === undefined) delete updates[k];
  }
  await db.collection('parties').doc(id).update(updates);
}
