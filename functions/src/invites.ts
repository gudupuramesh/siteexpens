/**
 * Studio invitation callables.
 *
 * Three v2 callables:
 *   - inviteMember   — invite by phone (existing user → add now; new phone → pending invite)
 *   - claimInvites   — first-login reconciler; reads invites/{phone} and joins each org
 *   - removeMember   — demote-only; drops uid from memberIds + roles[uid]
 *
 * Phone is the join key. Server normalizes raw input to E.164, then either
 * adds the user to `organizations/{orgId}` directly or stores a pending
 * `invites/{E164}` doc. On first sign-in, `claimInvites` reads that doc and
 * batches the org writes under Admin SDK so Firestore rules don't block it.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

import { refreshUserClaims } from './userClaims';
import { writeMemberPublicDoc } from './memberPublicSync';
import { effectiveLimits } from './billing/limits';

const ASSIGNABLE_ROLES = [
  'admin',
  'manager',
  'accountant',
  'siteEngineer',
  'supervisor',
  'viewer',
  'client',
] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

type RoleKey = AssignableRole | 'superAdmin';

// ── Phone normalization ─────────────────────────────────────────────
//
// We accept raw input (with spaces, parens, dashes, +country code, or
// no country code). For Indian-only phones we default to +91 when the
// raw digit string is exactly 10 characters and has no leading +.

function normalizePhoneE164(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D+/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = trimmed.replace(/\D+/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────

async function readCallerRole(orgId: string, uid: string): Promise<RoleKey | null> {
  const db = getFirestore();
  const snap = await db.collection('organizations').doc(orgId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown> | undefined;
  const roles = data?.roles as Record<string, RoleKey> | undefined;
  if (roles && roles[uid]) return roles[uid];

  const memberIds = data?.memberIds as string[] | undefined;
  const ownerId = data?.ownerId as string | undefined;
  // Backfill: orgs created before the roles map exists treat ownerId as
  // superAdmin and other members as admins so existing studios aren't locked
  // out of the new flow.
  if (ownerId === uid) return 'superAdmin';
  if (memberIds?.includes(uid)) return 'admin';
  return null;
}

function ensureRole(
  callerRole: RoleKey | null,
  requested: RoleKey,
  opts?: { projectIds?: string[] },
): void {
  if (!callerRole) {
    throw new HttpsError('permission-denied', 'You are not a member of this studio.');
  }
  if (requested === 'superAdmin') {
    throw new HttpsError(
      'permission-denied',
      'Super Admin can only be assigned by transferring ownership.',
    );
  }
  // Managers may only invite Clients, and only when at least one project is
  // specified (typical path: Party tab → Add team member → Client).
  if (callerRole === 'manager') {
    if (requested !== 'client') {
      throw new HttpsError(
        'permission-denied',
        'Managers can only invite clients to a project. Use Team & roles for other roles.',
      );
    }
    const ids = opts?.projectIds ?? [];
    if (ids.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Managers must specify at least one project when inviting a client.',
      );
    }
    return;
  }
  if (callerRole !== 'superAdmin' && callerRole !== 'admin') {
    throw new HttpsError('permission-denied', 'Only Super Admin or Admin can invite members.');
  }
  if (requested === 'admin' && callerRole !== 'superAdmin') {
    throw new HttpsError('permission-denied', 'Only Super Admin can promote a member to Admin.');
  }
}

// ── inviteMember ────────────────────────────────────────────────────

type InviteMemberRequest = {
  orgId: string;
  phoneNumber: string;
  role: AssignableRole;
  /**
   * Project ids this member has access to. For non-superAdmin roles this is
   * the source of truth for project visibility. Empty = no projects yet
   * (admin/accountant default to all projects on the client side).
   *
   * Legacy callers may still send `projectId: string` for client invites;
   * the server normalizes either shape to `projectIds`.
   */
  projectIds?: string[];
  /** Legacy single-project field. Treated as `projectIds: [projectId]`. */
  projectId?: string;
  displayName?: string;
};

type InviteMemberResponse = {
  joinedNow: boolean;
  uid?: string;
};

export const inviteMember = onCall<InviteMemberRequest, Promise<InviteMemberResponse>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign-in is required.');
    }
    const data = request.data;
    if (!data || typeof data !== 'object') {
      throw new HttpsError('invalid-argument', 'Request body is missing.');
    }
    const { orgId, phoneNumber, role, displayName } = data;

    if (typeof orgId !== 'string' || !orgId) {
      throw new HttpsError('invalid-argument', '`orgId` is required.');
    }
    if (typeof role !== 'string' || !ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
      throw new HttpsError(
        'invalid-argument',
        `\`role\` must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
      );
    }

    // Normalize projectIds (accept legacy `projectId: string` shape).
    const rawIds = Array.isArray(data.projectIds) ? data.projectIds : [];
    if (rawIds.some((id) => typeof id !== 'string')) {
      throw new HttpsError('invalid-argument', '`projectIds` must be a string array.');
    }
    const projectIds: string[] = rawIds.filter((id) => typeof id === 'string' && id.length > 0);
    if (typeof data.projectId === 'string' && data.projectId && !projectIds.includes(data.projectId)) {
      projectIds.push(data.projectId);
    }

    if (role === 'client' && projectIds.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Client invitations require at least one project in `projectIds`.',
      );
    }

    const e164 = normalizePhoneE164(phoneNumber);
    if (!e164) {
      throw new HttpsError('invalid-argument', 'Phone number is invalid.');
    }

    const callerRole = await readCallerRole(orgId, request.auth.uid);
    ensureRole(callerRole, role as RoleKey, { projectIds });

    const db = getFirestore();
    const auth = getAuth();

    // Auth lookup happens BEFORE the transaction — `auth.getUserByPhoneNumber`
    // is not Firestore and can't participate in `runTransaction`. We use the
    // result to decide which Firestore branch to take inside the tx.
    let uid: string | null = null;
    try {
      const u = await auth.getUserByPhoneNumber(e164);
      uid = u.uid;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/user-not-found') {
        throw new HttpsError(
          'internal',
          `Failed to look up phone number: ${(e as Error).message}`,
        );
      }
    }

    const orgRef = db.collection('organizations').doc(orgId);
    const userRef = uid ? db.collection('users').doc(uid) : null;
    const callerUid = request.auth.uid;

    // ── Cap check + writes inside ONE transaction ─────────────────
    // Why a transaction: without one, two concurrent invite calls
    // (admin double-tap, or two admins online at once) could BOTH
    // pass the cap check on a stale read and BOTH commit a +1,
    // overshooting the limit. Wrapping the read+write in
    // `db.runTransaction` makes Firestore re-run the body if the
    // org doc or pendingInvites collection changed between read and
    // commit — concurrent invites serialize and the second one sees
    // the first one's +1 before deciding.
    //
    // Firestore tx rule: ALL reads must precede ALL writes inside
    // the body. The block below honours that order.
    const orgAfter = await db.runTransaction<Record<string, unknown>>(async (tx) => {
      // Reads
      const orgSnap = await tx.get(orgRef);
      if (!orgSnap.exists) {
        throw new HttpsError('not-found', 'Organization not found.');
      }
      const org = orgSnap.data() as Record<string, unknown>;
      const memberIds = Array.isArray(org.memberIds)
        ? (org.memberIds as string[])
        : [];
      const { tier, limits } = effectiveLimits(org);

      let pendingNonClientCount = 0;
      if (role !== 'client' && Number.isFinite(limits.maxMembers)) {
        const pendingSnap = await tx.get(orgRef.collection('pendingInvites'));
        for (const d of pendingSnap.docs) {
          const data = d.data() as { role?: string };
          if (data.role === 'client') continue;
          // Don't double-count THIS invite if a pending doc for the
          // same phone already exists (re-invite of someone who never
          // signed up). Pending docs are keyed by E.164.
          if (d.id === e164) continue;
          pendingNonClientCount += 1;
        }
      }

      let userExisting: Record<string, unknown> = {};
      if (userRef) {
        const userSnap = await tx.get(userRef);
        userExisting = userSnap.exists
          ? (userSnap.data() as Record<string, unknown>)
          : {};
      }

      // Cap check (clients live in clientUids, not memberIds — exempt)
      if (role !== 'client') {
        const alreadyMember = uid ? memberIds.includes(uid) : false;
        if (
          !alreadyMember &&
          memberIds.length + pendingNonClientCount + 1 > limits.maxMembers
        ) {
          throw new HttpsError(
            'failed-precondition',
            `Your ${tier} plan is limited to ${limits.maxMembers} member${
              limits.maxMembers === 1 ? '' : 's'
            } — ${memberIds.length} joined plus ${pendingNonClientCount} pending invite${
              pendingNonClientCount === 1 ? '' : 's'
            } already counts toward the cap. Upgrade to add more.`,
            {
              reason: 'plan_limit_members',
              tier,
              limit: limits.maxMembers,
            },
          );
        }
      }

      // Writes — branch on whether the invitee has an account yet.
      if (uid && userRef) {
        if (role === 'client') {
          for (const pid of projectIds) {
            tx.update(db.collection('projects').doc(pid), {
              clientUids: FieldValue.arrayUnion(uid),
            });
          }
          tx.set(orgRef, { roles: { [uid]: 'client' } }, { merge: true });
        } else {
          tx.update(orgRef, {
            memberIds: FieldValue.arrayUnion(uid),
            [`roles.${uid}`]: role,
          });
          for (const pid of projectIds) {
            tx.update(db.collection('projects').doc(pid), {
              memberIds: FieldValue.arrayUnion(uid),
            });
          }
        }

        // Set primaryOrgId only when currently null — never overwrite.
        if (!userExisting.primaryOrgId && role !== 'client') {
          tx.set(userRef, { primaryOrgId: orgId }, { merge: true });
        }
      } else {
        // No account yet — stash a pending invite. Two docs:
        //   1. `invites/{E164}` — phone-keyed, read by invitee on first sign-in
        //   2. `organizations/{orgId}/pendingInvites/{E164}` — org-scoped mirror
        //      shown alongside real members in Team & Roles
        const inviteRef = db.collection('invites').doc(e164);
        const orgEntry: Record<string, unknown> = {
          role,
          projectIds,
          invitedBy: callerUid,
          invitedAt: FieldValue.serverTimestamp(),
        };
        if (displayName) orgEntry.displayName = displayName;

        const pendingRef = orgRef.collection('pendingInvites').doc(e164);

        tx.set(
          inviteRef,
          {
            orgs: { [orgId]: orgEntry },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        tx.set(
          pendingRef,
          {
            phoneNumber: e164,
            role,
            projectIds,
            displayName: displayName ?? null,
            invitedBy: callerUid,
            invitedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      return org;
    });

    if (uid) {
      // Project + org membership are now committed. The
      // `onOrganizationWriteMemberPublic` Firestore trigger will
      // ALSO write `memberPublic/{uid}` asynchronously — but that
      // can take a few hundred ms, during which the inviter's
      // PartyTab snapshot listener fires (project.memberIds
      // changed) and tries to read the brand-new uid's
      // memberPublic doc, gets nothing, and renders a blank
      // "Member" row with no phone or role. Write the doc inline
      // so the inviting client sees the row populated immediately.
      try {
        // Re-read the org post-tx so memberPublic sees the freshly
        // committed memberIds/roles. The tx-captured `orgAfter`
        // snapshot predates our own writes.
        const orgSnapAfter = await orgRef.get();
        const orgPost = (orgSnapAfter.data() ?? orgAfter) as Record<string, unknown>;
        await writeMemberPublicDoc(orgId, orgPost, uid);
      } catch (err) {
        console.warn('[inviteMember] inline memberPublic write failed:', err);
      }

      await refreshUserClaims(uid);
      return { joinedNow: true, uid };
    }

    return { joinedNow: false };
  },
);

// ── claimInvites ────────────────────────────────────────────────────

type ClaimInvitesResponse = {
  joined: { orgId: string; role: RoleKey }[];
  primaryOrgId: string | null;
  /**
   * Orgs whose invite was VALID but rejected because the org's plan
   * is at member capacity right now. Pending invite docs for these
   * orgs are NOT deleted — admin can free a slot and the invitee can
   * try `claimInvites` again. Client surface can show a toast/dialog
   * explaining which studios were skipped and why.
   */
  skippedDueToCap: { orgId: string; orgName?: string }[];
};

export const claimInvites = onCall<unknown, Promise<ClaimInvitesResponse>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign-in is required.');
    }
    const phone = request.auth.token?.phone_number;
    if (typeof phone !== 'string' || !phone) {
      // No phone on the token — nothing to claim.
      return { joined: [], primaryOrgId: null, skippedDueToCap: [] };
    }
    const e164 = normalizePhoneE164(phone) ?? phone;

    const db = getFirestore();
    const inviteRef = db.collection('invites').doc(e164);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return { joined: [], primaryOrgId: null, skippedDueToCap: [] };
    }
    type InviteEntry = {
      role?: AssignableRole;
      /** Legacy single-project field (still read for back-compat). */
      projectId?: string;
      projectIds?: string[];
    };
    const invite = inviteSnap.data() as { orgs?: Record<string, InviteEntry> } | undefined;
    const entries = Object.entries(invite?.orgs ?? {});
    if (entries.length === 0) {
      await inviteRef.delete().catch(() => undefined);
      return { joined: [], primaryOrgId: null, skippedDueToCap: [] };
    }

    const claimerUid = request.auth.uid;
    const userRef = db.collection('users').doc(claimerUid);
    const userSnap = await userRef.get();
    const existing = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
    let primaryOrgId =
      typeof existing.primaryOrgId === 'string' ? (existing.primaryOrgId as string) : null;

    const joined: { orgId: string; role: RoleKey }[] = [];
    const skippedDueToCap: { orgId: string; orgName?: string }[] = [];
    // Entries we DON'T claim here (cap-skipped) get carried back into
    // `invites/{e164}.orgs` so the user can retry later. Joined orgs
    // are dropped from this map so the invite naturally shrinks.
    const remainingOrgs: Record<string, InviteEntry> = {};

    for (const [orgId, entry] of entries) {
      const role = entry?.role;
      if (!role || !ASSIGNABLE_ROLES.includes(role)) {
        // Unknown/unsupported role — drop silently (don't preserve).
        continue;
      }

      // Coalesce legacy single-id field into the array.
      const projectIds: string[] = [
        ...(Array.isArray(entry.projectIds) ? entry.projectIds : []),
      ];
      if (
        typeof entry.projectId === 'string' &&
        entry.projectId &&
        !projectIds.includes(entry.projectId)
      ) {
        projectIds.push(entry.projectId);
      }

      const orgRef = db.collection('organizations').doc(orgId);

      if (role === 'client') {
        // Clients live in clientUids, not memberIds — cap doesn't apply.
        if (projectIds.length === 0) continue;
        const batch = db.batch();
        for (const pid of projectIds) {
          batch.update(db.collection('projects').doc(pid), {
            clientUids: FieldValue.arrayUnion(claimerUid),
          });
        }
        batch.set(orgRef, { roles: { [claimerUid]: 'client' } }, { merge: true });
        batch.delete(orgRef.collection('pendingInvites').doc(e164));
        await batch.commit();
        joined.push({ orgId, role });
        continue;
      }

      // Non-client: per-org transaction with cap recheck.
      // Why: the inviter's `inviteMember` cap check counted pending
      // invites at INVITE time, but a studio that was previously
      // over-invited (before the pending-counting fix landed) can
      // still have `memberIds + pending` exceeding the cap. Without
      // a recheck here, the first such invitee to sign in would
      // sneak past the limit. Per-org tx ensures each join sees a
      // fresh count and either commits cleanly or skips.
      let didJoin = false;
      let orgName: string | undefined;
      let capExceeded = false;
      try {
        await db.runTransaction(async (tx) => {
          const orgSnap = await tx.get(orgRef);
          if (!orgSnap.exists) {
            // Org was deleted between invite and claim — silently drop.
            return;
          }
          const org = orgSnap.data() as Record<string, unknown>;
          orgName = typeof org.name === 'string' ? (org.name as string) : undefined;
          const memberIds = Array.isArray(org.memberIds)
            ? (org.memberIds as string[])
            : [];
          const { limits } = effectiveLimits(org);
          const alreadyMember = memberIds.includes(claimerUid);

          if (!alreadyMember && Number.isFinite(limits.maxMembers)) {
            const pendingSnap = await tx.get(orgRef.collection('pendingInvites'));
            let pendingNonClientCount = 0;
            for (const d of pendingSnap.docs) {
              const data = d.data() as { role?: string };
              if (data.role === 'client') continue;
              // Don't count THIS user's own pending entry — it's about
              // to be replaced by the +1 we're committing.
              if (d.id === e164) continue;
              pendingNonClientCount += 1;
            }
            if (memberIds.length + pendingNonClientCount + 1 > limits.maxMembers) {
              capExceeded = true;
              throw new Error('CAP_EXCEEDED');
            }
          }

          tx.update(orgRef, {
            memberIds: FieldValue.arrayUnion(claimerUid),
            [`roles.${claimerUid}`]: role,
          });
          for (const pid of projectIds) {
            tx.update(db.collection('projects').doc(pid), {
              memberIds: FieldValue.arrayUnion(claimerUid),
            });
          }
          // Drop the org-scoped pending-invite mirror so it disappears
          // from Team & Roles.
          tx.delete(orgRef.collection('pendingInvites').doc(e164));
          didJoin = true;
        });
      } catch (e) {
        if (capExceeded) {
          skippedDueToCap.push(orgName ? { orgId, orgName } : { orgId });
          remainingOrgs[orgId] = entry;
          continue;
        }
        throw e;
      }

      if (didJoin) {
        if (!primaryOrgId) primaryOrgId = orgId;
        joined.push({ orgId, role });
      }
    }

    // Update primaryOrgId on user doc if we picked a new one.
    if (primaryOrgId && primaryOrgId !== existing.primaryOrgId) {
      await userRef.set({ primaryOrgId }, { merge: true });
    }

    // Either delete the master invite doc, or rewrite with only the
    // skipped entries so the user can claim them later.
    if (Object.keys(remainingOrgs).length === 0) {
      await inviteRef.delete().catch(() => undefined);
    } else {
      await inviteRef.set(
        { orgs: remainingOrgs, updatedAt: FieldValue.serverTimestamp() },
        { merge: false },
      );
    }

    // Sync the caller's auth-token claims so the orgs they just
    // joined are visible without a Firestore round-trip. Critical
    // for the auto-land flow: the routing decision in AuthProvider
    // happens immediately after this returns.
    await refreshUserClaims(claimerUid);

    return { joined, primaryOrgId, skippedDueToCap };
  },
);

// ── removeMember ────────────────────────────────────────────────────

type RemoveMemberRequest =
  | { orgId: string; uid: string; phoneNumber?: never }
  | { orgId: string; phoneNumber: string; uid?: never };

/**
 * Demote-only removal that handles both already-joined members (by `uid`)
 * AND pending-invite rows (by `phoneNumber`). Pending invitees never get
 * a "cancel invite" affordance separately — the same Remove Access
 * action drops the row from the Team list whether they joined or not.
 */
export const removeMember = onCall<RemoveMemberRequest, Promise<{ ok: true }>>(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign-in is required.');
    }
    const data = request.data ?? ({} as RemoveMemberRequest);
    const { orgId } = data;
    if (typeof orgId !== 'string' || !orgId) {
      throw new HttpsError('invalid-argument', '`orgId` is required.');
    }

    const callerRole = await readCallerRole(orgId, request.auth.uid);
    if (callerRole !== 'superAdmin' && callerRole !== 'admin') {
      throw new HttpsError(
        'permission-denied',
        'Only Super Admin or Admin can remove members.',
      );
    }

    const db = getFirestore();

    // ── Branch A: real member by uid ──
    if ('uid' in data && typeof data.uid === 'string' && data.uid) {
      const uid = data.uid;
      if (uid === request.auth.uid) {
        throw new HttpsError('invalid-argument', 'You cannot remove yourself.');
      }
      const targetRole = await readCallerRole(orgId, uid);
      if (targetRole === 'superAdmin') {
        throw new HttpsError(
          'permission-denied',
          'Super Admin cannot be removed. Transfer ownership first.',
        );
      }
      if (targetRole === 'admin' && callerRole !== 'superAdmin') {
        throw new HttpsError(
          'permission-denied',
          'Only Super Admin can remove another Admin.',
        );
      }

      // Drop org membership + clear role.
      const orgUpdate = db
        .collection('organizations')
        .doc(orgId)
        .update({
          memberIds: FieldValue.arrayRemove(uid),
          [`roles.${uid}`]: FieldValue.delete(),
        });

      // Also strip the uid from every project in the org so they can't
      // keep silent project-scoped access (memberIds OR clientUids). Done
      // in chunks of ~400 to stay under Firestore's batch limit of 500.
      const projectsSnap = await db
        .collection('projects')
        .where('orgId', '==', orgId)
        .get();
      const projectDocs = projectsSnap.docs.filter((d) => {
        const v = d.data() as { memberIds?: string[]; clientUids?: string[] };
        return v.memberIds?.includes(uid) || v.clientUids?.includes(uid);
      });

      for (let i = 0; i < projectDocs.length; i += 400) {
        const slice = projectDocs.slice(i, i + 400);
        const projectBatch = db.batch();
        for (const doc of slice) {
          projectBatch.update(doc.ref, {
            memberIds: FieldValue.arrayRemove(uid),
            clientUids: FieldValue.arrayRemove(uid),
          });
        }
        await projectBatch.commit();
      }

      await orgUpdate;

      // Sync the removed user's claims so the org disappears from
      // their `claims.orgs` immediately. They may also have had
      // this org as `primaryOrgId` — `computeUserClaims` recomputes
      // both fields, so a removed user's primaryOrgId blanks out if
      // the org they were just removed from was their active one.
      await refreshUserClaims(uid);

      return { ok: true };
    }

    // ── Branch B: pending invite by phone ──
    if ('phoneNumber' in data && typeof data.phoneNumber === 'string') {
      const e164 = normalizePhoneE164(data.phoneNumber);
      if (!e164) {
        throw new HttpsError('invalid-argument', 'Phone number is invalid.');
      }
      const orgInviteRef = db
        .collection('organizations')
        .doc(orgId)
        .collection('pendingInvites')
        .doc(e164);
      const inviteRef = db.collection('invites').doc(e164);
      const inviteSnap = await inviteRef.get();

      const batch = db.batch();
      batch.delete(orgInviteRef);
      if (inviteSnap.exists) {
        const v = inviteSnap.data() as { orgs?: Record<string, unknown> } | undefined;
        const orgs = { ...(v?.orgs ?? {}) };
        delete orgs[orgId];
        if (Object.keys(orgs).length === 0) {
          batch.delete(inviteRef);
        } else {
          batch.set(
            inviteRef,
            { orgs, updatedAt: FieldValue.serverTimestamp() },
            { merge: false },
          );
        }
      }
      await batch.commit();
      return { ok: true };
    }

    throw new HttpsError('invalid-argument', 'Provide either `uid` or `phoneNumber`.');
  },
);
