import { db, firestore } from '@/src/lib/firebase';

import type {
  LeadPriority,
  LeadSource,
  LeadStatus,
  ProjectType,
} from './types';

export type CreateLeadInput = {
  orgId: string;
  name: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  createdBy: string;

  email?: string;
  projectType?: ProjectType;
  location?: string;
  budget?: number;
  requirements?: string;
  expectedStartDate?: Date;
  followUpAt?: Date;
  tags?: string[];
  assignedTo?: string;
  notes?: string;
};

export async function createLead(input: CreateLeadInput): Promise<string> {
  const ref = db.collection('leads').doc();
  const doc: Record<string, unknown> = {
    orgId: input.orgId,
    name: input.name,
    phone: input.phone,
    source: input.source,
    status: input.status,
    priority: input.priority,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  if (input.email) doc.email = input.email;
  if (input.projectType) doc.projectType = input.projectType;
  if (input.location) doc.location = input.location;
  if (input.budget !== undefined && input.budget !== null) doc.budget = input.budget;
  if (input.requirements) doc.requirements = input.requirements;
  if (input.expectedStartDate) {
    doc.expectedStartDate = firestore.Timestamp.fromDate(input.expectedStartDate);
  }
  if (input.followUpAt) {
    doc.followUpAt = firestore.Timestamp.fromDate(input.followUpAt);
  }
  if (input.tags && input.tags.length > 0) doc.tags = input.tags;
  if (input.assignedTo) doc.assignedTo = input.assignedTo;
  if (input.notes) doc.notes = input.notes;

  await ref.set(doc);
  return ref.id;
}

export type UpdateLeadInput = Partial<{
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  projectType: ProjectType | null;
  location: string | null;
  budget: number | null;
  requirements: string | null;
  expectedStartDate: Date | null;
  followUpAt: Date | null;
  tags: string[] | null;
  assignedTo: string | null;
  notes: string | null;
}>;

export async function updateLead(id: string, data: UpdateLeadInput): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };

  if (data.name !== undefined) updates.name = data.name;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.email !== undefined) {
    updates.email = data.email === null ? firestore.FieldValue.delete() : data.email;
  }
  if (data.source !== undefined) updates.source = data.source;
  if (data.status !== undefined) updates.status = data.status;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.projectType !== undefined) {
    updates.projectType =
      data.projectType === null ? firestore.FieldValue.delete() : data.projectType;
  }
  if (data.location !== undefined) {
    updates.location = data.location === null ? firestore.FieldValue.delete() : data.location;
  }
  if (data.budget !== undefined) {
    updates.budget = data.budget === null ? firestore.FieldValue.delete() : data.budget;
  }
  if (data.requirements !== undefined) {
    updates.requirements =
      data.requirements === null ? firestore.FieldValue.delete() : data.requirements;
  }
  if (data.expectedStartDate !== undefined) {
    if (data.expectedStartDate === null) {
      updates.expectedStartDate = firestore.FieldValue.delete();
    } else {
      updates.expectedStartDate = firestore.Timestamp.fromDate(data.expectedStartDate);
    }
  }
  if (data.followUpAt !== undefined) {
    if (data.followUpAt === null) {
      updates.followUpAt = firestore.FieldValue.delete();
    } else {
      updates.followUpAt = firestore.Timestamp.fromDate(data.followUpAt);
    }
  }
  if (data.tags !== undefined) {
    updates.tags =
      data.tags === null || data.tags.length === 0
        ? firestore.FieldValue.delete()
        : data.tags;
  }
  if (data.assignedTo !== undefined) {
    updates.assignedTo =
      data.assignedTo === null ? firestore.FieldValue.delete() : data.assignedTo;
  }
  if (data.notes !== undefined) {
    updates.notes = data.notes === null ? firestore.FieldValue.delete() : data.notes;
  }

  await db.collection('leads').doc(id).update(updates);
}

export async function deleteLead(id: string): Promise<void> {
  await db.collection('leads').doc(id).delete();
}
