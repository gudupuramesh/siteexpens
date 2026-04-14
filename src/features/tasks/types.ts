import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type TaskStatus = 'not_started' | 'ongoing' | 'completed';

export type Task = {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  startDate: FirebaseFirestoreTypes.Timestamp | null;
  endDate: FirebaseFirestoreTypes.Timestamp | null;
  quantity: number;
  completedQuantity: number;
  unit: string;
  assignedTo: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
