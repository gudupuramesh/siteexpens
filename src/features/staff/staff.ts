/**
 * Staff CRUD + attendance + payroll posting.
 *
 * Collections (top-level, discriminated by `orgId`):
 *  - `staff/{staffId}`                              — Staff
 *  - `staffAttendance/{staffId}_{YYYY-MM-DD}`        — StaffAttendance
 *
 * Payroll posting writes one `orgFinances` entry per staff with
 * category='salary' and a synthetic note carrying days/total.
 * Each staff doc's `lastPayrollMonth` is updated atomically via a
 * batch, so re-tapping "Post payroll" for the same month is a
 * no-op (the StaffSection hides the button).
 */
import { auth, db, firestore } from '@/src/lib/firebase';

import type { OrgFinance } from '@/src/features/finances/types';

import type {
  CreateStaffInput,
  Staff,
  StaffAttendance,
  StaffAttendanceStatus,
} from './types';
import { computePayroll, monthKey } from './types';

function requireUser() {
  const u = auth.currentUser;
  if (!u) throw new Error('You must be signed in.');
  return u.uid;
}

// ── Staff CRUD ──────────────────────────────────────────────────────

export async function createStaff(input: CreateStaffInput): Promise<string> {
  requireUser();
  const ref = db.collection('staff').doc();
  const cleanPhone = input.phone?.trim();
  await ref.set({
    orgId: input.orgId,
    name: input.name.trim(),
    role: input.role.trim(),
    monthlySalary: input.monthlySalary,
    payUnit: input.payUnit,
    isOrgMember: input.isOrgMember,
    orgMemberUid: input.orgMemberUid ?? null,
    archivedAt: null,
    lastPayrollMonth: null,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
    ...(cleanPhone ? { phone: cleanPhone } : {}),
    ...(input.partyId ? { partyId: input.partyId } : {}),
  });
  return ref.id;
}

export async function updateStaff(
  id: string,
  patch: Partial<
    Pick<Staff, 'name' | 'role' | 'monthlySalary' | 'payUnit' | 'orgMemberUid'>
  >,
): Promise<void> {
  requireUser();
  const data: Record<string, unknown> = {
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.role !== undefined) data.role = patch.role.trim();
  if (patch.monthlySalary !== undefined) data.monthlySalary = patch.monthlySalary;
  if (patch.payUnit !== undefined) data.payUnit = patch.payUnit;
  if (patch.orgMemberUid !== undefined) data.orgMemberUid = patch.orgMemberUid;
  await db.collection('staff').doc(id).update(data);
}

/** Soft archive — preserves attendance + payroll history. */
export async function archiveStaff(id: string): Promise<void> {
  requireUser();
  await db.collection('staff').doc(id).update({
    archivedAt: firestore.FieldValue.serverTimestamp(),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

export async function unarchiveStaff(id: string): Promise<void> {
  requireUser();
  await db.collection('staff').doc(id).update({
    archivedAt: null,
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

// ── Attendance ──────────────────────────────────────────────────────

/** Mark attendance for a staff on a specific local date. The doc
 *  id is `{staffId}_{YYYY-MM-DD}` so calling this with the same
 *  args twice updates the same row (idempotent — flips between
 *  present/half/absent). */
export async function markStaffAttendance(args: {
  staffId: string;
  orgId: string;
  date: string; // 'YYYY-MM-DD'
  status: StaffAttendanceStatus;
  hours?: number;
  note?: string;
}): Promise<void> {
  const uid = requireUser();
  const id = `${args.staffId}_${args.date}`;
  await db
    .collection('staffAttendance')
    .doc(id)
    .set(
      {
        staffId: args.staffId,
        orgId: args.orgId,
        date: args.date,
        status: args.status,
        hours: args.hours ?? null,
        note: args.note ?? '',
        recordedBy: uid,
        recordedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function clearStaffAttendance(args: {
  staffId: string;
  date: string;
}): Promise<void> {
  requireUser();
  await db
    .collection('staffAttendance')
    .doc(`${args.staffId}_${args.date}`)
    .delete();
}

// ── Payroll posting ─────────────────────────────────────────────────

export type PayrollPreviewRow = {
  staff: Staff;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  amount: number; // INR
};

/** Compute the current month's payroll preview for a list of
 *  staff given their attendance docs. Pure / synchronous — used
 *  by both the StaffSection preview and the actual `postPayroll`
 *  function so the two agree on every number to the rupee. */
export function buildPayrollPreview(
  staffList: Staff[],
  attendanceByStaff: Record<string, StaffAttendance[]>,
): PayrollPreviewRow[] {
  return staffList
    .filter((s) => !s.archivedAt)
    .map((s) => {
      const att = attendanceByStaff[s.id] ?? [];
      let presentDays = 0;
      let halfDays = 0;
      let absentDays = 0;
      for (const a of att) {
        if (a.status === 'present') presentDays += 1;
        else if (a.status === 'half') halfDays += 1;
        else if (a.status === 'absent') absentDays += 1;
      }
      const amount = computePayroll(s, presentDays, halfDays);
      return { staff: s, presentDays, halfDays, absentDays, amount };
    });
}

/** Post payroll for the given month. Creates one orgFinance
 *  entry per staff (category='salary', payee=staff name) and
 *  marks each staff's `lastPayrollMonth`. Skips any staff whose
 *  `lastPayrollMonth` already equals this month — safe to retry. */
export async function postMonthlyPayroll(args: {
  orgId: string;
  month: Date;
  rows: PayrollPreviewRow[];
}): Promise<{ posted: number; skipped: number }> {
  const uid = requireUser();
  const mk = monthKey(args.month);
  const batch = db.batch();
  let posted = 0;
  let skipped = 0;

  for (const row of args.rows) {
    if (row.staff.lastPayrollMonth === mk) {
      skipped += 1;
      continue;
    }
    if (row.amount <= 0) {
      // Don't post zero-amount entries; just mark the month done
      // so the button hides for fully-absent staff too.
      batch.update(db.collection('staff').doc(row.staff.id), {
        lastPayrollMonth: mk,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      skipped += 1;
      continue;
    }

    const financeRef = db.collection('orgFinances').doc();
    const note =
      `Payroll · ${mk} · ${row.presentDays} present` +
      (row.halfDays > 0 ? ` + ${row.halfDays} half` : '') +
      (row.absentDays > 0 ? ` · ${row.absentDays} absent` : '');

    const finance: Omit<OrgFinance, 'id'> = {
      orgId: args.orgId,
      kind: 'expense',
      category: 'salary',
      amount: row.amount,
      paidAt: firestore.Timestamp.fromDate(endOfMonthLocal(args.month)),
      payee: row.staff.name,
      payeeUid: row.staff.orgMemberUid ?? null,
      paymentMethod: 'bank',
      note,
      createdBy: uid,
      createdAt: firestore.FieldValue.serverTimestamp() as unknown as null,
      updatedAt: firestore.FieldValue.serverTimestamp() as unknown as null,
    };
    batch.set(financeRef, finance);

    batch.update(db.collection('staff').doc(row.staff.id), {
      lastPayrollMonth: mk,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    posted += 1;
  }

  await batch.commit();
  return { posted, skipped };
}

function endOfMonthLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
