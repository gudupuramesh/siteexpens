/**
 * SiteExpens Cloud Functions entry point.
 *
 * Each callable lives in its own module and is re-exported from here so
 * Firebase discovers every named export at deploy time.
 *
 * Live:
 *   - helloWorld              — pipeline smoke test
 *   - mintDevTestToken        — dev-only phone+PIN → Firebase custom token (secrets)
 *   - r2PresignedUploadUrl    — mints presigned PUT URLs for Cloudflare R2
 *   - inviteMember            — resolve phone number to user, add to org or stash invite
 *   - claimInvites            — first-login reconciler for `invites/{phone}` docs
 *   - removeMember              — demote-only org member removal
 *   - setPrimaryOrganization    — verified switch of `users.primaryOrgId`
 *   - onMaterialRequestWrite    — Expo push on material approval workflow
 *   - onTransactionWrite           — Expo push on transaction approval workflow
 *   - onOrganizationWriteMemberPublic — sync org-scoped memberPublic profiles
 *   - onUserWriteMemberPublic         — refresh memberPublic on user profile edits
 *   - backfillMemberPublic            — Super Admin one-shot projection fill
 */
import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';

/**
 * Without `serviceAccountId`, firebase-admin resolves the signer from VM metadata
 * (`…-compute@developer…`) and calls signBlob on *that* account. Granting Token Creator
 * on `firebase-adminsdk-*` only does not help. Pinning the Firebase Admin SDK SA makes
 * IAMSigner use `firebase-adminsdk-*` — matching the IAM binding Compute SA already has.
 *
 * Override per deployment: `firebase functions:config:set` / env `FIREBASE_ADMIN_SDK_EMAIL`.
 */
const FIREBASE_ADMIN_SDK_EMAIL =
  process.env.FIREBASE_ADMIN_SDK_EMAIL ??
  'firebase-adminsdk-fbsvc@sitexpens.iam.gserviceaccount.com';

initializeApp({
  serviceAccountId: FIREBASE_ADMIN_SDK_EMAIL,
});

export const helloWorld = onCall((_request) => {
  return { ok: true, message: 'SiteExpens functions are live.' };
});

export { r2PresignedUploadUrl } from './r2';
export { recordStorageEvent, r2DeleteObject } from './storage';
export { deleteProjectCascade } from './projectDelete';
export { mintCustomToken } from './auth';
export { mintDevTestToken } from './devAuth';
export { deleteAccount } from './deleteAccount';
export { inviteMember, claimInvites, removeMember } from './invites';
export { setPrimaryOrganization } from './orgContext';
export { forceRefreshClaims } from './userClaims';
export { setMemberRole } from './setMemberRole';
export { backfillOrgRoles } from './backfillOrgRoles';
export { createOrganization } from './createOrgFn';
export {
  onOrganizationWriteMemberPublic,
  onUserWriteMemberPublic,
  backfillMemberPublic,
} from './memberPublicSync';
export { onMaterialRequestWrite, onTransactionWrite } from './approvalNotifications';

// ── Billing ────────────────────────────────────────────────────────
// Phase A — Tier-aware project create + denormalised counters +
//   one-shot migration of legacy orgs onto a 60-day Studio trial
// Phase C — RevenueCat webhook receives subscription events from
//   the App Store / Google Play (via RC) and writes them to
//   `organizations/{orgId}.subscription`. The client SDK
//   (`react-native-purchases`) handles the actual purchase flow;
//   server-side we only listen for the resulting events.
export {
  onProjectCreateCount,
  onProjectDeleteCount,
  onOrgWriteSyncMemberCount,
} from './billing/counters';
export { createProject } from './billing/createProject';
export { migrateExistingOrgs } from './billing/migrateExistingOrgs';
export { revenueCatWebhook } from './billing/revenueCatWebhook';

// ── Admin portal (Phase E) ─────────────────────────────────────────
// Callables for the App Owner web admin at admin.siteexpens.com.
// Every callable starts with assertAppOwner() — bypass via custom
// claim `role: 'app_owner'` on the user record. Audit log on every
// write goes to `adminAudit/`.
export { adminListSubscribers } from './admin/adminListSubscribers';
export { adminOverrideOrgTier } from './admin/adminOverrideOrgTier';
export { adminUpdatePlanConfig } from './admin/adminUpdatePlanConfig';
export { adminGetRevenueAnalytics } from './admin/adminGetRevenueAnalytics';
