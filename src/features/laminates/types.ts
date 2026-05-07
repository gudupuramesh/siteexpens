import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

export type Laminate = {
  id: string;
  projectId: string;
  orgId: string;
  roomName: string;
  brand: string;
  finish: string;
  // Optional in newer entries; older docs always have it.
  edgeBandCode?: string;
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
