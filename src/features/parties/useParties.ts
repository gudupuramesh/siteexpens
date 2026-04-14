/**
 * Live subscription to all parties in the current organization.
 * Sorted by name alphabetically.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Party } from './types';

export type UsePartiesResult = {
  data: Party[];
  loading: boolean;
};

export function useParties(orgId: string | undefined): UsePartiesResult {
  const [data, setData] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('parties')
      .where('orgId', '==', orgId)
      .onSnapshot(
        (snap) => {
          const rows: Party[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Party, 'id'>),
          }));
          rows.sort((a, b) => a.name.localeCompare(b.name));
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useParties] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId]);

  return { data, loading };
}
