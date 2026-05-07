/**
 * Declarative permission gates for UI surfaces.
 *
 * Three components — pick the one that matches your guard logic:
 *
 *   <Can capability="task.write">{children}</Can>
 *     → renders children only when the active role has the capability.
 *
 *   <CanAny capabilities={['task.write','task.update.own']}>{children}</CanAny>
 *     → renders when the role has AT LEAST ONE of the capabilities (OR).
 *
 *   <CanAll capabilities={['transaction.write','transaction.approve']}>
 *     {children}
 *   </CanAll>
 *     → renders when the role has EVERY capability (AND).
 *
 * All three render `null` (not even a Fragment) when the gate fails,
 * so they're safe to drop into layout that should collapse to zero
 * size — e.g. wrapping a FAB or a header action button.
 *
 * The imperative `usePermissions().can(cap)` is still the right tool
 * for screens that need to branch logic (not just render). Use
 * whichever fits the call site; the two coexist intentionally.
 */
import type { ReactNode } from 'react';

import { usePermissions } from '@/src/features/org/usePermissions';
import type { Capability } from '@/src/features/org/permissions';

export type CanProps = {
  capability: Capability;
  children: ReactNode;
  /** Optional fallback rendered when the gate fails. Defaults to
   *  `null` (the surface collapses to zero size). */
  fallback?: ReactNode;
};

export function Can({ capability, children, fallback = null }: CanProps): ReactNode {
  const { can } = usePermissions();
  return can(capability) ? <>{children}</> : <>{fallback}</>;
}

export type CanAnyProps = {
  capabilities: Capability[];
  children: ReactNode;
  fallback?: ReactNode;
};

export function CanAny({ capabilities, children, fallback = null }: CanAnyProps): ReactNode {
  const { can } = usePermissions();
  return capabilities.some((c) => can(c)) ? <>{children}</> : <>{fallback}</>;
}

export type CanAllProps = {
  capabilities: Capability[];
  children: ReactNode;
  fallback?: ReactNode;
};

export function CanAll({ capabilities, children, fallback = null }: CanAllProps): ReactNode {
  const { can } = usePermissions();
  return capabilities.every((c) => can(c)) ? <>{children}</> : <>{fallback}</>;
}
