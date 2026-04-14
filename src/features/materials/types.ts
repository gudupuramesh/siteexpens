import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type MaterialCategory = 'request' | 'received' | 'used';

export type Material = {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  category: MaterialCategory;
  quantity: number;
  unit: string;
  rate: number;
  totalCost: number;
  supplier: string;
  date: FirebaseFirestoreTypes.Timestamp | null;
  notes: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
