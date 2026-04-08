/**
 * Organization = the company/firm the user works for. A user belongs to
 * exactly one *primary* organization (set on first onboarding) but may
 * later be added as a member of others. For Phase 1 we only track the
 * primary org.
 */
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type Organization = {
  id: string;
  name: string;
  email: string;
  ownerId: string;
  memberIds: string[];
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};

export type UserDoc = {
  phoneNumber: string;
  displayName: string;
  photoURL: string | null;
  email?: string;
  primaryOrgId: string | null;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
