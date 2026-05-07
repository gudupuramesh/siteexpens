/**
 * Month-to-date sums for orgFinances (studio P&L slice).
 */
import { useEffect, useMemo, useState } from 'react';

import { db, firestore } from '@/src/lib/firebase';

import type { OrgFinance } from './types';

export type OrgFinancesMonthTotals = {
  income: number;
  expense: number;
  salaryExpense: number;
  net: number;
};

export type UseOrgFinancesTotalsResult = {
  mtd: OrgFinancesMonthTotals;
  loading: boolean;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function useOrgFinancesTotals(orgId: string | null | undefined): UseOrgFinancesTotalsResult {
  const [rows, setRows] = useState<OrgFinance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const unsub = db
      .collection('orgFinances')
      .where('orgId', '==', orgId)
      .where('paidAt', '>=', firestore.Timestamp.fromDate(start))
      .where('paidAt', '<=', firestore.Timestamp.fromDate(end))
      .onSnapshot(
        (snap) => {
          const list: OrgFinance[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<OrgFinance, 'id'>),
          }));
          setRows(list);
          setLoading(false);
        },
        (err) => {
          console.warn('[useOrgFinancesTotals] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId]);

  const mtd = useMemo(() => {
    let income = 0;
    let expense = 0;
    let salaryExpense = 0;
    for (const r of rows) {
      if (r.kind === 'income') income += r.amount;
      else {
        expense += r.amount;
        if (r.category === 'salary') salaryExpense += r.amount;
      }
    }
    return {
      income,
      expense,
      salaryExpense,
      net: income - expense,
    };
  }, [rows]);

  return { mtd, loading };
}
