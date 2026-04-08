/**
 * Project = a single interior-fitout / construction engagement the firm
 * is executing. Lives as a root-level Firestore document so multiple
 * members of the same org can collaborate on it. `memberIds` is the
 * access list used by Firestore rules; for Phase 1 it equals the org's
 * memberIds at the moment of creation.
 */
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export type Project = {
  id: string;
  orgId: string;
  name: string;
  startDate: FirebaseFirestoreTypes.Timestamp | null;
  endDate: FirebaseFirestoreTypes.Timestamp | null;
  siteAddress: string;
  /** Project value in whole rupees (₹). */
  value: number;
  /** Local device URI for Phase 1. Will be replaced by an R2 URL once
   *  the presigned-upload Cloud Function lands. */
  photoUri: string | null;
  status: ProjectStatus;
  ownerId: string;
  memberIds: string[];
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
