/**
 * Studio monthly P&L — combines project transactions and studio
 * overhead into the single bottom-line number for the chosen
 * month.
 *
 *   Final profit = project_income − project_expense − overhead
 *
 * Used by the Studio P&L card on the Overview tab. Reads the
 * already-scoped data from `useProjectTotals` (role-aware) and
 * `useOrgFinances` (finance.read-gated) — neither hook is
 * re-fetched here.
 */
import { useMemo } from 'react';

import { useOrgFinances } from '@/src/features/finances/useOrgFinances';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import {
  isTransactionCountedInTotals,
  normalizeTransactionType,
} from '@/src/features/transactions/types';

export type StudioMonthlyPL = {
  /** Project income for the month (sum of payment_in across all
   *  visible projects). */
  income: number;
  /** Project expense for the month (sum of payment_out). */
  projectExpense: number;
  /** Studio overhead for the month (rent, utilities, salaries,
   *  petty cash — everything from `orgFinances` of kind=expense). */
  overhead: number;
  /** Final company profit = income − projectExpense − overhead. */
  profit: number;
  loading: boolean;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function useStudioMonthlyPL(month: Date): StudioMonthlyPL {
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;

  const { transactions, loading: txLoading } = useProjectTotals(orgId);
  const { data: orgFinances, loading: ofLoading } = useOrgFinances(orgId);

  return useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);

    let income = 0;
    let projectExpense = 0;
    for (const t of transactions) {
      if (!isTransactionCountedInTotals(t)) continue;
      const d = t.date?.toDate?.() ?? t.createdAt?.toDate?.();
      if (!d || d < start || d > end) continue;
      const kind = normalizeTransactionType(t.type);
      if (kind === 'payment_in') income += t.amount;
      else projectExpense += t.amount;
    }

    let overhead = 0;
    for (const f of orgFinances) {
      if (f.kind !== 'expense') continue;
      const d = f.paidAt?.toDate?.() ?? f.createdAt?.toDate?.();
      if (!d || d < start || d > end) continue;
      overhead += f.amount;
    }

    return {
      income,
      projectExpense,
      overhead,
      profit: income - projectExpense - overhead,
      loading: txLoading || ofLoading,
    };
  }, [transactions, orgFinances, month, txLoading, ofLoading]);
}
