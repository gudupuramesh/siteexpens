/**
 * CRM share helpers — turn a Lead or Appointment doc into a plain-text
 * summary and hand it off to the OS share sheet (WhatsApp / SMS / Mail
 * / Notes / Copy / etc.).
 *
 * Uses React Native's built-in `Share.share({ message, title })` —
 * already proven by `TaskReportModal` for the timesheet share. No new
 * deps and no native config.
 *
 * Both helpers swallow user-cancellation silently so the caller doesn't
 * have to wrap them in try/catch.
 */
import { Share } from 'react-native';

import {
  getAppointmentStatusLabel,
  getAppointmentTypeLabel,
  getLeadPriorityLabel,
  getLeadSourceLabel,
  getLeadStatusLabel,
  getProjectTypeLabel,
  type Appointment,
  type Lead,
} from './types';

// ── Tiny formatters (kept local so this file stays self-contained) ──

function fmtDate(raw?: { toDate: () => Date } | null): string | null {
  if (!raw) return null;
  return raw.toDate().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(raw?: { toDate: () => Date } | null): string | null {
  if (!raw) return null;
  return raw.toDate().toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtInr(n?: number | null): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return `₹ ${n.toLocaleString('en-IN')}`;
}

// ── Lead ───────────────────────────────────────────────────────────

export type LeadShareOptions = {
  /** Resolved display name of the assigned team member (since `lead.assignedTo`
   *  is a UID — the caller already has the membership map). Optional. */
  assignedName?: string;
};

/** Build the plain-text body shown by the share sheet for a Lead. */
export function formatLeadText(lead: Lead, opts?: LeadShareOptions): string {
  const lines: string[] = [];

  lines.push(`Lead: ${lead.name}`);
  if (lead.phone) lines.push(`Phone: ${lead.phone}`);
  if (lead.email) lines.push(`Email: ${lead.email}`);

  lines.push(
    `Status: ${getLeadStatusLabel(lead.status)} · Priority: ${getLeadPriorityLabel(lead.priority)}`,
  );
  lines.push(`Source: ${getLeadSourceLabel(lead.source)}`);

  const projectParts = [
    lead.projectType ? getProjectTypeLabel(lead.projectType) : null,
    lead.location ?? null,
  ].filter((v): v is string => Boolean(v));
  if (projectParts.length > 0) {
    lines.push(`Project: ${projectParts.join(' · ')}`);
  }

  const budget = fmtInr(lead.budget);
  if (budget) lines.push(`Budget: ${budget}`);

  const expected = fmtDate(lead.expectedStartDate);
  if (expected) lines.push(`Expected start: ${expected}`);

  const followUp = fmtDate(lead.followUpAt);
  if (followUp) lines.push(`Follow-up: ${followUp}`);

  if (opts?.assignedName) lines.push(`Assigned to: ${opts.assignedName}`);

  if (lead.tags && lead.tags.length > 0) {
    lines.push(`Tags: ${lead.tags.join(', ')}`);
  }

  if (lead.requirements && lead.requirements.trim()) {
    lines.push('');
    lines.push('Requirements:');
    lines.push(lead.requirements.trim());
  }

  if (lead.notes && lead.notes.trim()) {
    lines.push('');
    lines.push('Notes:');
    lines.push(lead.notes.trim());
  }

  lines.push('');
  lines.push('— Shared from Interior OS');

  return lines.join('\n');
}

/** Open the native share sheet with a formatted Lead summary. */
export async function shareLead(
  lead: Lead,
  opts?: LeadShareOptions,
): Promise<void> {
  try {
    await Share.share({
      message: formatLeadText(lead, opts),
      title: `Lead — ${lead.name}`,
    });
  } catch {
    // User cancelled or share failed silently — nothing to do.
  }
}

// ── Appointment ────────────────────────────────────────────────────

export type AppointmentShareOptions = {
  /** Resolved name of the linked lead (when `appt.leadId` is set the
   *  detail screen has already fetched the lead — pass its name through
   *  so the share text reads "Client: <lead name>"). Optional. */
  leadName?: string;
};

/** Build the plain-text body shown by the share sheet for an Appointment. */
export function formatAppointmentText(
  appt: Appointment,
  opts?: AppointmentShareOptions,
): string {
  const lines: string[] = [];

  lines.push(`Appointment: ${appt.title}`);
  lines.push(
    `Type: ${getAppointmentTypeLabel(appt.type)} · Status: ${getAppointmentStatusLabel(appt.status)}`,
  );

  const when = fmtDateTime(appt.scheduledAt);
  if (when) {
    const duration = appt.durationMins ? ` (${appt.durationMins} min)` : '';
    lines.push(`When: ${when}${duration}`);
  }

  if (appt.location && appt.location.trim()) {
    lines.push(`Where: ${appt.location.trim()}`);
  }

  // Client block — prefer the resolved lead name; fall back to the
  // appointment's own clientName + clientPhone overrides.
  const clientName = opts?.leadName ?? appt.clientName;
  const clientLine: string[] = [];
  if (clientName) clientLine.push(clientName);
  if (appt.clientPhone) clientLine.push(appt.clientPhone);
  if (clientLine.length > 0) {
    lines.push(`Client: ${clientLine.join(' · ')}`);
  }
  if (appt.clientAddress && appt.clientAddress.trim()) {
    lines.push(`Address: ${appt.clientAddress.trim()}`);
  }

  if (appt.notes && appt.notes.trim()) {
    lines.push('');
    lines.push('Notes:');
    lines.push(appt.notes.trim());
  }

  if (appt.outcome && appt.outcome.trim()) {
    lines.push('');
    lines.push('Outcome:');
    lines.push(appt.outcome.trim());
  }

  lines.push('');
  lines.push('— Shared from Interior OS');

  return lines.join('\n');
}

/** Open the native share sheet with a formatted Appointment summary. */
export async function shareAppointment(
  appt: Appointment,
  opts?: AppointmentShareOptions,
): Promise<void> {
  try {
    await Share.share({
      message: formatAppointmentText(appt, opts),
      title: `Appointment — ${appt.title}`,
    });
  } catch {
    // User cancelled or share failed silently — nothing to do.
  }
}
