/**
 * Active-org switch orchestrator.
 *
 * The whole switch sequence:
 *
 *   1. Server: `setPrimaryOrganization` callable writes
 *      `users/{uid}.primaryOrgId` AND calls `refreshUserClaims`
 *      to mint fresh custom claims with the new active org.
 *      ~200 ms round-trip.
 *
 *   2. Client (optional): wait for the local `users/{uid}` snapshot
 *      to reflect the new `primaryOrgId`. This is the cheapest
 *      barrier we have — the snapshot fires within ~150 ms of the
 *      server write and unblocks `usePermissions` to switch over to
 *      the new-org fallback role before the sheet closes. Without
 *      this, the next render briefly trusts the OLD claims (1–2 s
 *      lag on the local token cache) and shows the previous role's
 *      tabs — most visibly, CRM staying visible after switching to
 *      a Supervisor org.
 *
 *   3. Client: fire-and-forget `refresh(true)` to pull the new
 *      token claims into the local cache. Not awaited — `usePermissions`
 *      already has the right role from step 2's userDoc snapshot,
 *      and the claim refresh just promotes the result back to the
 *      fast path. If it drops, `usePermissions` self-heals.
 *
 * Why both barriers: blocking on `refresh` alone adds 1–2 s of
 * perceived latency. Blocking on `waitForUserDoc` alone is ~150 ms
 * and gives us the correct role immediately via the org-doc fallback
 * path in `usePermissions`. So we await the cheap one and let the
 * expensive one run in the background.
 */
import { setPrimaryOrganization } from './organizations';
import type { TokenClaims } from './useTokenClaims';

export type SetActiveOrgArgs = {
  /** Optional handle to `useTokenClaims().refresh`. When provided
   *  we kick off a token refresh in the background; not awaiting
   *  keeps the switch fast. */
  refresh?: (force?: boolean) => Promise<TokenClaims>;
  /** Optional barrier that resolves once the local `users/{uid}`
   *  snapshot reports `primaryOrgId === orgId`. Caller wires it to
   *  a one-shot Firestore listener (see `OrgSwitcherSheet`). When
   *  provided we await it so the next render uses the new-org
   *  fallback role from the start — eliminating the wrong-role
   *  flash. Capped to a short timeout so a stuck snapshot doesn't
   *  hang the switch. */
  waitForUserDoc?: () => Promise<void>;
};

const USER_DOC_BARRIER_TIMEOUT_MS = 1500;

export async function setActiveOrg(
  orgId: string,
  args: SetActiveOrgArgs = {},
): Promise<void> {
  if (!orgId) throw new Error('setActiveOrg: orgId is required');

  // Server: write user.primaryOrgId + refreshUserClaims.
  await setPrimaryOrganization(orgId);

  // Client barrier (cheap, ~150 ms): wait for the userDoc snapshot
  // to reflect the new primaryOrgId before returning. Bounded by a
  // short timeout — if the snapshot is stuck, fall through and let
  // usePermissions' self-heal catch up.
  if (args.waitForUserDoc) {
    try {
      await Promise.race([
        args.waitForUserDoc(),
        new Promise<void>((resolve) =>
          setTimeout(resolve, USER_DOC_BARRIER_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      console.warn('[setActiveOrg] userDoc barrier failed:', err);
    }
  }

  // Client: pull new claims in the background. Don't await — by the
  // time this lands, usePermissions is already showing the correct
  // role (via the userDoc + org-doc fallback path). The claim
  // refresh just promotes the result back to the fast path.
  if (args.refresh) {
    void args.refresh(true).catch((err) => {
      console.warn('[setActiveOrg] background claims refresh failed:', err);
    });
  }
}
