/**
 * Reactive subscription to the current user's Firebase Auth ID-token
 * custom claims. Custom claims are server-set via the
 * `refreshUserClaims` admin helper inside `functions/src/userClaims.ts`
 * and carry the user's role-per-org plus active org id:
 *
 *   claims.orgs         : Record<orgId, RoleKey>
 *   claims.primaryOrgId : string
 *
 * The token is cached locally by the Firebase Auth SDK (synchronous
 * read after first hydration), so reading the role becomes a memory
 * lookup rather than a Firestore round-trip. This is the foundation
 * that makes org switching feel instant and lets `usePermissions`
 * resolve the active role without waiting on the org-doc snapshot.
 *
 * Refresh strategy:
 *   - `getIdTokenResult(false)` on every auth-state change (cheap;
 *     uses cached token).
 *   - One forced refresh shortly after sign-in to pick up any claims
 *     that landed during the first-login race (e.g. claimInvites just
 *     ran on the server but our local token predates it).
 *   - `refresh(force=true)` exposed for org-switch code to call
 *     after `setPrimaryOrganization` returns, so the new
 *     `primaryOrgId` is visible synchronously before the UI re-renders.
 *
 * Token-result claim values are weakly typed by Firebase; we cast on
 * the way out so consumers get `Record<string, RoleKey>` instead of
 * `Record<string, unknown>`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { auth } from '@/src/lib/firebase';
import { useAuth } from '@/src/features/auth/useAuth';

import type { RoleKey } from './types';

export type TokenClaims = {
  /** Map of orgId → user's role in that org. Empty when the user is
   *  signed in but not a member of any org (still in onboarding). */
  orgs: Record<string, RoleKey>;
  /** Active org id. Empty string when not set (pre-onboarding or
   *  immediately after the user was removed from their last org). */
  primaryOrgId: string;
};

const EMPTY: TokenClaims = { orgs: {}, primaryOrgId: '' };

export type UseTokenClaimsResult = {
  claims: TokenClaims;
  /** True until the first token read settles. */
  loading: boolean;
  /** Force a fresh token from Firebase (network round-trip). Use after
   *  any callable that mutated org membership / roles, so the local
   *  token reflects the server-side change before the UI re-renders. */
  refresh: (force?: boolean) => Promise<TokenClaims>;
};

export function useTokenClaims(): UseTokenClaimsResult {
  const { user } = useAuth();
  const [claims, setClaims] = useState<TokenClaims>(EMPTY);
  const [loading, setLoading] = useState(true);

  const readClaims = useCallback(
    async (force: boolean): Promise<TokenClaims> => {
      const t = await auth.getIdTokenResult(force);
      if (!t) return EMPTY;
      const orgs =
        (t.claims.orgs as Record<string, RoleKey> | undefined) ?? {};
      const primaryOrgId =
        typeof t.claims.primaryOrgId === 'string' ? t.claims.primaryOrgId : '';
      return { orgs, primaryOrgId };
    },
    [],
  );

  // Initial read + one short-fuse forced refresh to catch claims that
  // got written by claimInvites between the auth-state change and our
  // first read. Without this, an invited user lands on the dashboard
  // with empty claims for ~3-5s until the next natural token rotation.
  useEffect(() => {
    if (!user) {
      setClaims(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const first = await readClaims(false);
        if (cancelled) return;
        setClaims(first);
        setLoading(false);

        // Forced refresh ~400ms later picks up any claim writes that
        // landed during the same auth-state callback (e.g. inside
        // AuthProvider's awaited claimInvites). The cost is one
        // network round-trip per sign-in.
        setTimeout(async () => {
          if (cancelled) return;
          try {
            const fresh = await readClaims(true);
            if (cancelled) return;
            // Only update state when something actually changed —
            // avoids a no-op re-render of every consumer.
            setClaims((prev) =>
              prev.primaryOrgId === fresh.primaryOrgId &&
              shallowEqualRoleMap(prev.orgs, fresh.orgs)
                ? prev
                : fresh,
            );
          } catch (err) {
            console.warn('[useTokenClaims] refresh failed:', err);
          }
        }, 400);
      } catch (err) {
        console.warn('[useTokenClaims] initial read failed:', err);
        if (cancelled) return;
        setClaims(EMPTY);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, readClaims]);

  const refresh = useCallback(
    async (force = true): Promise<TokenClaims> => {
      const fresh = await readClaims(force);
      setClaims(fresh);
      return fresh;
    },
    [readClaims],
  );

  return useMemo(() => ({ claims, loading, refresh }), [claims, loading, refresh]);
}

function shallowEqualRoleMap(
  a: Record<string, RoleKey>,
  b: Record<string, RoleKey>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
