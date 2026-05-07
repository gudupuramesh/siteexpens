/**
 * Default staff role presets — the "quick pick" chips shown on the
 * Add Staff form. Tuned for an Indian interior-design studio:
 *
 *   - On-site supervision  (Site Incharge, Supervisor, Site Engineer)
 *   - Skilled tradespeople (Carpenter, Electrician, Plumber, Painter,
 *     POP / False Ceiling, Tile / Marble Mason)
 *   - Helpers / labour     (Helper)
 *   - Studio / back-office (Designer, Accountant, Office Admin)
 *
 * Each role is just a label string — staff docs store the role as
 * free-text, so users can also type a custom role or extend the
 * preset list via the Staff Role Library page.
 */

export type StaffRoleOption = { key: string; label: string };

/** Built-in presets. The `key` is a stable slug used to merge with
 *  the user's custom roles in `useStaffRoles` without duplicates. */
export const DEFAULT_STAFF_ROLES: StaffRoleOption[] = [
  // On-site supervision
  { key: 'site_incharge', label: 'Site Incharge' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'site_engineer', label: 'Site Engineer' },
  // Skilled trades
  { key: 'carpenter', label: 'Carpenter' },
  { key: 'electrician', label: 'Electrician' },
  { key: 'plumber', label: 'Plumber' },
  { key: 'painter', label: 'Painter' },
  { key: 'pop_false_ceiling', label: 'POP / False Ceiling' },
  { key: 'tile_marble_mason', label: 'Tile / Marble Mason' },
  // Helpers
  { key: 'helper', label: 'Helper' },
  // Studio / back-office
  { key: 'designer', label: 'Designer' },
  { key: 'accountant', label: 'Accountant' },
  { key: 'office_admin', label: 'Office Admin' },
];

export function toRoleKey(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'staff'
  );
}
