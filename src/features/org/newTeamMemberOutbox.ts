/**
 * newTeamMemberOutbox — cross-screen handoff for the team-member picker.
 *
 * Mirrors `newPartyOutbox` but for the team flow. When the user
 * selects (or wants to invite) someone in `/select-party?mode=team`,
 * the chosen item is stashed here and the route pops back. The
 * originating screen (project members.tsx, org team-roles.tsx, etc.)
 * drains it on focus and routes the user into its own role-picker /
 * invite flow.
 *
 * Three kinds:
 *   • 'existing' — they're already in the org. Caller decides what to
 *     do (e.g. project members.tsx might add them to the project; the
 *     org team-roles.tsx might edit their role).
 *   • 'contact'  — picked from the device phonebook. Caller routes
 *     them into the role picker + OTP invite flow.
 *   • 'manual'   — user tapped "+ New Member" and wants to type
 *     name+phone manually. Caller opens its own small entry modal.
 *
 * Self-clears on read (consume) so stale state can't leak between
 * subsequent picker opens.
 */

export type PendingTeamMember =
  | {
      kind: 'existing';
      uid: string;
      displayName: string;
      phoneNumber: string;
    }
  | {
      kind: 'contact';
      displayName: string;
      phoneE164: string;
    }
  | {
      kind: 'manual';
    };

let pending: PendingTeamMember | null = null;

export function setNewTeamMemberOutbox(p: PendingTeamMember): void {
  pending = p;
}

export function consumeNewTeamMemberOutbox(): PendingTeamMember | null {
  const out = pending;
  pending = null;
  return out;
}
