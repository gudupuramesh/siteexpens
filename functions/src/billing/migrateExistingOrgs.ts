/**
 * One-shot callable that backfills `subscription` + `counters` on
 * every org doc that doesn't have them yet.
 *
 * Run AFTER the billing rules + counter triggers + createProject
 * callable have shipped, so the moment this lands every existing
 * org gets:
 *   - `subscription = { tier: 'studio', status: 'trialing',
 *                       expiresAt: now + 60 days, ... }`
 *     i.e. a generous 60-day trial of Studio so existing users keep
 *     working without seeing a paywall on day one
 *   - `counters = { memberCount: |memberIds|, projectCount: count of
 *                   projects.where('orgId' == this org), storageBytes: 0 }`
 *
 * Also schedule the daily expiry sweep (`expireMigratedOrgs`) so
 * that 60 days from migration day, trialing orgs drop to `free`.
 *
 * Call only via `firebase functions:shell` or the App Owner portal.
 * Restricted to the App Owner (custom-claim `role == 'app_owner'`).
 *
 * Idempotent: re-running this only touches orgs that still lack
 * `subscription` — orgs that already have one are left alone, even
 * if they're on Free or have already expired.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

const MIGRATION_TRIAL_DAYS = 60;

type MigrateResponse = {
  scanned: number;
  migrated: number;
  alreadyMigrated: number;
  /** First 50 migrated org ids — sanity check for the caller. */
  sampleMigratedIds: string[];
};

export const migrateExistingOrgs = onCall<unknown, Promise<MigrateResponse>>(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const role = request.auth.token?.role;
    if (role !== 'app_owner') {
      throw new HttpsError(
        'permission-denied',
        'Only the App Owner can run this migration.',
      );
    }

    const expiresAt = Timestamp.fromMillis(
      Date.now() + MIGRATION_TRIAL_DAYS * 24 * 60 * 60 * 1000,
    );
    const sampleMigratedIds: string[] = [];
    let scanned = 0;
    let migrated = 0;
    let alreadyMigrated = 0;

    // Stream the orgs collection in batches so we don't load the
    // whole world into memory if there are thousands.
    const PAGE = 200;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (true) {
      let q = db.collection('organizations').limit(PAGE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;

      const writer = db.batch();
      let writes = 0;

      for (const doc of snap.docs) {
        scanned += 1;
        const data = doc.data() as Record<string, unknown>;

        // Skip orgs that already have a subscription field.
        if (data.subscription && typeof data.subscription === 'object') {
          alreadyMigrated += 1;
          continue;
        }

        // Compute initial counters from authoritative sources.
        const memberIds = Array.isArray(data.memberIds)
          ? (data.memberIds as unknown[])
          : [];
        const projectsSnap = await db
          .collection('projects')
          .where('orgId', '==', doc.id)
          .count()
          .get();
        const projectCount = projectsSnap.data().count;

        writer.set(
          doc.ref,
          {
            subscription: {
              tier: 'studio',
              status: 'trialing',
              expiresAt,
              willRenew: false,
              revenueCatId: null,
              productId: null,
              period: null,
              updatedAt: FieldValue.serverTimestamp(),
              source: 'migration',
            },
            counters: {
              memberCount: memberIds.length,
              projectCount,
              storageBytes: 0,
            },
          },
          { merge: true },
        );
        writes += 1;
        migrated += 1;
        if (sampleMigratedIds.length < 50) {
          sampleMigratedIds.push(doc.id);
        }
      }

      if (writes > 0) await writer.commit();
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < PAGE) break;
    }

    return { scanned, migrated, alreadyMigrated, sampleMigratedIds };
  },
);
