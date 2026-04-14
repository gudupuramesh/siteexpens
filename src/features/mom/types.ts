import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type MOM = {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  notes: string;
  date: FirebaseFirestoreTypes.Timestamp | null;
  attendees: string[];
  actionItems: string[];
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
