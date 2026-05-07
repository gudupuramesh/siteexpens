/**
 * Live snapshot of the org's staff list. Includes archived staff
 * (filter caller-side if you only want active). Sorted by name.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Staff } from './types';

export type UseStaffResult = {
  data: Staff[];
  loading: boolean;
};

export function useStaff(orgId: string | null | undefined): UseStaffResult {
  const [data, setData] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('staff')
      .where('orgId', '==', orgId)
      .onSnapshot(
        (snap) => {
          const rows: Staff[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Staff, 'id'>),
          }));
          rows.sort((a, b) => a.name.localeCompare(b.name));
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useStaff] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId]);

  return { data, loading };
}
