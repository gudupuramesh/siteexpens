import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'paid_leave' | 'week_off';

export type AttendanceRecord = {
  id: string;
  orgId: string;
  projectId: string;
  labourId: string;
  labourName: string;
  labourRole: string;
  date: string; // YYYY-MM-DD for easy querying
  status: AttendanceStatus;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
