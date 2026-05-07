/**
 * `createProject` — gated server-side replacement for the direct
 * `projects/{}` write the client used to do.
 *
 * Why this is a callable (not a rule-gated direct write):
 *   - Tier paywall needs to read `organizations.counters.projectCount`
 *     and `organizations.subscription.tier` together. Doing both in
 *     a Firestore rule is verbose and fragile (every direct map
 *     access must use `.get()` to avoid the silent-deny trap we
 *     hit before).
 *   - Server-side, we can run the same check inside a transaction
 *     against the org doc, so two concurrent project creates can't
 *     both squeak past a single-project Free limit.
 *   - The counter trigger (`onProjectCreateCount`) STILL runs after
 *     the doc lands; we don't double-increment because the callable
 *     does NOT touch the counter — it just inserts the project.
 *
 * Caller is the project owner (becomes `projects.{}.ownerId` and the
 * sole entry of `memberIds`). Permissions to actually CALL this:
 *   - Must be authenticated
 *   - Must be a member of the orgId being passed
 *   - Org must have `project.create` capability for the caller's role
 *     (mirrors `firestore.rules` previous create-rule)
 *   - Org must be under its `maxProjects` limit
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

import { effectiveLimits } from './limits';

const db = getFirestore();

type CreateProjectRequest = {
  orgId: string;
  name: string;
  /** ISO date string. */
  startDate: string;
  /** ISO date string OR null for "no target end date". */
  endDate: string | null;
  siteAddress: string;
  /** Project budget / value in INR. */
  value: number;
  photoUri: string | null;
  photoR2Key?: string | null;
  // Optional metadata
  status?: 'active' | 'on_hold' | 'completed' | 'archived';
  client?: string;
  location?: string;
  typology?: string;
  subType?: string;
  progress?: number;
  team?: number;
};

type CreateProjectResponse = { projectId: string };

/** Roles permitted to create a project — mirrors the client capability
 *  matrix (`project.create` = SA / Admin / Manager). */
const ROLES_WITH_CREATE: ReadonlySet<string> = new Set([
  'superAdmin',
  'admin',
  'manager',
]);

function effectiveRole(
  org: Record<string, unknown>,
  uid: string,
): string | null {
  const roles =
    (org.roles as Record<string, string> | undefined) ?? undefined;
  if (roles && roles[uid]) return roles[uid];
  if (typeof org.ownerId === 'string' && org.ownerId === uid) {
    return 'superAdmin';
  }
  const memberIds = Array.isArray(org.memberIds) ? (org.memberIds as string[]) : [];
  if (memberIds.includes(uid)) return 'admin';
  return null;
}

export const createProject = onCall<
  CreateProjectRequest,
  Promise<CreateProjectResponse>
>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const data = request.data ?? ({} as CreateProjectRequest);

  // ── Validate input ──
  if (typeof data.orgId !== 'string' || !data.orgId.trim()) {
    throw new HttpsError('invalid-argument', '`orgId` is required.');
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    throw new HttpsError('invalid-argument', '`name` is required.');
  }
  if (typeof data.startDate !== 'string') {
    throw new HttpsError('invalid-argument', '`startDate` must be an ISO date string.');
  }
  const startDate = new Date(data.startDate);
  if (Number.isNaN(startDate.getTime())) {
    throw new HttpsError('invalid-argument', '`startDate` is not a valid date.');
  }
  let endDate: Date | null = null;
  if (data.endDate !== null && data.endDate !== undefined) {
    if (typeof data.endDate !== 'string') {
      throw new HttpsError('invalid-argument', '`endDate` must be an ISO date or null.');
    }
    endDate = new Date(data.endDate);
    if (Number.isNaN(endDate.getTime())) {
      throw new HttpsError('invalid-argument', '`endDate` is not a valid date.');
    }
  }

  const orgRef = db.collection('organizations').doc(data.orgId);

  // Run inside a transaction so the read of `counters.projectCount`
  // and the increment-via-create are linearised — two concurrent
  // creates can't both squeak past a Free-tier 1-project limit.
  const projectRef = db.collection('projects').doc();
  const projectId = projectRef.id;

  await db.runTransaction(async (tx) => {
    const orgSnap = await tx.get(orgRef);
    if (!orgSnap.exists) {
      throw new HttpsError('not-found', 'Organization not found.');
    }
    const org = orgSnap.data() as Record<string, unknown>;

    // ── Membership + role check ──
    const role = effectiveRole(org, uid);
    if (!role) {
      throw new HttpsError(
        'permission-denied',
        'You are not a member of this organization.',
      );
    }
    if (!ROLES_WITH_CREATE.has(role)) {
      throw new HttpsError(
        'permission-denied',
        "Your role doesn't allow creating projects.",
      );
    }

    // ── Tier / limit check ──
    const { tier, limits } = effectiveLimits(org);
    const counters = (org.counters as { projectCount?: unknown } | undefined) ?? {};
    const currentProjectCount =
      typeof counters.projectCount === 'number' ? counters.projectCount : 0;

    if (currentProjectCount + 1 > limits.maxProjects) {
      // Friendly tier-aware error so the client paywall can read the
      // code + reason and route to the right upgrade target.
      throw new HttpsError(
        'failed-precondition',
        `Your ${tier} plan is limited to ${limits.maxProjects} project${
          limits.maxProjects === 1 ? '' : 's'
        }. Upgrade to add more.`,
        { reason: 'plan_limit_projects', tier, limit: limits.maxProjects },
      );
    }

    // ── Build the project doc ──
    const doc: Record<string, unknown> = {
      orgId: data.orgId,
      name: data.name.trim(),
      startDate: Timestamp.fromDate(startDate),
      endDate: endDate ? Timestamp.fromDate(endDate) : null,
      siteAddress: typeof data.siteAddress === 'string' ? data.siteAddress : '',
      value: typeof data.value === 'number' ? data.value : 0,
      photoUri: typeof data.photoUri === 'string' ? data.photoUri : null,
      status: data.status ?? 'active',
      ownerId: uid,
      memberIds: [uid],
      createdAt: FieldValue.serverTimestamp(),
    };

    if (data.photoR2Key) doc.photoR2Key = data.photoR2Key;
    if (data.client) doc.client = data.client;
    if (data.location) doc.location = data.location;
    if (data.typology) doc.typology = data.typology;
    if (data.subType) doc.subType = data.subType;
    if (typeof data.progress === 'number' && !Number.isNaN(data.progress)) {
      doc.progress = Math.max(0, Math.min(100, data.progress));
    }
    if (
      typeof data.team === 'number' &&
      !Number.isNaN(data.team) &&
      data.team > 0
    ) {
      doc.team = data.team;
    }

    tx.set(projectRef, doc);
  });

  return { projectId };
});
