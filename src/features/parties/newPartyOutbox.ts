/**
 * newPartyOutbox — tiny in-memory hand-off slot.
 *
 * Used when the user creates (or matches an existing) party from inside
 * another flow (e.g. the Add Transaction screen) and we need to return
 * to the originating screen with the resulting party's id + name so it
 * can be auto-selected.
 *
 * Why not Zustand / route params / event emitter:
 *   - Only one writer (`add-party.tsx`) and one reader
 *     (`add-transaction.tsx` on focus). A module-level slot is the
 *     smallest possible primitive that does the job.
 *   - Self-clears on read (`consume`) so stale state can never leak
 *     into the next transaction or the next time the user opens the
 *     add-party form on its own.
 *   - Writing the value before `router.back()` and reading it inside a
 *     `useFocusEffect` on the parent screen guarantees the parent sees
 *     the value exactly once — the next time it gains focus.
 */

type PendingNewParty = {
  id: string;
  name: string;
};

let pending: PendingNewParty | null = null;

/** Stash a freshly-created (or matched-existing) party for the parent screen. */
export function setNewPartyOutbox(p: PendingNewParty): void {
  pending = p;
}

/** Drain the slot. Returns the value once, then resets to null. */
export function consumeNewPartyOutbox(): PendingNewParty | null {
  const out = pending;
  pending = null;
  return out;
}
