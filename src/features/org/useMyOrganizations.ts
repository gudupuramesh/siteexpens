/**
 * Organizations the signed-in user belongs to in ANY capacity.
 *
 * Source of truth: `claims.orgs` — the per-org role map written into
 * the user's auth token by `refreshUserClaims` server-side.
 * `computeUserClaims` ([functions/src/userClaims.ts:63-101]) builds it
 * as the UNION of:
 *   - orgs where the user is in `memberIds` (regular paid roles), AND
 *   - orgs where `roles[uid]` is set (clients — who deliberately do
 *     NOT live in `memberIds` because they're exempt from the
 *     `maxMembers` plan cap).
 *
 * The legacy implementation queried `organizations where memberIds
 * array-contains uid`, which excluded clients entirely — a client
 * would sign in and see ONLY their own studio in the org switcher,
 * never the studios where they'd been invited as a client. Reading
 * from `claims.orgs` covers both cases with a single source.
 *
 * Stability: the per-org listeners are keyed by a stable string of
 * sorted org-ids. They re-create ONLY when the actual set of org-ids
 * changes — NOT when the claims object reference flips (which
 * `useTokenClaims` does on every initial-then-refresh cycle, ~400 ms
 * after sign-in). Inside the snapshot callback we read the latest
 * `claims.orgs` from a ref so the role label stays current without
 * re-subscribing. Without this, rapid claims-object identity changes
 * would tear down + re-create listeners mid-flight, which on iOS
 * surfaces as a `FIRESTORE INTERNAL ASSERTION FAILED (ve:-1)` from
 * the Firebase Web SDK's snapshot delivery state machine.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/features/auth/useAuth';
import { db } from '@/src/lib/firebase';

import type { PlanTier, Subscription } from '@/src/features/billing/types';

import { ROLE_LABELS } from './permissions';
import type { RoleKey } from './types';
import { useTokenClaims } from './useTokenClaims';

export type MyOrgRow = {
  id: string;
  name: string;
  ownerId: string;
  /** You created this org (`ownerId === your uid`). */
  isYourStudio: boolean;
  /** Human-readable role in this org (mirrors server invite backfill). */
  roleLabel: string;
  /** Uploaded studio logo, if any. Falls back to a neutral icon
   *  in the avatar component when null. */
  logoUrl: string | null;
  /** EFFECTIVE tier — already considers subscription status, so
   *  cancelled/expired orgs render as `free` here. Mirrors the
   *  same logic as `useSubscription.effectiveTier` so the badge
   *  on the org card matches the badge on the active org's hero. */
  tier: PlanTier;
  /** Owner's display name from `memberPublic/{ownerId}`. Empty
   *  string when not yet loaded OR when the current user lacks
   *  read access to the owner's memberPublic doc (e.g. clients
   *  who aren't in `memberIds`). */
  ownerName: string;
};

/** Statuses that DO entitle the user to their paid tier's limits.
 *  Mirrors `useSubscription.ACTIVE_STATUSES`. */
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

function effectiveTierOf(sub: Subscription | undefined): PlanTier {
  if (!sub) return 'free';
  return ACTIVE_STATUSES.has(sub.status) ? sub.tier : 'free';
}

export type UseMyOrganizationsResult = {
  orgs: MyOrgRow[];
  loading: boolean;
  error: Error | null;
};

export function useMyOrganizations(): UseMyOrganizationsResult {
  const { user } = useAuth();
  const { claims, loading: claimsLoading } = useTokenClaims();
  const [orgs, setOrgs] = useState<MyOrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Stable join key — only changes when the SET of org-ids changes.
  // Used as the sole structural dep so the effect doesn't re-fire on
  // claims-object identity flips (which happen ~400 ms after sign-in
  // when useTokenClaims forces a token refresh).
  const orgIds = useMemo(() => {
    return Object.keys(claims.orgs ?? {}).sort();
  }, [claims.orgs]);
  const orgIdsKey = orgIds.join(',');

  // Always-current claims map for the snapshot callbacks to read from.
  // Avoids putting `claims.orgs` in deps (which would tear down all
  // listeners on every claims update).
  const claimsOrgsRef = useRef(claims.orgs);
  useEffect(() => {
    claimsOrgsRef.current = claims.orgs;
    // Also re-emit current rows with the latest role labels — handles
    // the case where role changed (e.g. promoted client → manager) but
    // the org-ids set didn't change, so the per-org listener wouldn't
    // re-fire on its own.
    setOrgs((prev) =>
      prev.map((row) => {
        const role = claims.orgs[row.id] as RoleKey | undefined;
        const nextLabel = role ? ROLE_LABELS[role] : 'Member';
        if (nextLabel === row.roleLabel) return row;
        return { ...row, roleLabel: nextLabel };
      }),
    );
  }, [claims.orgs]);

  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setLoading(false);
      setError(null);
      return;
    }
    // Wait for claims to settle before declaring "no orgs". Otherwise
    // we'd flash an empty list during the first ~400 ms after sign-in
    // while useTokenClaims hydrates from the cached token.
    if (claimsLoading) {
      setLoading(true);
      return;
    }
    if (orgIds.length === 0) {
      setOrgs([]);
      setLoading(false);
      setError(null);
      return;
    }

    const uid = user.uid;
    setLoading(true);
    setError(null);

    // Per-org docs land at different times. Hold them in a Map keyed
    // by orgId so each snapshot delivery overwrites cleanly. Sorting
    // happens on every emit (the list is short).
    const byId = new Map<string, MyOrgRow>();
    let firstResolved = 0;
    const total = orgIds.length;

    const emit = () => {
      const next = Array.from(byId.values()).sort((a, b) => {
        if (a.isYourStudio !== b.isYourStudio) return a.isYourStudio ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      setOrgs(next);
    };

    // Per-org owner-name listener tracking. Keyed by orgId so we
    // can stop the OLD owner listener if `ownerId` changes (rare:
    // ownership transfer) and avoid stacking duplicates.
    const ownerUnsubByOrg = new Map<string, () => void>();

    const subscribeOwner = (orgId: string, ownerId: string) => {
      const prev = ownerUnsubByOrg.get(orgId);
      if (prev) prev();
      if (!ownerId) {
        ownerUnsubByOrg.delete(orgId);
        return;
      }
      const unsub = db
        .collection('organizations')
        .doc(orgId)
        .collection('memberPublic')
        .doc(ownerId)
        .onSnapshot(
          (snap) => {
            const data = snap.data() as { displayName?: string } | undefined;
            const displayName =
              typeof data?.displayName === 'string'
                ? data.displayName.trim()
                : '';
            const existing = byId.get(orgId);
            if (!existing) return;
            // Only emit if the name actually changed (memberPublic
            // updates on photoURL changes too — those don't matter
            // for this hook).
            if (existing.ownerName === displayName) return;
            byId.set(orgId, { ...existing, ownerName: displayName });
            emit();
          },
          (err: unknown) => {
            // Clients aren't in `memberIds`, so the rules deny their
            // memberPublic reads. That's expected — leave ownerName
            // empty and the UI will fall back gracefully. Log at
            // debug level only so we don't pollute prod logs with
            // expected denials.
            if (__DEV__) {
              const code =
                (err as { code?: string } | null)?.code ?? String(err);
              console.warn(
                `[useMyOrganizations] owner memberPublic snapshot denied for ${orgId}:`,
                code,
              );
            }
          },
        );
      ownerUnsubByOrg.set(orgId, unsub);
    };

    const unsubs = orgIds.map((orgId) =>
      db
        .collection('organizations')
        .doc(orgId)
        .onSnapshot(
          (snap) => {
            if (!snap.exists) {
              // Org was deleted (or rules just denied us). Drop it.
              byId.delete(orgId);
              const prev = ownerUnsubByOrg.get(orgId);
              if (prev) {
                prev();
                ownerUnsubByOrg.delete(orgId);
              }
            } else {
              const data = snap.data() as Record<string, unknown> | undefined;
              const name =
                typeof data?.name === 'string' ? (data.name as string).trim() : '';
              const ownerId =
                typeof data?.ownerId === 'string' ? (data.ownerId as string) : '';
              const logoUrl =
                typeof data?.logoUrl === 'string' && data.logoUrl
                  ? (data.logoUrl as string)
                  : null;
              const subscription = data?.subscription as
                | Subscription
                | undefined;
              // Read role from the ref so the latest claims.orgs is
              // always used, even after the role changes mid-listen
              // (without re-subscribing).
              const role = claimsOrgsRef.current[orgId] as RoleKey | undefined;
              const prev = byId.get(orgId);
              byId.set(orgId, {
                id: orgId,
                name: name || 'Studio',
                ownerId,
                isYourStudio: !!ownerId && ownerId === uid,
                roleLabel: role ? ROLE_LABELS[role] : 'Member',
                logoUrl,
                tier: effectiveTierOf(subscription),
                // Preserve the resolved owner name across snapshot
                // re-emits — the org doc snapshot fires for any
                // field change, but ownerName comes from a separate
                // memberPublic listener. Without this, every
                // counter / settings tweak on the org doc would
                // momentarily blank the owner line.
                ownerName: prev?.ownerName ?? '',
              });
              // (Re)subscribe to owner's memberPublic if ownerId
              // changed — most orgs hit this exactly once per session.
              const ownerChanged = !prev || prev.ownerId !== ownerId;
              if (ownerChanged) subscribeOwner(orgId, ownerId);
            }
            emit();
            firstResolved += 1;
            if (firstResolved >= total) setLoading(false);
          },
          (err) => {
            // One bad org doc shouldn't blank the whole list. Log and
            // keep going; the list will surface whatever else resolved.
            // Common cause: rules denial when reading an org the user
            // is a client of and the new client-read rule hasn't been
            // deployed yet. The fix is `firebase deploy --only firestore:rules`.
            console.warn(`[useMyOrganizations] snapshot error for ${orgId}:`, err);
            firstResolved += 1;
            if (firstResolved >= total) setLoading(false);
            setError(err instanceof Error ? err : new Error(String(err)));
          },
        ),
    );

    return () => {
      unsubs.forEach((u) => u());
      ownerUnsubByOrg.forEach((u) => u());
      ownerUnsubByOrg.clear();
    };
    // Only re-fire when the SET of org-ids changes — claims object
    // identity changes don't tear down listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, claimsLoading, orgIdsKey]);

  return { orgs, loading, error };
}
