# Studio Roles and Permissions

Source of truth for role-based access in SiteExpens. The fixed-preset matrix in this doc maps 1:1 to `PERMISSIONS` in `src/features/org/permissions.ts` (planned).

- **One owned studio per user.** A user can CREATE exactly one organization (the studio they set up at first sign-in or via the "+ Create your studio" entry in Profile). They can be invited as a MEMBER into unlimited other studios in any role. Enforced server-side by the `createOrganization` Cloud Function — clients cannot bypass via direct Firestore writes (rules block `organizations.create` entirely; the callable runs `where('ownerId', '==', uid).limit(1)` and rejects when non-empty).
- **Multi-org accounts:** A user can be in more than one organization (`memberIds`). The app evaluates permissions against the **active** org only — `users/{uid}.primaryOrgId`. Switching organizations (Studio profile) updates that field via the `setPrimaryOrganization` callable after server-side membership checks.
- **Scope:** While viewing the app, every screen is scoped to the active organization. Their role on `organizations/{orgId}.roles[uid]` for that active org decides what they can do app-wide.
- **Client exception:** Clients are scoped to specific projects via `projects/{id}.clientUids[]`. They never see the org-wide project list.
- **Single Super Admin:** The org creator. Transferable but only one at a time. Cannot be removed by anyone but themselves (during transfer).

---

## Role summaries

### Super Admin
- The owner of the studio. Created automatically when the org is set up.
- Has every capability in the system, including managing other admins and transferring ownership.
- Cannot be demoted by anyone else.

### Admin
- Trusted operator with effectively the same day-to-day access as Super Admin.
- Cannot create or remove another Admin / Super Admin (only Super Admin can).
- Cannot transfer ownership.

### Manager
- Operational lead. Runs projects end-to-end without seeing or moving money.
- Approves material requests, creates and edits projects, manages tasks/teams.
- Read-only on transactions and banking (cannot approve money entries).

### Accountant
- Finance-only operator. Sees every project but only writes to transactions, parties, org-level **Finances** (`finance.read` / `finance.write`), and reports.
- Cannot create projects, edit tasks, mark attendance, or approve material requests.

### Site Engineer
- Technical execution. Owns tasks, designs, laminates, materials, DPR, and attendance for the projects they're on.
- Can **submit** payment rows (`transaction.submit`) that stay **pending** until an Admin or Super Admin approves; read-only on posted ledger totals scope matches app rules.
- Cannot edit project details or manage team.

### Supervisor
- On-site execution. Marks attendance, fills DPR, updates assigned tasks, and raises material requests.
- Same **submit-only** transaction path as Site Engineer; read-only on designs/laminates; no team-management access.

### Viewer
- Org-wide read-only. Useful for owners, partners, auditors, or read-only stakeholders.
- Cannot create or edit anything.

### Client
- Per-project read-only on a curated subset (Overview, DPR, Designs, Laminates, Tasks status).
- Only sees projects where their uid is in `projects/{id}.clientUids`.
- Never sees Transactions, Attendance, Material Requests, CRM, or other clients' projects.

---

## Access matrix

Legend: **F** = full CRUD · **C** = create + read · **U-own** = update only own records · **R** = read · **A** = approve · **—** = no access.

### Studio and team
| Module | Super Admin | Admin | Manager | Accountant | Site Engineer | Supervisor | Viewer | Client |
|---|---|---|---|---|---|---|---|---|
| Studio profile (edit) | F | F | R | R | R | R | R | — |
| Team and roles | F | F | — | — | — | — | — | — |
| Org members list | F | F | R | R | R | R | R | — |
| Studio dashboard / reports | F | F | F | F | R | R | R | — |

### Projects
| Module | Super Admin | Admin | Manager | Accountant | Site Engineer | Supervisor | Viewer | Client |
|---|---|---|---|---|---|---|---|---|
| Project — create | Y | Y | Y | — | — | — | — | — |
| Project — edit details | F | F | F | — | — | — | — | — |
| Project — delete | Y | Y | — | — | — | — | — | — |
| Project list scope | All | All | All | All | All | All | All | Assigned only |
| Project overview | F | F | F | F | F | F | R | R |

### Site execution
| Module | Super Admin | Admin | Manager | Accountant | Site Engineer | Supervisor | Viewer | Client |
|---|---|---|---|---|---|---|---|---|
| Tasks | F | F | F | R | F | C + U-own | R | R |
| DPR | F | F | F | R | F | F | R | R |
| Attendance | F | F | F | R | F | F | R | — |
| Whiteboard | F | F | F | — | F | R | R | — |

### Materials and procurement
| Module | Super Admin | Admin | Manager | Accountant | Site Engineer | Supervisor | Viewer | Client |
|---|---|---|---|---|---|---|---|---|
| Materials usage | F | F | F | R | F | R | R | — |
| Material request — create | F | F | F | R | C | C | R | — |
| Material request — approve | A | A | A | — | — | — | — | — |
| Material request — auto on create | Y (Admin+) | Y | Y | — | — | — | — | — |
| Material library (org) | F | F | F | R | R | R | R | — |
| Task category library | F | F | F | R | R | R | R | — |

### Design library
| Module | Super Admin | Admin | Manager | Accountant | Site Engineer | Supervisor | Viewer | Client |
|---|---|---|---|---|---|---|---|---|
| Designs | F | F | F | R | F | R | R | R |
| Laminates | F | F | F | R | F | R | R | R |

### Finance and CRM
| Module | Super Admin | Admin | Manager | Accountant | Site Engineer | Supervisor | Viewer | Client |
|---|---|---|---|---|---|---|---|---|
| Transactions (payments) | F | F | R | F | Submit pending | Submit pending | R | — |
| Transactions — approve money | Y | Y | — | — | — | — | — | — |
| Studio finances (`orgFinances`) | F | F | — | F | — | — | — | — |
| Parties (org directory) | F | F | F | F | R | R | R | — |
| CRM Leads | F | F | F | R | — | — | R | — |
| CRM Appointments | F | F | F | R | R | R | R | — |

---

## How invites work (phone is the join key)

```
Owner taps Invite -> contact picker -> pick role -> inviteMember (cloud function)
    user already exists -> added to org.memberIds + roles[uid] = role
    user not registered -> invites/{E164phone} doc holds { orgs: { orgId: role } }

Invitee signs in for the first time:
    AuthProvider creates users/{uid}
    claimInvites (cloud function) reads invites/{E164phone}
    arrayUnion uid into each org.memberIds, sets roles[uid] = invitedRole
    sets users/{uid}.primaryOrgId (only if it was null)
    deletes the invite

Result: invitee skips onboarding entirely and lands on the studio dashboard.
```

- **Existing users** added immediately; the new studio shows up on their next snapshot.
- **Brand-new phones** see a brief loading spinner during `claimInvites`, then the dashboard. They never see the studio-creation form.
- **Multiple invites** are claimed in one batch. The first orgId becomes `primaryOrgId`; the rest are accessible via the (future) multi-org switcher.
- **Role updates** are idempotent — re-invite with a different role just updates `roles[uid]`.
- **Removing a member** is demote-only: removes uid from `memberIds` and clears `roles[uid]` for that org; their account and other studios are untouched.
- **Clients are invited from inside the project** (not Team and Roles). The same callable also writes the uid into `projects/{id}.clientUids`.

## Role-management rules

- **Promote / demote to Admin or Super Admin:** Super Admin only.
- **Promote / demote to other roles:** Super Admin and Admin.
- **Remove a member:** Super Admin and Admin. The Super Admin cannot be removed without transferring ownership first.
- **Self-edits:** Members cannot change their own role.

---

## Capability keys (planned in `permissions.ts`)

Each row above maps to one or more capability strings. The current planned set is:

- `studio.edit`
- `team.manage`
- `project.create`, `project.edit`, `project.delete`
- `task.write`, `task.update.own`
- `transaction.write`, `transaction.read`
- `dpr.write`
- `attendance.write`
- `material.request.write`, `material.request.approve`
- `materialLibrary.write`
- `taskLibrary.write`
- `design.write`
- `laminate.write`
- `whiteboard.write`
- `party.write`
- `finance.read`, `finance.write` (studio `orgFinances` ledger; Super Admin, Admin, Accountant)
- `crm.write`
- `report.read`

Read access is implicit for any module a role can see — only writes/approvals need explicit capabilities.

---

## Multi-device role testing

Use one **EAS development build** per platform (same `development` profile); install on each phone. Sign in with **different phone numbers** so you get two Firebase users.

1. Build/install the dev client (e.g. `eas build --profile development --platform ios` and `--platform android`).
2. On device A, sign in as the org owner or an **Admin**.
3. Invite the second user’s phone/email into the organization and open **Team / roles** (`team-roles` in the app) to assign a role (e.g. **Site Engineer** vs **Admin**).
4. On device B, sign in as the invited user and exercise flows allowed by that role.

OTP on native builds requires a **mobile-enabled** MSG91 widget (see `.env.example`). For a quick single-device bypass in development only, use `EXPO_PUBLIC_DEV_LOGIN_PHONE` with `mintDevTestToken` (`functions/src/devAuth.ts`).

---

## Out-of-scope notes

- **Server enforcement.** Today `firestore.rules` allows any org member full read/write across most collections. Hardening per-capability rules + a `setMemberRole` callable is a follow-up. UI gates ship first against this matrix.
- **Custom roles.** Not supported — preset roles only, by your decision.
- **Per-member overrides.** Not supported — all members on the same role share the same permissions.
