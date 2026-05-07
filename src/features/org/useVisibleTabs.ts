/**
 * Per-role tab visibility hooks. Single source of truth for which
 * navigation surfaces a given role can see, so the bottom tab bar
 * and the project-detail tab strip stay in lock-step with the
 * matrix in `docs/roles-and-permissions.md`.
 *
 * Two hooks:
 *   - `useVisibleBottomTabs()` — drives the 5-tab bottom bar.
 *   - `useVisibleProjectTabs()` — drives the 9-tab project-detail
 *     swipeable strip.
 *
 * Both return a `Set<TabKey>`; the `_layout.tsx` / project index
 * screen filters its tab definition through `set.has(key)` to
 * decide what to render.
 *
 * Why a Set rather than an array: O(1) membership checks during
 * render, and avoids a stale-array reference that re-renders the
 * entire tab strip when a role changes.
 *
 * The lists below are derived from `ROLE_MODULE_ACCESS` in
 * `permissions.ts` — see the "Per-role visible tabs" table in the
 * implementation plan and `docs/roles-and-permissions.md` § Access
 * matrix. When the matrix changes, update both this file AND the
 * doc + permissions.ts to keep them in sync.
 */
import { useMemo } from 'react';

import { usePermissions } from './usePermissions';
import type { RoleKey } from './types';

// ── Bottom-tab visibility ─────────────────────────────────────────

export type BottomTabKey = 'index' | 'overview' | 'crm' | 'toolkit' | 'chats';

/** Bottom-tab routes a given role can see.
 *
 *  Universal across all 8 roles: `index` (Projects), `overview`,
 *  `toolkit`, `chats` (More). Every signed-in user gets these so
 *  the studio switcher chip / project list / utilities are
 *  always reachable. Overview content will diverge by role in a
 *  future phase — for now everyone sees the same Overview,
 *  gracefully degrading where data is restricted.
 *
 *  CRM is per-matrix (`docs/roles-and-permissions.md`): only
 *  Super Admin / Admin / Manager / Viewer have CRM access.
 *  Accountant / Site Engineer / Supervisor / Client should not
 *  see the CRM tab at all.
 *
 *  Per-FAB / per-action visibility is still gated by `<Can>` and
 *  `useGuardedRoute`, so opening up the *navigation* surface
 *  doesn't expand what users can DO.
 */
const BOTTOM_TABS_BY_ROLE: Record<RoleKey, ReadonlySet<BottomTabKey>> = {
  // SA / Admin / Manager / Viewer get CRM.
  superAdmin:   new Set(['index', 'overview', 'crm', 'toolkit', 'chats']),
  admin:        new Set(['index', 'overview', 'crm', 'toolkit', 'chats']),
  manager:      new Set(['index', 'overview', 'crm', 'toolkit', 'chats']),
  viewer:       new Set(['index', 'overview', 'crm', 'toolkit', 'chats']),
  // Accountant / Site Engineer / Supervisor / Client — no CRM.
  accountant:   new Set(['index', 'overview', 'toolkit', 'chats']),
  siteEngineer: new Set(['index', 'overview', 'toolkit', 'chats']),
  supervisor:   new Set(['index', 'overview', 'toolkit', 'chats']),
  client:       new Set(['index', 'overview', 'toolkit', 'chats']),
};

const EMPTY_BOTTOM_TABS = new Set<BottomTabKey>();

export function useVisibleBottomTabs(): ReadonlySet<BottomTabKey> {
  const { role, loading } = usePermissions();
  return useMemo(() => {
    // While role is settling (sign-in, org switch, etc.), return the
    // EMPTY set rather than ALL — showing all tabs briefly was the
    // root cause of the "admin tabs flash on supervisor switch" bug.
    // The brief blank window is hidden by the OrgSwitcherSheet's
    // overlay during a switch, and on first sign-in there's no
    // prior tab state for the user to compare against.
    if (loading || !role) return EMPTY_BOTTOM_TABS;
    return BOTTOM_TABS_BY_ROLE[role] ?? EMPTY_BOTTOM_TABS;
  }, [role, loading]);
}

// ── Project-detail-tab visibility ─────────────────────────────────

export type ProjectTabKey =
  | 'transaction'
  | 'site'
  | 'task'
  | 'attendance'
  | 'material'
  | 'party'
  | 'whiteboard'
  | 'laminate'
  | 'files';

const PROJECT_TABS_BY_ROLE: Record<RoleKey, ReadonlySet<ProjectTabKey>> = {
  superAdmin: new Set([
    'transaction', 'site', 'task', 'attendance',
    'material', 'party', 'whiteboard', 'laminate', 'files',
  ]),
  admin: new Set([
    'transaction', 'site', 'task', 'attendance',
    'material', 'party', 'whiteboard', 'laminate', 'files',
  ]),
  manager: new Set([
    'transaction', 'site', 'task', 'attendance',
    'material', 'party', 'whiteboard', 'laminate', 'files',
  ]),
  // Accountant: only the money / party tabs.
  accountant: new Set(['transaction', 'party']),
  // Site Engineer: full execution stack except Party (read-only at most).
  siteEngineer: new Set([
    'transaction', 'site', 'task', 'attendance',
    'material', 'whiteboard', 'laminate', 'files',
  ]),
  // Supervisor: on-site daily-execution surface PLUS the
  // transaction tab in submit-only mode (they need to submit
  // their own purchase bills for admin approval). The
  // TransactionTab + add-transaction screen already detect
  // submit-vs-write mode from `usePermissions` and route to
  // "Submit for approval" with `workflowStatus: 'pending_approval'`.
  // The list itself is filtered to own-submissions-only via
  // `useTransactions(projectId, { scope: 'own' })`.
  supervisor: new Set(['transaction', 'site', 'task', 'attendance', 'material']),
  // Viewer: full read across every tab.
  viewer: new Set([
    'transaction', 'site', 'task', 'attendance',
    'material', 'party', 'whiteboard', 'laminate', 'files',
  ]),
  // Client: read-only on a curated subset (no money / no team data).
  client: new Set(['site', 'task', 'files', 'laminate']),
};

const EMPTY_PROJECT_TABS = new Set<ProjectTabKey>();

export function useVisibleProjectTabs(): ReadonlySet<ProjectTabKey> {
  const { role, loading } = usePermissions();
  return useMemo(() => {
    // Same conservative-during-load policy as bottom tabs — return
    // EMPTY rather than ALL so a switch never flashes the wrong
    // role's tab strip.
    if (loading || !role) return EMPTY_PROJECT_TABS;
    return PROJECT_TABS_BY_ROLE[role] ?? EMPTY_PROJECT_TABS;
  }, [role, loading]);
}
