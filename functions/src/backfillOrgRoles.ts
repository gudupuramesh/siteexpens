/**
 * `backfillOrgRoles` — one-shot data migration to populate the
 * `organizations/{orgId}.roles` map for studios that pre-date the
 * explicit-role model.
 *
 * Idempotent. Safe to run multiple times — only writes a role entry
 * when one is missing for that uid. After this runs, the
 * client-side / rules-side `effectiveOrgRole()` backfill paths
 * (ownerId → superAdmin, memberIds → admin) become dead code:
 * every member has an explicit row in `roles`. The fallback paths
 * stay in the codebase as a safety net for any future legacy data
 * (e.g. orgs created without going through the standard onboarding).
 *
 * Side effect: refreshes auth-token claims for every member so their
 * next token surfaces the now-explicit role without a Firestore
 * round-trip.
 *
 * Auth: callable but locked to existing Super Admins. Runs across
 * EVERY org the caller is a Super Admin in. This is intentional —
 * we don't want to expose a "wipe roles in org X" interface to the
 * client; the operation is bulk-only.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore';

import { refreshUserClaims } from './userClaims';

type RoleKey =
  | 'superAdmin'
  | 'admin'
  | 'manager'
  | 'accountant'
  | 'siteEngineer'
  | 'supervisor'
  | 'viewer'
  | 'client';

type BackfillResponse = {
  ok: true;
  /** Number of org docs scanned. */
  scanned: number;
  /** Number of org docs that received at least one new role write. */
  updated: number;
  /** Number of (org, uid) role entries written. */
  rolesWritten: number;
};

export const backfillOrgRoles = onCall<unknown, Promise<BackfillResponse>>(
  { region: 'us-central1', timeoutSeconds: 300 },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const db = getFirestore();
    const allOrgsSnap = await db.collection('organizations').get();

    // Only orgs the caller owns (Super Admin) are touched. Lets us
    // ship the callable before fully locking down the rules — even a
    // malicious admin can't run it on a studio they don't own.
    const ownedOrgs = allOrgsSnap.docs.filter(
      (doc) => doc.get('ownerId') === callerUid,
    );

    let scanned = 0;
    let updated = 0;
    let rolesWritten = 0;
    const uidsToRefresh = new Set<string>();

    for (const orgDoc of ownedOrgs) {
      scanned += 1;
      const data = orgDoc.data() as Record<string, unknown>;
      const memberIds = (data.memberIds as string[] | undefined) ?? [];
      const ownerId = data.ownerId as string;
      const existingRoles = (data.roles as Record<string, RoleKey> | undefined) ?? {};

      const writes: Record<string, RoleKey> = {};

      // Owner is always Super Admin — write it if missing.
      if (existingRoles[ownerId] !== 'superAdmin') {
        writes[ownerId] = 'superAdmin';
      }
      // Every other member is Admin if they don't have an explicit
      // role yet (matches the historical client-side backfill so
      // existing access is preserved exactly).
      for (const uid of memberIds) {
        if (uid === ownerId) continue;
        if (!existingRoles[uid]) {
          writes[uid] = 'admin';
        }
      }

      if (Object.keys(writes).length === 0) continue;

      const update: Record<string, unknown> = {};
      for (const [uid, role] of Object.entries(writes)) {
        update[`roles.${uid}`] = role;
        uidsToRefresh.add(uid);
        rolesWritten += 1;
      }
      // Merge to avoid clobbering other concurrent role edits.
      await orgDoc.ref.update(update);
      updated += 1;
    }

    // Refresh claims for every uid we touched. Run sequentially to
    // keep the callable's memory + Firestore-read pressure modest;
    // this is a one-shot migration so latency doesn't matter.
    for (const uid of uidsToRefresh) {
      await refreshUserClaims(uid);
    }

    // Suppress unused warning when no writes happened.
    void FieldValue;

    return { ok: true as const, scanned, updated, rolesWritten };
  },
);
