/**
 * `createOrganization` — one-owned-studio-per-user enforcement.
 *
 * Product rule: a user may CREATE only one studio. They can be a
 * MEMBER of as many other studios as people invite them to (in
 * different roles), but ownership is single-org per phone number.
 *
 * This rule used to live on the client (`createOrganization` in
 * `src/features/org/organizations.ts` did a direct Firestore batch
 * write). Firestore rules can't efficiently enforce "no other org
 * has this user as ownerId" without a query, so the limit was
 * trivially bypassable. Moving the create here:
 *   - The callable does the existence check via a `where('ownerId',
 *     '==', uid)` query (Admin SDK, bypasses rules).
 *   - Rejects with `failed-precondition` when the user already
 *     owns one — surfaces a friendly inline error in the UI.
 *   - Otherwise atomically writes the org doc + sets the user's
 *     `primaryOrgId`, then refreshes auth-token claims so the new
 *     studio appears in `claims.orgs` immediately.
 *
 * Firestore rules block ALL client writes to `organizations.create`
 * — this callable is the only path.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore';

import { refreshUserClaims } from './userClaims';

type CreateOrganizationRequest = {
  /** Studio name. Trimmed, 2-80 chars. */
  name: string;
  /** Owner work email — also mirrored onto `users/{uid}.email`. */
  email: string;
};

type CreateOrganizationResponse = {
  ok: true;
  orgId: string;
};

export const createOrganization = onCall<
  CreateOrganizationRequest,
  Promise<CreateOrganizationResponse>
>(
  { region: 'us-central1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const data = request.data;
    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Request body is missing.');
    }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    if (name.length < 2 || name.length > 80) {
      throw new HttpsError('invalid-argument', 'Studio name must be 2–80 characters.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'A valid work email is required.');
    }

    const db = getFirestore();

    // ── ENFORCE: at most one studio owned per user ──
    // Single doc query with `limit(1)` — cheap (~1ms even with
    // tens of thousands of orgs since `ownerId` is indexed).
    const existing = await db
      .collection('organizations')
      .where('ownerId', '==', uid)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new HttpsError(
        'failed-precondition',
        'You already own a studio. You can only create one studio per account, but you can join other studios when invited.',
      );
    }

    // ── Create org + set primaryOrgId atomically ──
    const orgRef = db.collection('organizations').doc();
    const userRef = db.collection('users').doc(uid);
    const batch = db.batch();
    batch.set(orgRef, {
      name,
      email,
      ownerId: uid,
      memberIds: [uid],
      // Explicit role map from day one — no backfill needed for new orgs.
      roles: { [uid]: 'superAdmin' },
      createdAt: FieldValue.serverTimestamp(),
    });
    // Switch the new owner's active workspace to the just-created org.
    // Their previous primaryOrgId (if they had one — multi-org users
    // who switch into the new studio) is overwritten; they can switch
    // back via the profile org switcher.
    batch.set(userRef, { primaryOrgId: orgRef.id, email }, { merge: true });
    await batch.commit();

    // Sync claims so `claims.orgs[newOrgId] = 'superAdmin'` and
    // `claims.primaryOrgId = newOrgId` are visible to the client on
    // its next token refresh — `setActiveOrg` / `useTokenClaims`
    // pulls them down within ~400ms.
    await refreshUserClaims(uid);

    return { ok: true as const, orgId: orgRef.id };
  },
);
