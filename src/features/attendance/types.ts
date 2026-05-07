import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'paid_leave' | 'week_off';
export type AttendanceUiStatus = AttendanceStatus | 'unmarked' | 'loading';

export type ProjectLabour = {
  id: string;
  orgId: string;
  projectId: string;
  labourId: string;
  labourName: string;
  labourRole: string;
  description?: string;
  payRate?: number;
  payUnit?: 'day' | 'hour';
  disabled?: boolean;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  updatedAt?: FirebaseFirestoreTypes.Timestamp | null;
};

export type AttendanceRecord = {
  id: string;
  orgId: string;
  projectId: string;
  labourId: string;
  labourName: string;
  labourRole: string;
  /** Optional detail note for worker (e.g. POP finishing, night shift). */
  description?: string;
  /** Optional pay amount captured at mark time. */
  payRate?: number;
  /** Unit for pay rate. */
  payUnit?: 'day' | 'hour';
  /** Soft-disable flag to hide worker from active attendance list. */
  disabled?: boolean;
  date: string; // YYYY-MM-DD for easy querying
  status: AttendanceStatus;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
