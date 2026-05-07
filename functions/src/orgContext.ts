/**
 * `setPrimaryOrganization` — production-safe active workspace switch.
 *
 * Clients must not mutate `users/{uid}.primaryOrgId` after onboarding (see
 * Firestore rules). This callable verifies `request.auth.uid` belongs to
 * the org in any capacity, then merges `primaryOrgId`.
 *
 * Membership check uses the UNION of:
 *   • `memberIds[]`       — regular paid roles (admin / manager / etc.)
 *   • `roles[uid]`        — anyone with an explicit role, INCLUDING clients
 *                           (clients deliberately do NOT live in memberIds
 *                            because they're exempt from the maxMembers cap)
 *   • `ownerId === uid`   — the studio owner is always considered a member
 *
 * Earlier versions only checked `memberIds`, which silently rejected
 * clients trying to switch to a studio they'd been invited to as a
 * client. The org switcher would show a spinner and then stop with no
 * feedback (the sheet swallows the permission-denied in console.warn).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { refreshUserClaims } from './userClaims';

type Payload = { orgId?: string };

export const setPrimaryOrganization = onCall<Payload>(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const raw = req.data?.orgId;
  const orgId = typeof raw === 'string' ? raw.trim() : '';
  if (!orgId) {
    throw new HttpsError('invalid-argument', '`orgId` is required.');
  }

  const db = getFirestore();
  const orgRef = db.collection('organizations').doc(orgId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new HttpsError('not-found', 'Organization not found.');
  }

  const data = orgSnap.data() as Record<string, unknown> | undefined;
  const memberIds = (data?.memberIds as string[] | undefined) ?? [];
  const roles = (data?.roles as Record<string, string> | undefined) ?? {};
  const ownerId = typeof data?.ownerId === 'string' ? (data.ownerId as string) : '';

  const isMember = memberIds.includes(uid) || !!roles[uid] || ownerId === uid;
  if (!isMember) {
    throw new HttpsError(
      'permission-denied',
      'You are not a member of this organization.',
    );
  }

  await db.collection('users').doc(uid).set({ primaryOrgId: orgId }, { merge: true });

  // Refresh custom claims so the client's auth token immediately
  // reflects the new active org. Non-blocking on failure — the
  // client's safety-net `forceRefreshClaims` retry covers stragglers.
  await refreshUserClaims(uid);

  return { ok: true as const };
});
