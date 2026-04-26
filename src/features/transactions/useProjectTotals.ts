/**
 * Live subscription to *all* transactions in the org, grouped by
 * projectId so the projects list can render a tiny in/out/balance trio
 * on each card without firing N separate Firestore queries.
 *
 * Returns a Map<projectId, { income, expense, balance }>.
 */
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Transaction } from './types';
import { normalizeTransactionType } from './types';

export type ProjectTotals = {
  income: number;
  expense: number;
  balance: number;
};

export type UseProjectTotalsResult = {
  totalsByProject: Map<string, ProjectTotals>;
  loading: boolean;
};

export function useProjectTotals(orgId: string | undefined): UseProjectTotalsResult {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('transactions')
      .where('orgId', '==', orgId)
      .onSnapshot(
        (snap) => {
          const rows: Transaction[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Transaction, 'id'>),
          }));
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useProjectTotals] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId]);

  const totalsByProject = useMemo(() => {
    const m = new Map<string, ProjectTotals>();
    for (const t of data) {
      if (!t.projectId) continue;
      const existing = m.get(t.projectId) ?? { income: 0, expense: 0, balance: 0 };
      const kind = normalizeTransactionType(t.type);
      if (kind === 'payment_in') existing.income += t.amount;
      else existing.expense += t.amount;
      existing.balance = existing.income - existing.expense;
      m.set(t.projectId, existing);
    }
    return m;
  }, [data]);

  return { totalsByProject, loading };
}
