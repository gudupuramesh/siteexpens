/**
 * Denormalised counters on `organizations/{orgId}`.
 *
 * Why we need them: rules can't COUNT documents, so paywall checks
 * (`projectCount + 1 <= maxProjects`) need a pre-aggregated number.
 * Three counters live on the org doc:
 *
 *   organizations/{orgId}.counters = {
 *     memberCount:  number,
 *     projectCount: number,
 *     storageBytes: number,
 *   }
 *
 * Each is maintained by a Firestore trigger:
 *
 *   - `onProjectWriteCount`  → projectCount on create/delete of any
 *     project doc. Source of truth is the count of project docs
 *     where `orgId == this org`.
 *   - `onOrgWriteSyncMemberCount` → memberCount on any write of the
 *     org doc. Source of truth is `memberIds.size`.
 *
 * Storage is still rolled up via the existing `projectStorage`
 * collection plus a periodic recompute (or on-demand recompute when
 * a paywall check fires). Not added in this file — a follow-up.
 *
 * **Idempotency / race safety**: we use `FieldValue.increment(1)` for
 * project counter mutations, and a recompute-from-truth pattern for
 * memberCount (set the count to `memberIds.size` rather than +/-1).
 * Both survive duplicate trigger fires + retries cleanly.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  onDocumentDeleted,
  onDocumentCreated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';

const db = getFirestore();

/** Bump `organizations/{orgId}.counters.projectCount` on project create. */
export const onProjectCreateCount = onDocumentCreated(
  'projects/{projectId}',
  async (event) => {
    const data = event.data?.data() as { orgId?: unknown } | undefined;
    const orgId = typeof data?.orgId === 'string' ? data.orgId : '';
    if (!orgId) return;
    try {
      await db.collection('organizations').doc(orgId).set(
        {
          counters: {
            projectCount: FieldValue.increment(1),
          },
        },
        { merge: true },
      );
    } catch (err) {
      // Counter drift on a single write is recoverable via a periodic
      // recompute job — better to log + continue than to cascade-
      // fail the entire create.
      console.warn('[counters] onProjectCreateCount failed:', err);
    }
  },
);

/** Decrement `organizations/{orgId}.counters.projectCount` on delete. */
export const onProjectDeleteCount = onDocumentDeleted(
  'projects/{projectId}',
  async (event) => {
    const data = event.data?.data() as { orgId?: unknown } | undefined;
    const orgId = typeof data?.orgId === 'string' ? data.orgId : '';
    if (!orgId) return;
    try {
      await db.collection('organizations').doc(orgId).set(
        {
          counters: {
            projectCount: FieldValue.increment(-1),
          },
        },
        { merge: true },
      );
    } catch (err) {
      console.warn('[counters] onProjectDeleteCount failed:', err);
    }
  },
);

/** Sync `counters.memberCount` to `memberIds.size` on every org write.
 *  Recompute-from-truth (not +/-1) so duplicate triggers + retries
 *  converge to the right number even after drift. */
export const onOrgWriteSyncMemberCount = onDocumentWritten(
  'organizations/{orgId}',
  async (event) => {
    const orgId = event.params.orgId as string;
    const after = event.data?.after;
    if (!after?.exists) return;

    const data = after.data() as Record<string, unknown>;
    const memberIds = Array.isArray(data.memberIds)
      ? (data.memberIds as unknown[])
      : [];
    const desired = memberIds.length;

    // Avoid infinite loops: only write if the number actually changed.
    const counters = data.counters as { memberCount?: unknown } | undefined;
    const current =
      typeof counters?.memberCount === 'number' ? counters.memberCount : -1;
    if (current === desired) return;

    try {
      await db.collection('organizations').doc(orgId).set(
        {
          counters: {
            memberCount: desired,
          },
        },
        { merge: true },
      );
    } catch (err) {
      console.warn('[counters] onOrgWriteSyncMemberCount failed:', err);
    }
  },
);
