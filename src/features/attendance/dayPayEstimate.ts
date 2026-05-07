/**
 * Rough same-day labour cost from attendance (present / half-day / paid leave).
 * Hourly rates assume an 8h working day for day-equivalent pay.
 */
import { formatInr } from '@/src/lib/format';

import type { AttendanceRecord, AttendanceStatus } from './types';

const STANDARD_DAY_HOURS = 8;

export function attendanceStatusLabel(status: AttendanceStatus): string {
  switch (status) {
    case 'present':
      return 'Present';
    case 'half_day':
      return 'Half day';
    case 'absent':
      return 'Absent';
    case 'paid_leave':
      return 'Paid leave';
    case 'week_off':
      return 'Week off';
    default:
      return status;
  }
}

/** Day-equivalent rate (₹/day) from stored rate + unit. */
function dayEquivalentRate(payRate: number, payUnit: 'day' | 'hour' | undefined): number {
  const unit = payUnit ?? 'day';
  return unit === 'hour' ? payRate * STANDARD_DAY_HOURS : payRate;
}

/**
 * Estimated amount attributed to this day for payroll-style snapshot (not accounting advice).
 * Returns null when no rate is set.
 */
export function estimatedPayForAttendanceRecord(r: AttendanceRecord): number | null {
  const rate = r.payRate;
  if (rate == null || rate <= 0) return null;
  const dayRate = dayEquivalentRate(rate, r.payUnit);
  switch (r.status) {
    case 'present':
      return Math.round(dayRate);
    case 'half_day':
      return Math.round(dayRate * 0.5);
    case 'paid_leave':
      return Math.round(dayRate);
    default:
      return 0;
  }
}

export function formatAttendanceRateLabel(r: AttendanceRecord): string {
  if (r.payRate == null || r.payRate <= 0) return '—';
  const u = r.payUnit ?? 'day';
  return u === 'hour' ? `${formatInr(r.payRate)}/hr` : `${formatInr(r.payRate)}/day`;
}

export function formatEstimatedPayLabel(amount: number | null): string {
  if (amount == null) return '—';
  return formatInr(amount);
}

/** Sum estimated pay for rows with a defined rate; null if none have rates. */
export function sumEstimatedPay(records: AttendanceRecord[]): number | null {
  let sum = 0;
  let anyRated = false;
  for (const r of records) {
    const v = estimatedPayForAttendanceRecord(r);
    if (v !== null) {
      sum += v;
      anyRated = true;
    }
  }
  return anyRated ? sum : null;
}
