/**
 * Live subscription to all transactions for a given project.
 * Sorted by date descending. Computes totals (income, expense, balance).
 * Handles both old ('income'/'expense') and new ('payment_in'/'payment_out') type values.
 */
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Transaction } from './types';
import { normalizeTransactionType } from './types';

export type TransactionTotals = {
  income: number;
  expense: number;
  balance: number;
};

export type UseTransactionsResult = {
  data: Transaction[];
  loading: boolean;
  totals: TransactionTotals;
};

export function useTransactions(projectId: string | undefined): UseTransactionsResult {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('transactions')
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const rows: Transaction[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Transaction, 'id'>),
          }));
          // Newest first; pending serverTimestamp sorts to top
          rows.sort((a, b) => {
            const at = a.date ? a.date.toMillis() : Number.MAX_SAFE_INTEGER;
            const bt = b.date ? b.date.toMillis() : Number.MAX_SAFE_INTEGER;
            return bt - at;
          });
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useTransactions] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [projectId]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of data) {
      const normalized = normalizeTransactionType(t.type);
      if (normalized === 'payment_in') income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, balance: income - expense };
  }, [data]);

  return { data, loading, totals };
}
