/**
 * `useGuardedRoute` — belt-and-braces route-level capability check
 * for screens that should never be reached by a role lacking the
 * relevant permission.
 *
 * UI gating already hides the navigation entry points (tabs, FABs,
 * etc.) for restricted roles — this hook is the second layer of
 * defence in case a user lands on a route via a deep link, a stale
 * navigation stack after a role change, or future regressions where
 * a guard accidentally unhides a button.
 *
 * Behaviour: while permissions are still loading, the screen renders
 * normally (we don't want to flash a redirect during the brief
 * sub-second hydration window). Once `loading` settles and the
 * required capability is missing, we replace the navigation stack
 * with the fallback href — defaults to the projects list, which is
 * the home base for every signed-in role.
 *
 * Usage at the top of a screen component:
 *
 *   export default function EditTransactionScreen() {
 *     useGuardedRoute({ capability: 'transaction.write' });
 *     // …rest of component
 *   }
 *
 * For multi-capability gates (e.g. either `task.write` OR
 * `task.update.own`), pass an array — the hook treats it as OR.
 */
import { useEffect } from 'react';
import { router } from 'expo-router';

import { usePermissions } from './usePermissions';
import type { Capability } from './permissions';

export type UseGuardedRouteArgs = {
  /** Required capability (single) — caller must have this. */
  capability?: Capability;
  /** Required capabilities (any-of) — caller must have at least one. */
  anyOf?: Capability[];
  /** Where to send the user when the gate fails. Defaults to the
   *  projects list which is the safe home base for every role. */
  fallbackHref?: string;
};

export function useGuardedRoute(args: UseGuardedRouteArgs): void {
  const { can, loading } = usePermissions();
  const fallback = args.fallbackHref ?? '/(app)/(tabs)';

  useEffect(() => {
    if (loading) return;
    const allowed = args.capability
      ? can(args.capability)
      : args.anyOf
        ? args.anyOf.some((c) => can(c))
        : true;
    if (!allowed) {
      // `replace` (not `push`) so the back button doesn't drop the
      // user back into the restricted screen.
      router.replace(fallback as never);
    }
  }, [args.capability, args.anyOf, can, loading, fallback]);
}
