/**
 * Studio staff (managers, supervisors, accountants, etc.) — the
 * people whose monthly salary the studio pays out of overhead.
 *
 * Two flavours:
 *  - `isOrgMember: true`  — linked to an existing org member who
 *    has a login / app account. Display picks up the member's
 *    name + role; staff doc carries the salary.
 *  - `isOrgMember: false` — record-only. Just a name + salary,
 *    no login. Same shape as daily-labour entries inside a
 *    project, used for back-office staff who don't use the app.
 *
 * Attendance is daily; payroll is monthly. Once a month's payroll
 * is posted, `lastPayrollMonth` records `'YYYY-MM'` so the "Post
 * payroll" button doesn't fire twice for the same month.
 */
import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

export type PayUnit = 'day' | 'month';

export type StaffAttendanceStatus = 'present' | 'half' | 'absent';

export type Staff = {
  id: string;
  orgId: string;
  name: string;
  /** Optional phone (E.164-ish or local). Captured from contacts picker
   *  when adding from device contacts; free to omit for record-only
   *  staff (e.g. an accountant on contract who has no app account). */
  phone?: string;
  /** Linked party doc id when this staff was added with a phone (which
   *  means a corresponding `parties/{id}` doc with `partyType='staff'`
   *  was also created). Lets the Party tab and the Staff tab refer to
   *  the same person without duplicate data entry. */
  partyId?: string;
  /** Free-text role/title (e.g. "Site Engineer", "Accountant"). */
  role: string;
  /** Monthly salary in INR. When `payUnit === 'day'` the daily
   *  rate is computed at payroll time as `monthlySalary / 22`
   *  (standard 22-working-day month — a Decisions item we picked
   *  to avoid asking the user to set both rates). */
  monthlySalary: number;
  payUnit: PayUnit;
  /** True when the staff doc is linked to an org-member record. */
  isOrgMember: boolean;
  orgMemberUid?: string | null;
  /** Soft-archive — staff that have left aren't deleted (their
   *  attendance + payroll history must stay queryable). */
  archivedAt?: FirebaseFirestoreTypes.Timestamp | null;
  /** Most recent month payroll was posted for this staff. Format
   *  `YYYY-MM`. Used to hide the "Post payroll" button once the
   *  current month has been settled. */
  lastPayrollMonth?: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};

export type StaffAttendance = {
  id: string;
  staffId: string;
  orgId: string;
  /** `YYYY-MM-DD` local. Single doc per staff per day. */
  date: string;
  status: StaffAttendanceStatus;
  hours?: number;
  note?: string;
  recordedBy: string;
  recordedAt: FirebaseFirestoreTypes.Timestamp | null;
};

export type CreateStaffInput = {
  orgId: string;
  name: string;
  phone?: string;
  /** Linked party id — set by callers that create a party first
   *  (e.g. the Add Staff form, which always creates both). Optional
   *  so legacy / programmatic callers don't have to. */
  partyId?: string;
  role: string;
  monthlySalary: number;
  payUnit: PayUnit;
  isOrgMember: boolean;
  orgMemberUid?: string | null;
  createdBy: string;
};

/** "YYYY-MM" — month key used by payroll posting + lastPayrollMonth. */
export function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** "YYYY-MM-DD" — local date key used by attendance docs. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Standard working-days-per-month — used to compute the daily
 *  rate from monthlySalary when `payUnit === 'day'`. 22 is the
 *  conventional Indian-payroll number (excludes Sundays). */
export const WORKING_DAYS_PER_MONTH = 22;

export function dailyRate(staff: Pick<Staff, 'monthlySalary' | 'payUnit'>): number {
  if (staff.payUnit === 'month') return staff.monthlySalary / WORKING_DAYS_PER_MONTH;
  return staff.monthlySalary / WORKING_DAYS_PER_MONTH;
}

/** Compute payable amount for a staff in a given month based on
 *  attendance counts. Half day counts as 0.5. */
export function computePayroll(
  staff: Pick<Staff, 'monthlySalary' | 'payUnit'>,
  presentDays: number,
  halfDays: number,
): number {
  if (staff.payUnit === 'month') {
    // Monthly rate: full salary if every working day was attended,
    // otherwise pro-rated by attendance.
    const earnedDays = presentDays + halfDays * 0.5;
    return Math.round((staff.monthlySalary * earnedDays) / WORKING_DAYS_PER_MONTH);
  }
  // Daily rate: pure days × rate.
  return Math.round((presentDays + halfDays * 0.5) * dailyRate(staff));
}
