import { firestore } from '@/src/lib/firebase';
import { db } from '@/src/lib/firebase';

import type { AppointmentStatus, AppointmentType } from './types';

export type CreateAppointmentInput = {
  orgId: string;
  type: AppointmentType;
  title: string;
  scheduledAt: Date;
  createdBy: string;

  leadId?: string;
  clientName?: string;
  clientPhone?: string;
  clientAddress?: string;
  durationMins?: number;
  location?: string;
  attendees?: string[];
  status: AppointmentStatus;
  notes?: string;
  outcome?: string;
};

export async function createAppointment(input: CreateAppointmentInput): Promise<string> {
  const ref = db.collection('appointments').doc();
  const doc: Record<string, unknown> = {
    orgId: input.orgId,
    type: input.type,
    title: input.title,
    scheduledAt: firestore.Timestamp.fromDate(input.scheduledAt),
    status: input.status,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  if (input.leadId) doc.leadId = input.leadId;
  if (input.clientName) doc.clientName = input.clientName;
  if (input.clientPhone) doc.clientPhone = input.clientPhone;
  if (input.clientAddress) doc.clientAddress = input.clientAddress;
  if (input.durationMins !== undefined) doc.durationMins = input.durationMins;
  if (input.location) doc.location = input.location;
  if (input.attendees && input.attendees.length > 0) doc.attendees = input.attendees;
  if (input.notes) doc.notes = input.notes;
  if (input.outcome) doc.outcome = input.outcome;

  await ref.set(doc);
  return ref.id;
}

export type UpdateAppointmentInput = Partial<{
  leadId: string | null;
  clientName: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  type: AppointmentType;
  title: string;
  scheduledAt: Date | null;
  durationMins: number | null;
  location: string | null;
  attendees: string[] | null;
  status: AppointmentStatus;
  notes: string | null;
  outcome: string | null;
}>;

export async function updateAppointment(id: string, data: UpdateAppointmentInput): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  if (data.leadId !== undefined) {
    updates.leadId =
      data.leadId === null ? firestore.FieldValue.delete() : data.leadId;
  }
  if (data.clientName !== undefined) {
    updates.clientName =
      data.clientName === null ? firestore.FieldValue.delete() : data.clientName;
  }
  if (data.clientPhone !== undefined) {
    updates.clientPhone =
      data.clientPhone === null ? firestore.FieldValue.delete() : data.clientPhone;
  }
  if (data.clientAddress !== undefined) {
    updates.clientAddress =
      data.clientAddress === null ? firestore.FieldValue.delete() : data.clientAddress;
  }
  if (data.type !== undefined) updates.type = data.type;
  if (data.title !== undefined) updates.title = data.title;
  if (data.scheduledAt !== undefined) {
    if (data.scheduledAt === null) {
      updates.scheduledAt = firestore.FieldValue.delete();
    } else {
      updates.scheduledAt = firestore.Timestamp.fromDate(data.scheduledAt);
    }
  }
  if (data.durationMins !== undefined) {
    updates.durationMins =
      data.durationMins === null ? firestore.FieldValue.delete() : data.durationMins;
  }
  if (data.location !== undefined) {
    updates.location =
      data.location === null ? firestore.FieldValue.delete() : data.location;
  }
  if (data.attendees !== undefined) {
    updates.attendees =
      data.attendees === null || data.attendees.length === 0
        ? firestore.FieldValue.delete()
        : data.attendees;
  }
  if (data.status !== undefined) updates.status = data.status;
  if (data.notes !== undefined) {
    updates.notes = data.notes === null ? firestore.FieldValue.delete() : data.notes;
  }
  if (data.outcome !== undefined) {
    updates.outcome = data.outcome === null ? firestore.FieldValue.delete() : data.outcome;
  }

  await db.collection('appointments').doc(id).update(updates);
}

export async function deleteAppointment(id: string): Promise<void> {
  await db.collection('appointments').doc(id).delete();
}
