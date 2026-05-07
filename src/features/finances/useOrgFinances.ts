/**
 * Recent org-level finance rows (studio expenses / income).
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { OrgFinance } from './types';

export type UseOrgFinancesOptions = {
  /** Max documents to load (default 50). */
  limit?: number;
};

export type UseOrgFinancesResult = {
  data: OrgFinance[];
  loading: boolean;
};

export function useOrgFinances(
  orgId: string | null | undefined,
  opts?: UseOrgFinancesOptions,
): UseOrgFinancesResult {
  const limitN = opts?.limit ?? 50;
  const [data, setData] = useState<OrgFinance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('orgFinances')
      .where('orgId', '==', orgId)
      .orderBy('paidAt', 'desc')
      .limit(limitN)
      .onSnapshot(
        (snap) => {
          const rows: OrgFinance[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<OrgFinance, 'id'>),
          }));
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useOrgFinances] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId, limitN]);

  return { data, loading };
}
