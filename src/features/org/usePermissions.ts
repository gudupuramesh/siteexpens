/**
 * `usePermissions` — current viewer's role + capability check.
 *
 * Resolution order (fast → slow):
 *   1. Custom token claims (`claims.orgs[primaryOrgId]`). Synchronous
 *      after first hydration, no Firestore round-trip.
 *   2. Org-snapshot fallback. Used when claims don't have the role
 *      yet — first sign-in before any `refreshUserClaims` ran, or
 *      mid-org-switch before the new claims propagate. Mirrors the
 *      server-side `effectiveOrgRole()` so the answer is the same,
 *      just slower.
 *
 * Self-heal: when claims look stale (claims have a primaryOrgId but
 * no role for it, even though the org-doc says the user IS a member)
 * we fire a one-shot `forceRefreshClaims()` in the background so the
 * next render picks up the fresh claims. Throttled to one call per
 * 30 s so a stuck snapshot doesn't spam the function.
 *
 * Returns:
 *  - `role`        : RoleKey for the signed-in user inside their primary org,
 *                    or null when not signed in / not yet a member.
 *  - `can(cap)`    : true when the role has the capability.
 *  - `loading`     : true while signed-in org context is not yet safe
 *                    for permission-gated Firestore listeners — user doc
 *                    loading, or we still need the org snapshot because
 *                    token claims have not yielded a role (including
 *                    stale-claims / org-switch paths). Prevents firing
 *                    broad queries with `role === null`.
 *  - `isOwner`     : convenience flag (role === 'superAdmin').
 *  - `isAdminish`  : superAdmin OR admin.
 */
import { useEffect, useMemo, useRef } from 'react';

import { useAuth } from '@/src/features/auth/useAuth';

import { can as canRoleDo, type Capability } from './permissions';
import { forceRefreshClaims } from './invites';
import type { RoleKey } from './types';
import { useCurrentOrganization } from './useCurrentOrganization';
import { useCurrentUserDoc } from './useCurrentUserDoc';
import { useTokenClaims } from './useTokenClaims';

export type UsePermissionsResult = {
  role: RoleKey | null;
  loading: boolean;
  isOwner: boolean;
  isAdminish: boolean;
  can: (cap: Capability) => boolean;
};

/** Throttle window for the self-heal forceRefreshClaims call. One
 *  per 30 s is plenty — a real desync is rare, and the first call
 *  almost always fixes it. */
const SELF_HEAL_THROTTLE_MS = 30_000;

export function usePermissions(): UsePermissionsResult {
  const { user } = useAuth();
  const { claims, refresh } = useTokenClaims();
  const { data: userDoc, loading: userDocLoading } = useCurrentUserDoc();
  const { data: org, loading: orgLoading } = useCurrentOrganization();
  /** Throttle key for the self-heal forceRefreshClaims call. */
  const lastSelfHealAt = useRef(0);

  // ── Stale-claims detection ────────────────────────────────────
  //
  // `userDoc.primaryOrgId` is the source of truth — `setPrimaryOrganization`
  // writes it server-side and the `useCurrentUserDoc` snapshot
  // delivers the new value in ~150 ms. The Firebase ID token claims
  // (`claims.primaryOrgId`, `claims.orgs`) lag by 1–2 s after an org
  // switch because the local SDK token cache only refreshes on a
  // forced `getIdToken(true)` round-trip.
  //
  // During that window the OLD claims still report the previous
  // org's role (e.g. superAdmin in org A) even though the active
  // org is now B. The previous logic preferred claims unconditionally
  // and rendered the wrong tabs / capabilities until the background
  // refresh landed. Detecting the mismatch here lets us bypass the
  // stale fast path and use the org-doc fallback (which is already
  // subscribed to the NEW org via `useCurrentOrganization`).
  const effectivePrimaryOrgId = userDoc?.primaryOrgId ?? null;
  const claimsAreStale =
    effectivePrimaryOrgId !== null
    && claims.primaryOrgId !== ''
    && claims.primaryOrgId !== effectivePrimaryOrgId;

  // Path 1 — token claims (fast path). Bypassed when stale; the
  // fallback path produces the right answer for the new org.
  const claimRole: RoleKey | null =
    !claimsAreStale && claims.primaryOrgId
      ? (claims.orgs[claims.primaryOrgId] ?? null)
      : null;

  // Path 2 — Firestore-snapshot fallback. Mirrors the server-side
  // `effectiveOrgRole()` backfill (see `firestore.rules` and
  // `functions/src/userClaims.roleForOrg`).
  let fallbackRole: RoleKey | null = null;
  if (!claimRole && user && org) {
    const explicit = org.roles?.[user.uid] ?? null;
    if (explicit) {
      fallbackRole = explicit;
    } else if (org.ownerId === user.uid) {
      fallbackRole = 'superAdmin';
    } else if (org.memberIds?.includes(user.uid)) {
      fallbackRole = 'admin';
    }
  }

  const role: RoleKey | null = claimRole ?? fallbackRole;

  // Self-heal: fire `forceRefreshClaims` when claims look stale.
  // Two trigger conditions:
  //   1. Claims primaryOrgId disagrees with userDoc.primaryOrgId
  //      (mid-org-switch race — claims haven't caught up yet).
  //   2. Claims have a primaryOrgId but no orgs[that] entry
  //      (first sign-in before any refreshUserClaims ran, or a
  //      role mutation that didn't trigger a claim refresh).
  // Throttled — a stuck claims snapshot shouldn't spam the function.
  useEffect(() => {
    if (!user) return;
    const claimsHaveActiveRole =
      claims.primaryOrgId && claims.orgs[claims.primaryOrgId];
    // If claims are correct AND not stale, nothing to heal.
    if (claimsHaveActiveRole && !claimsAreStale) return;
    // No org context yet — nothing to compare against / heal toward.
    if (!fallbackRole && !claimsAreStale) return;
    const now = Date.now();
    if (now - lastSelfHealAt.current < SELF_HEAL_THROTTLE_MS) return;
    lastSelfHealAt.current = now;
    void (async () => {
      try {
        await forceRefreshClaims();
        await refresh(true);
      } catch (err) {
        console.warn('[usePermissions] self-heal forceRefreshClaims failed:', err);
      }
    })();
  }, [user, claims.primaryOrgId, claims.orgs, fallbackRole, claimsAreStale, refresh]);

  return useMemo(() => {
    // Wait for user doc first (`primaryOrgId` drives org subscription).
    //
    // If the user has a primary org but token claims did not yield a
    // role yet (`claimRole == null`), keep loading until the org doc
    // snapshot resolves — that's when `fallbackRole` becomes accurate
    // (mirrors server `effectiveOrgRole`). Do NOT use `claimsLoading &&
    // orgLoading`: whichever flag flipped false first used to clear
    // loading early with `role === null`, which triggered invalid
    // Firestore queries and permission-denied + retry spam.
    const needsOrgSnapshot =
      !!user &&
      !!effectivePrimaryOrgId &&
      claimRole == null;

    const loading =
      !!user &&
      (userDocLoading || (needsOrgSnapshot && orgLoading));

    return {
      role,
      loading,
      isOwner: role === 'superAdmin',
      isAdminish: role === 'superAdmin' || role === 'admin',
      can: (cap: Capability) => canRoleDo(role, cap),
    };
  }, [
    user,
    userDocLoading,
    effectivePrimaryOrgId,
    claimRole,
    orgLoading,
    role,
  ]);
}
