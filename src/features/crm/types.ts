import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

// ── Lead enums & labels ──

export type LeadSource =
  | 'walk_in'
  | 'reference'
  | 'instagram'
  | 'website'
  | 'just_dial'
  | 'google_ads'
  | 'other';

export const LEAD_SOURCES: { key: LeadSource; label: string }[] = [
  { key: 'walk_in', label: 'Walk-in' },
  { key: 'reference', label: 'Reference' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'website', label: 'Website' },
  { key: 'just_dial', label: 'JustDial' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'other', label: 'Other' },
];

export function getLeadSourceLabel(source: LeadSource): string {
  return LEAD_SOURCES.find((s) => s.key === source)?.label ?? source;
}

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'site_visit_scheduled'
  | 'proposal_sent'
  | 'negotiation'
  | 'converted'
  | 'lost';

/** Pipeline stages for filtering / stepper (includes terminals). */
export const LEAD_STATUSES: { key: LeadStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'site_visit_scheduled', label: 'Site visit' },
  { key: 'proposal_sent', label: 'Proposal' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'converted', label: 'Converted' },
  { key: 'lost', label: 'Lost' },
];

/** Active pipeline before win/loss (for progress indication). */
export const LEAD_PIPELINE_ACTIVE: LeadStatus[] = [
  'new',
  'contacted',
  'site_visit_scheduled',
  'proposal_sent',
  'negotiation',
];

export function getLeadStatusLabel(status: LeadStatus): string {
  return LEAD_STATUSES.find((s) => s.key === status)?.label ?? status;
}

export type LeadPriority = 'low' | 'medium' | 'high';

export const LEAD_PRIORITIES: { key: LeadPriority; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
];

export function getLeadPriorityLabel(p: LeadPriority): string {
  return LEAD_PRIORITIES.find((x) => x.key === p)?.label ?? p;
}

export type ProjectType =
  | '1bhk'
  | '2bhk'
  | '3bhk'
  | 'villa'
  | 'office'
  | 'commercial'
  | 'other';

export const PROJECT_TYPES: { key: ProjectType; label: string }[] = [
  { key: '1bhk', label: '1 BHK' },
  { key: '2bhk', label: '2 BHK' },
  { key: '3bhk', label: '3 BHK' },
  { key: 'villa', label: 'Villa' },
  { key: 'office', label: 'Office' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'other', label: 'Other' },
];

export function getProjectTypeLabel(t: ProjectType): string {
  return PROJECT_TYPES.find((x) => x.key === t)?.label ?? t;
}

// ── Appointment enums ──

export type AppointmentType = 'site_visit' | 'office_meeting' | 'virtual_call' | 'other';

export const APPOINTMENT_TYPES: { key: AppointmentType; label: string }[] = [
  { key: 'site_visit', label: 'Site visit' },
  { key: 'office_meeting', label: 'Office meeting' },
  { key: 'virtual_call', label: 'Virtual call' },
  { key: 'other', label: 'Other' },
];

export function getAppointmentTypeLabel(t: AppointmentType): string {
  return APPOINTMENT_TYPES.find((x) => x.key === t)?.label ?? t;
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export const APPOINTMENT_STATUSES: { key: AppointmentStatus; label: string }[] = [
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'no_show', label: 'No show' },
];

export function getAppointmentStatusLabel(s: AppointmentStatus): string {
  return APPOINTMENT_STATUSES.find((x) => x.key === s)?.label ?? s;
}

// ── Documents ──

export type Lead = {
  id: string;
  orgId: string;
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  projectType?: ProjectType;
  location?: string;
  budget?: number;
  requirements?: string;
  expectedStartDate?: FirebaseFirestoreTypes.Timestamp | null;
  followUpAt?: FirebaseFirestoreTypes.Timestamp | null;
  tags?: string[];
  assignedTo?: string;
  notes?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  createdBy: string;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};

export type Appointment = {
  id: string;
  orgId: string;
  leadId?: string;
  /** Standalone or extra contact (when not using a lead or to override). */
  clientName?: string;
  clientPhone?: string;
  clientAddress?: string;
  type: AppointmentType;
  title: string;
  scheduledAt: FirebaseFirestoreTypes.Timestamp | null;
  durationMins?: number;
  /** Where the meeting / site visit happens. */
  location?: string;
  attendees?: string[];
  status: AppointmentStatus;
  notes?: string;
  outcome?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  createdBy: string;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};
