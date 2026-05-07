/**
 * AuthProvider subscribes to Firebase auth state and exposes the current
 * user (or null) plus a loading flag via React context.
 *
 * Two distinct sign-in paths, optimised for cold-start latency:
 *
 *   A. ESTABLISHED USER (returning) — `users/{uid}` already exists with a
 *      `primaryOrgId` set. This is the 99% case after the first sign-in.
 *      We flip `loading=false` immediately after the userDoc read so the
 *      route guard can redirect to the dashboard without waiting on the
 *      slower invite-reconciliation chain. `claimInvites` and the token
 *      refresh still run, but in the BACKGROUND — any new orgs they add
 *      surface live via `useMyOrganizations`'s snapshot listener; the
 *      user doesn't sit through a 2–4 s blank-spinner window every cold
 *      start.
 *
 *   B. NEW or INVITED USER — userDoc is missing or has no `primaryOrgId`.
 *      We CANNOT optimistically redirect (the route guard would flash
 *      the onboarding form before claimInvites populates primaryOrgId).
 *      So this path stays sequential / blocking:
 *        1. Ensure `users/{uid}` exists (create if missing).
 *        2. Await `claimInvites` — Cloud Function consumes any pending
 *           invites keyed by phone, sets primaryOrgId if currently null,
 *           refreshes server-side custom claims.
 *        3. Force-refresh the local ID token so claims propagate.
 *        4. Re-fetch userDoc once so `primaryOrgId` is on the wire
 *           before the routing decision runs.
 *        5. THEN flip `loading=false`.
 *
 * Push-token registration runs best-effort in both paths.
 *
 * Beyond sign-in, this provider also opportunistically heals stale
 * token claims by calling `forceRefreshClaims` on every app foreground
 * (`AppState` → `'active'`), throttled to once per 60 s. Without this,
 * a user whose role was changed in Firestore (via `setMemberRole`)
 * wouldn't see the new role until the next natural token rotation.
 */
import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { auth, db, firestore, type AuthUser } from '@/src/lib/firebase';
import { claimInvites, forceRefreshClaims } from '@/src/features/org/invites';

export type { AuthUser };

export type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
};

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

/**
 * Ensures `users/{uid}` exists. Returns the snapshot data so the caller
 * can branch on `primaryOrgId` without a second round trip — the same
 * `get()` that creates the doc also tells us whether this user is
 * "established" (already onboarded into an org) and can take the fast
 * path.
 */
async function ensureUserDoc(user: AuthUser): Promise<{
  exists: boolean;
  primaryOrgId: string | null;
}> {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() as { primaryOrgId?: string | null } | undefined;
    const primaryOrgId =
      typeof data?.primaryOrgId === 'string' && data.primaryOrgId
        ? data.primaryOrgId
        : null;
    return { exists: true, primaryOrgId };
  }
  await ref.set({
    phoneNumber: user.phoneNumber ?? '',
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? null,
    primaryOrgId: null,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return { exists: false, primaryOrgId: null };
}

/** Force the local Firebase Auth SDK to pull a fresh ID token from
 *  the server, so any custom claims set by the just-finished
 *  `claimInvites` are picked up before the routing decision runs. */
async function refreshLocalToken(): Promise<void> {
  await auth.getIdTokenResult(true);
}

// Throttle window for the foreground-refresh self-heal. Once per
// minute is plenty — a real role change on the server is rare and
// the user can also force a sign-out/in if they need it sooner.
const CLAIMS_REFRESH_THROTTLE_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  /** Timestamp of the last forceRefreshClaims call. Throttle key. */
  const lastClaimsRefreshAt = useRef(0);

  /** Self-heal: server recomputes claims, then we pull a fresh
   *  token locally so usePermissions sees the new role. Throttled.
   *  Best-effort — failures (offline, etc.) are silent. */
  const refreshClaimsThrottled = (force = false) => {
    if (!auth.currentUser) return;
    const now = Date.now();
    if (!force && now - lastClaimsRefreshAt.current < CLAIMS_REFRESH_THROTTLE_MS) {
      return;
    }
    lastClaimsRefreshAt.current = now;
    void (async () => {
      try {
        await forceRefreshClaims();
        await auth.getIdTokenResult(true);
      } catch (err) {
        console.warn('[auth] forceRefreshClaims failed:', err);
      }
    })();
  };

  // App-foreground listener — re-anchors local claims to live
  // Firestore role data whenever the user comes back to the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') refreshClaimsThrottled();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (next) => {
      if (!next) {
        setUser(next);
        setLoading(false);
        return;
      }

      // Single userDoc read serves three purposes:
      //   (1) ensure the doc exists (create blank if not)
      //   (2) tell us whether the user is established (has a
      //       primaryOrgId) — drives fast vs slow path
      //   (3) gives us the timestamp of the snapshot we'll commit to
      let userDocState: { exists: boolean; primaryOrgId: string | null } = {
        exists: false,
        primaryOrgId: null,
      };
      try {
        userDocState = await ensureUserDoc(next);
      } catch (err) {
        // Non-fatal: we still let the user in. Firestore writes can fail
        // due to offline mode or rules; surface via console.
        console.warn('[auth] failed to ensure user doc:', err);
      }

      // ── FAST PATH — established returning user ─────────────────
      // Has a primaryOrgId already → they're onboarded into at least
      // one org. The route guard will redirect them straight to the
      // dashboard. claimInvites + token refresh still need to run
      // (in case new invites were added since their last sign-in)
      // but they don't BLOCK the redirect — any new orgs they pick
      // up appear in their org switcher live via the
      // useMyOrganizations snapshot listener.
      if (userDocState.primaryOrgId) {
        // Flip loading=false IMMEDIATELY so the dashboard renders.
        setUser(next);
        setLoading(false);

        // Background reconcile + push registration. None of these are
        // awaited; if they fail the snapshot listeners and the
        // 60s-throttled foreground refresh will eventually catch up.
        void (async () => {
          try {
            await claimInvites();
          } catch (err) {
            console.warn('[auth] claimInvites (background) failed:', err);
          }
          try {
            await refreshLocalToken();
          } catch (err) {
            console.warn('[auth] token refresh (background) failed:', err);
          }
          try {
            const { registerExpoPushToken } = await import(
              '@/src/features/push/registerExpoPushToken'
            );
            await registerExpoPushToken(next.uid);
          } catch (err) {
            console.warn('[auth] registerExpoPushToken (background) failed:', err);
          }
        })();
        return;
      }

      // ── SLOW PATH — new or invited user ────────────────────────
      // No primaryOrgId yet. We MUST await claimInvites + token
      // refresh + userDoc refetch before flipping loading, otherwise
      // the route guard would briefly redirect to the onboarding
      // form even though invites are about to populate primaryOrgId.
      try {
        await claimInvites();
      } catch (err) {
        console.warn('[auth] claimInvites failed:', err);
      }
      try {
        await refreshLocalToken();
      } catch (err) {
        console.warn('[auth] token refresh failed:', err);
      }
      // Re-fetch so `primaryOrgId` is on the wire BEFORE the routing
      // decision runs. The onSnapshot listener in `useCurrentUserDoc`
      // races with the route guard otherwise.
      try {
        await db.collection('users').doc(next.uid).get();
      } catch (err) {
        console.warn('[auth] user-doc refetch failed:', err);
      }
      try {
        const { registerExpoPushToken } = await import(
          '@/src/features/push/registerExpoPushToken'
        );
        await registerExpoPushToken(next.uid);
      } catch (err) {
        console.warn('[auth] registerExpoPushToken failed:', err);
      }
      setUser(next);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
