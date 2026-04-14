import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type Laminate = {
  id: string;
  projectId: string;
  orgId: string;
  roomName: string;
  brand: string;
  finish: string;
  edgeBandCode: string;
  laminateCode?: string;
  photoUrl?: string;
  photoStoragePath?: string;
  notes?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  createdBy: string;
};

/** Group laminates by room */
export type RoomLaminates = {
  roomName: string;
  laminates: Laminate[];
};
