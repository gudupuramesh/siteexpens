/**
 * Feedback feature — shared types and the module list shown in the
 * dropdown.
 *
 * Persistence: each submission writes one doc to `feedback/{id}`.
 * Screenshots upload to R2 first (kind = `feedback_screenshot`) and the
 * resulting public URLs land on the doc. The web admin portal lists +
 * triages from the same collection.
 */
import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

/** Coarse triage bucket. Shown as a 3-way segmented control on the
 *  form so admins can sort the inbox at a glance. */
export type FeedbackType = 'bug' | 'feature' | 'general';

/** Lifecycle of a feedback item, set by the admin from the web portal.
 *  Default on new submissions is `open`. */
export type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';

/** Stable identifier for each app module. Add new keys here as the
 *  app grows; never rename existing keys (the web admin filters on
 *  these strings). */
export type FeedbackModuleKey =
  | 'home'
  | 'projects'
  | 'tasks'
  | 'transactions'
  | 'finance'
  | 'dpr'
  | 'materials'
  | 'designs'
  | 'laminates'
  | 'attendance'
  | 'whiteboard'
  | 'parties'
  | 'crm'
  | 'billing'
  | 'profile'
  | 'team'
  | 'account_switching'
  | 'auth'
  | 'notifications'
  | 'tutorials'
  | 'other';

/** Display label shown in the dropdown. Order is the order rendered. */
export const FEEDBACK_MODULES: ReadonlyArray<{
  key: FeedbackModuleKey;
  label: string;
}> = [
  { key: 'home', label: 'Home / Dashboard' },
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks & Timeline' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'finance', label: 'Finance' },
  { key: 'dpr', label: 'Daily Progress Report (DPR)' },
  { key: 'materials', label: 'Materials' },
  { key: 'designs', label: 'Designs' },
  { key: 'laminates', label: 'Laminates' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'whiteboard', label: 'Whiteboard' },
  { key: 'parties', label: 'Parties (Clients / Vendors)' },
  { key: 'crm', label: 'CRM (Leads & Appointments)' },
  { key: 'billing', label: 'Billing & Subscription' },
  { key: 'profile', label: 'Studio Profile' },
  { key: 'team', label: 'Team & Roles' },
  { key: 'account_switching', label: 'Account / Org Switching' },
  { key: 'auth', label: 'Sign-in / Onboarding' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'tutorials', label: 'Tutorials' },
  { key: 'other', label: 'Other (specify below)' },
];

/** Snapshot of device + app info collected at submission time. Useful
 *  for reproducing bugs in the right environment. */
export type FeedbackDeviceInfo = {
  /** `'ios' | 'android' | 'web'` from React Native's Platform. */
  platform: string;
  /** OS version string (e.g. `'17.5.1'`). */
  osVersion: string;
  /** Hardware model from expo-device (e.g. `'iPhone 14 Pro'`). May be
   *  empty if the lookup failed (jailbroken / Simulator without info). */
  modelName: string;
  /** Internal identifier (e.g. `'iPhone15,3'`). Useful when modelName
   *  is missing — Apple's marketing names lag the identifier. */
  modelId: string;
  /** User-visible app version from app.json (e.g. `'1.0.4'`). */
  appVersion: string;
  /** Native build number (e.g. `'10'` on iOS, `'10'` on Android). */
  appBuildNumber: string;
};

/** One image attached to a feedback submission. Mirror of the R2 upload
 *  result — `publicUrl` is what the admin portal renders, `r2Key` is
 *  for any later cleanup script. */
export type FeedbackScreenshot = {
  publicUrl: string;
  r2Key: string;
  /** Bytes uploaded post-compression — useful for spotting "user sent
   *  a 12 MB photo" outliers. */
  sizeBytes: number;
};

/** Shape of `feedback/{id}`. Server-only fields (`status`, `adminNotes`,
 *  `triagedBy`, `triagedAt`) are written from the admin portal; the
 *  mobile client only writes the user-facing fields on create. */
export type Feedback = {
  id: string;
  type: FeedbackType;
  /** Stable module key. When `module === 'other'`, `moduleCustom` is
   *  the user's typed-in label. */
  module: FeedbackModuleKey;
  /** Free-text replacement for the module dropdown when the user picks
   *  Other. Trimmed; max 60 chars. Empty otherwise. */
  moduleCustom: string;
  /** Free-text body. Required. Trimmed; capped at 4000 chars on the
   *  client (no need to enforce server-side — Firestore doc-size limit
   *  catches anything pathological). */
  description: string;
  /** Up to 4 screenshots, in the order the user attached them. */
  screenshots: FeedbackScreenshot[];
  device: FeedbackDeviceInfo;
  /** Active org context at submission time. Lets admins see which
   *  studio's user is reporting the issue. Null when the user hasn't
   *  completed onboarding yet. */
  orgId: string | null;
  orgName: string | null;
  /** Author identity. `userPhone` is the canonical handle in this app
   *  (sign-in is phone-based); `userDisplayName` is what the user typed
   *  in their profile. */
  userId: string;
  userPhone: string;
  userDisplayName: string;
  userRole: string;
  // ── Admin-set fields (mobile never writes these) ─────────────────
  status: FeedbackStatus;
  adminNotes?: string;
  triagedBy?: string;
  triagedAt?: FirebaseFirestoreTypes.Timestamp | null;
  // ── Server timestamps ────────────────────────────────────────────
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};
