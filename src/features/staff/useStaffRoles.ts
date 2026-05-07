/**
 * Live staff role list — defaults merged with the org's custom roles.
 * Mirrors `useTaskCategories`. Used by the Add Staff form to render
 * quick-pick chips and by the Staff Role Library page to manage extras.
 */
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/src/lib/firebase';
import { DEFAULT_STAFF_ROLES, type StaffRoleOption } from './roles';
import type { StaffRoleLibraryItem } from './staffRoleLibrary';

export type UseStaffRolesResult = {
  data: StaffRoleOption[];
  loading: boolean;
};

export function useStaffRoles(orgId: string | undefined): UseStaffRolesResult {
  const [library, setLibrary] = useState<StaffRoleLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLibrary([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('staffRoleLibrary')
      .where('orgId', '==', orgId)
      .onSnapshot(
        (snap) => {
          const rows: StaffRoleLibraryItem[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<StaffRoleLibraryItem, 'id'>),
          }));
          rows.sort((a, b) => a.label.localeCompare(b.label));
          setLibrary(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useStaffRoles] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId]);

  // Merge defaults + custom by key — defaults stay visible even if
  // the user hasn't created any custom roles yet.
  const data = useMemo(() => {
    const map = new Map<string, StaffRoleOption>();
    for (const item of DEFAULT_STAFF_ROLES) map.set(item.key, item);
    for (const item of library) map.set(item.key, { key: item.key, label: item.label });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [library]);

  return { data, loading };
}
