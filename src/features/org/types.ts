/**
 * Organization = the company/firm the user works for. A user may belong to
 * several studios (`organizations.{id}.memberIds`). The **active workspace**
 * is `UserDoc.primaryOrgId`; switching it changes which org’s data the app
 * loads (projects, CRM, finances). First onboarding sets `primaryOrgId`; further
 * changes use the `setPrimaryOrganization` callable.
 */
import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

/**
 * Org member role. The org creator gets `superAdmin` and is the only one of
 * that role. Every other member has exactly one of the remaining seven.
 */
export type RoleKey =
  | 'superAdmin'
  | 'admin'
  | 'manager'
  | 'accountant'
  | 'siteEngineer'
  | 'supervisor'
  | 'viewer'
  | 'client';

/** Optional studio fields on `organizations/{id}` (beyond core identity). */
export type OrganizationProfileExtras = {
  /** Full-width header image on studio profile (public R2 URL). */
  coverPhotoUrl?: string;
  coverPhotoR2Key?: string;
  /** Square studio logo / icon on profile (public R2 URL). */
  logoUrl?: string;
  logoR2Key?: string;
  tagline?: string;
  founded?: number;
  website?: string;
  instagram?: string;
  linkedin?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
  pan?: string;
  rera?: string;
  bankName?: string;
  bankAccount?: string;
  bankIFSC?: string;
  bankBranch?: string;
  upi?: string;
  altEmail?: string;
  altPhone?: string;
  liveProjects?: number;
  completedProjects?: number;
  cities?: number;
};

export type Organization = {
  id: string;
  name: string;
  email: string;
  ownerId: string;
  memberIds: string[];
  /** uid -> role for every member. Owner is always `superAdmin`. */
  roles?: Record<string, RoleKey>;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
} & OrganizationProfileExtras;

export type UserDoc = {
  phoneNumber: string;
  displayName: string;
  photoURL: string | null;
  email?: string;
  /** Active org context (`organizations/{id}`). User may be in multiple orgs. */
  primaryOrgId: string | null;
  /** Expo push tokens for approval alerts (Cloud Functions). */
  expoPushTokens?: string[];
  expoPushTokenUpdatedAt?: FirebaseFirestoreTypes.Timestamp | null;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  /** Owner title on studio profile (e.g. Principal Designer). */
  role?: string;
  altEmail?: string;
  altPhone?: string;
};
