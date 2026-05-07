/**
 * Role permission matrix. Single source of truth for what each role can do
 * across the app. Mirrors `docs/roles-and-permissions.md`.
 *
 * Read access is implicit for any module a role can see — only writes,
 * approvals, and other side-effecting actions need explicit capabilities.
 */
import type { RoleKey } from './types';

export const ROLE_LABELS: Record<RoleKey, string> = {
  superAdmin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  accountant: 'Accountant',
  siteEngineer: 'Site Engineer',
  supervisor: 'Supervisor',
  viewer: 'Viewer',
  client: 'Client',
};

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  superAdmin: 'Studio owner. Full access; manages other admins.',
  admin: 'Full operational access; cannot manage other admins.',
  manager: 'Runs projects and teams. No banking access.',
  accountant: 'Finance only — transactions, parties, reports.',
  siteEngineer: 'Technical execution — tasks, designs, materials, DPR.',
  supervisor: 'On-site execution — attendance, DPR, task updates.',
  viewer: 'Org-wide read-only access.',
  client: 'Per-project read-only on assigned projects.',
};

/** A role anyone can be assigned (Super Admin is reserved for the org owner). */
export type AssignableRole = Exclude<RoleKey, 'superAdmin'>;

/** Roles available to assign by Super Admin (everyone except superAdmin itself). */
export const ASSIGNABLE_ROLES_BY_SUPER_ADMIN: AssignableRole[] = [
  'admin',
  'manager',
  'accountant',
  'siteEngineer',
  'supervisor',
  'viewer',
  'client',
];

/** Roles available to assign by Admin (cannot grant admin / superAdmin). */
export const ASSIGNABLE_ROLES_BY_ADMIN: AssignableRole[] = [
  'manager',
  'accountant',
  'siteEngineer',
  'supervisor',
  'viewer',
  'client',
];

/** Capability strings used everywhere we want to gate a UI action. */
export type Capability =
  | 'studio.edit'
  | 'team.manage'
  /**
   * Manage the studio's plan & subscription — open the plan picker,
   * tap Upgrade/Downgrade, restore purchases, accept terms.
   *
   * STUDIO OWNER (Super Admin) ONLY — even Admins can't subscribe.
   *
   * Why owner-only and not admin-too:
   *  - The purchase is tied to whatever Apple ID is signed in on the
   *    device performing the tap. If two admins on two phones could
   *    both upgrade, you'd get duplicate Apple-side charges or a
   *    confusing entitlement-ownership state on the org.
   *  - Restore Purchases is only meaningful for the Apple ID that
   *    originally paid — surfacing it to non-payers leaks intent.
   *  - The Studio Owner is the studio's billing relationship; everyone
   *    else sees usage stats read-only and a hint to ask the owner.
   *
   * NOT in `ALL_CAPS` — explicitly added to `superAdmin` only.
   */
  | 'billing.manage'
  | 'project.create'
  | 'project.edit'
  | 'project.delete'
  | 'task.write'
  | 'task.update.own'
  | 'transaction.write'
  | 'transaction.read'
  /** Submit payment rows pending Admin/Super Admin approval (site roles). */
  | 'transaction.submit'
  /** Approve/reject pending transactions (Admin / Super Admin only). */
  | 'transaction.approve'
  | 'dpr.write'
  | 'attendance.write'
  | 'material.request.write'
  | 'material.request.approve'
  | 'materialLibrary.write'
  | 'taskLibrary.write'
  | 'design.write'
  | 'laminate.write'
  | 'whiteboard.write'
  | 'party.write'
  | 'crm.write'
  | 'report.read'
  | 'finance.read'
  | 'finance.write';

const ALL_CAPS: Capability[] = [
  'studio.edit',
  'team.manage',
  'project.create',
  'project.edit',
  'project.delete',
  'task.write',
  'task.update.own',
  'transaction.write',
  'transaction.read',
  'transaction.submit',
  'transaction.approve',
  'dpr.write',
  'attendance.write',
  'material.request.write',
  'material.request.approve',
  'materialLibrary.write',
  'taskLibrary.write',
  'design.write',
  'laminate.write',
  'whiteboard.write',
  'party.write',
  'crm.write',
  'report.read',
  'finance.read',
  'finance.write',
];

/** Capabilities granted ONLY to the Studio Owner (Super Admin), even
 *  when other privileged roles like Admin get everything else. Today
 *  this is just billing — see `billing.manage` JSDoc for why. */
const OWNER_ONLY_CAPS: Capability[] = ['billing.manage'];

function capsFor(role: RoleKey): Set<Capability> {
  switch (role) {
    case 'superAdmin':
      return new Set<Capability>([...ALL_CAPS, ...OWNER_ONLY_CAPS]);

    case 'admin':
      // Admin gets every operational capability EXCEPT the
      // owner-only ones (billing). Keep this `new Set(ALL_CAPS)` —
      // do NOT spread OWNER_ONLY_CAPS in.
      return new Set(ALL_CAPS);

    case 'manager':
      return new Set<Capability>([
        'project.create',
        'project.edit',
        'task.write',
        'task.update.own',
        'transaction.read',
        'dpr.write',
        'attendance.write',
        'material.request.write',
        'material.request.approve',
        'materialLibrary.write',
        'taskLibrary.write',
        'design.write',
        'laminate.write',
        'whiteboard.write',
        'party.write',
        'crm.write',
        'report.read',
      ]);

    case 'accountant':
      return new Set<Capability>([
        'transaction.write',
        'transaction.read',
        'party.write',
        'report.read',
        'finance.read',
        'finance.write',
      ]);

    case 'siteEngineer':
      return new Set<Capability>([
        'task.write',
        'task.update.own',
        'dpr.write',
        'attendance.write',
        'material.request.write',
        'design.write',
        'laminate.write',
        'whiteboard.write',
        'transaction.submit',
        'transaction.read',
        // Submit-only roles need to be able to add a party inline
        // when raising an expense, otherwise the transaction form
        // is unsubmittable (party is required). Their own
        // submissions stay scoped to `createdBy == uid` via the
        // transactions read rule, so this only widens write access
        // to the org-scoped `parties` collection.
        'party.write',
      ]);

    case 'supervisor':
      return new Set<Capability>([
        'task.update.own',
        'dpr.write',
        'attendance.write',
        'material.request.write',
        'transaction.submit',
        'transaction.read',
        // Same reason as siteEngineer above — supervisors need to
        // create a party while raising an expense.
        'party.write',
      ]);

    case 'viewer':
      // Viewer can submit DPRs (project-scoped daily reports) — only
      // client and accountant are excluded from that capability.
      return new Set<Capability>(['transaction.read', 'report.read', 'dpr.write']);

    case 'client':
      return new Set<Capability>();

    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export const PERMISSIONS: Record<RoleKey, Set<Capability>> = {
  superAdmin: capsFor('superAdmin'),
  admin: capsFor('admin'),
  manager: capsFor('manager'),
  accountant: capsFor('accountant'),
  siteEngineer: capsFor('siteEngineer'),
  supervisor: capsFor('supervisor'),
  viewer: capsFor('viewer'),
  client: capsFor('client'),
};

/** True when the role has the capability. Returns false when role is null. */
export function can(role: RoleKey | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return PERMISSIONS[role].has(cap);
}

// ── Module-level summary (for the role picker UI) ──────────────────
//
// The capability matrix above is the source of truth, but the UI also
// needs a digestible per-module summary ("Projects: full access",
// "Tasks: read only", "Transactions: no access") so a Studio Admin can
// quickly compare roles when assigning one. This is a hand-curated
// projection of the capability matrix into ~12 user-facing modules.

export const MODULE_KEYS = [
  'projects',
  'tasks',
  'transactions',
  'dpr',
  'attendance',
  'materials',
  'designs',
  'laminates',
  'whiteboard',
  'parties',
  'crm',
  'studio',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  projects: 'Projects',
  tasks: 'Tasks',
  transactions: 'Transactions',
  dpr: 'DPR',
  attendance: 'Attendance',
  materials: 'Materials',
  designs: 'Designs',
  laminates: 'Laminates',
  whiteboard: 'Whiteboard',
  parties: 'Parties',
  crm: 'CRM',
  studio: 'Studio',
};

/**
 * Per-module access intensity:
 *  - `full`    → write/manage that module end to end.
 *  - `partial` → read-only OR a narrow subset of writes (e.g. update own
 *                tasks, request materials but not approve, mark
 *                attendance only).
 *  - `none`    → not visible / no access.
 */
export type AccessLevel = 'full' | 'partial' | 'none';

export const ROLE_MODULE_ACCESS: Record<RoleKey, Record<ModuleKey, AccessLevel>> = {
  superAdmin: {
    projects: 'full',
    tasks: 'full',
    transactions: 'full',
    dpr: 'full',
    attendance: 'full',
    materials: 'full',
    designs: 'full',
    laminates: 'full',
    whiteboard: 'full',
    parties: 'full',
    crm: 'full',
    studio: 'full',
  },
  admin: {
    projects: 'full',
    tasks: 'full',
    transactions: 'full',
    dpr: 'full',
    attendance: 'full',
    materials: 'full',
    designs: 'full',
    laminates: 'full',
    whiteboard: 'full',
    parties: 'full',
    crm: 'full',
    studio: 'full',
  },
  manager: {
    projects: 'full',
    tasks: 'full',
    transactions: 'partial',
    dpr: 'full',
    attendance: 'full',
    materials: 'full',
    designs: 'full',
    laminates: 'full',
    whiteboard: 'full',
    parties: 'full',
    crm: 'full',
    studio: 'partial',
  },
  accountant: {
    projects: 'partial',
    tasks: 'none',
    transactions: 'full',
    dpr: 'none',
    attendance: 'none',
    materials: 'none',
    designs: 'none',
    laminates: 'none',
    whiteboard: 'none',
    parties: 'full',
    crm: 'none',
    studio: 'partial',
  },
  siteEngineer: {
    projects: 'partial',
    tasks: 'full',
    transactions: 'partial',
    dpr: 'full',
    attendance: 'full',
    materials: 'partial',
    designs: 'full',
    laminates: 'full',
    whiteboard: 'full',
    parties: 'partial',
    crm: 'none',
    studio: 'none',
  },
  supervisor: {
    projects: 'partial',
    tasks: 'partial',
    transactions: 'partial',
    dpr: 'full',
    attendance: 'full',
    materials: 'partial',
    designs: 'partial',
    laminates: 'partial',
    whiteboard: 'none',
    parties: 'none',
    crm: 'none',
    studio: 'none',
  },
  viewer: {
    projects: 'partial',
    tasks: 'partial',
    transactions: 'partial',
    dpr: 'partial',
    attendance: 'partial',
    materials: 'partial',
    designs: 'partial',
    laminates: 'partial',
    whiteboard: 'partial',
    parties: 'partial',
    crm: 'partial',
    studio: 'partial',
  },
  client: {
    projects: 'partial',
    tasks: 'partial',
    transactions: 'none',
    dpr: 'partial',
    attendance: 'none',
    materials: 'none',
    designs: 'partial',
    laminates: 'partial',
    whiteboard: 'none',
    parties: 'none',
    crm: 'none',
    studio: 'none',
  },
};
