/**
 * Live subscription to transactions for a given project.
 *
 * Sorted by business **date descending** (newest / latest first).
 * Rows without `date` fall back to `createdAt`; rows with neither have
 * sort key 0 and appear after dated rows. Tie-break: `createdAt` desc,
 * then `id`.
 *
 * Computes totals (income, expense, balance). Handles both legacy
 * `'income' | 'expense'` and current `'payment_in' | 'payment_out'` type values.
 *
 * Visibility is role-aware. Two scopes:
 *   - `'all'` (default for approvers): every transaction in the
 *     project. Used by Super Admin / Admin / Manager / Accountant
 *     who need the full ledger to approve / reconcile.
 *   - `'own'`: only transactions where `createdBy === currentUid`.
 *     Used by Supervisor / Site Engineer who can only SUBMIT bills
 *     (`transaction.submit` capability) but shouldn't see their
 *     teammates' finance data. Their list shows their own
 *     submissions in any state — pending, approved, or rejected.
 *
 * The hook auto-detects the right scope by reading `usePermissions`:
 * caller has `transaction.write` → `'all'`; otherwise → `'own'`.
 * Callers can override via the `scope` arg if needed.
 */
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/src/lib/firebase';
import { subscribeWithRetry } from '@/src/lib/subscribeWithRetry';
import { useAuth } from '@/src/features/auth/useAuth';
import { usePermissions } from '@/src/features/org/usePermissions';

import type { Transaction } from './types';
import { isTransactionCountedInTotals, normalizeTransactionType } from './types';

/** Primary sort key: business date, then createdAt — both optional on legacy docs. */
function ledgerSortMillis(t: Transaction): number {
  return t.date?.toMillis() ?? t.createdAt?.toMillis() ?? 0;
}

function compareTransactionsNewestFirst(a: Transaction, b: Transaction): number {
  const am = ledgerSortMillis(a);
  const bm = ledgerSortMillis(b);
  if (am !== bm) return bm - am;
  const ac = a.createdAt?.toMillis() ?? 0;
  const bc = b.createdAt?.toMillis() ?? 0;
  if (ac !== bc) return bc - ac;
  return b.id.localeCompare(a.id);
}

export type TransactionTotals = {
  income: number;
  expense: number;
  balance: number;
};

export type TransactionScope = 'all' | 'own';

export type UseTransactionsResult = {
  data: Transaction[];
  loading: boolean;
  totals: TransactionTotals;
  /** Sum of payment_out amounts awaiting approval (not in totals). */
  pendingPaymentOutTotal: number;
  pendingApprovalCount: number;
  /** Which scope is actively in effect. Components can use this to
   *  show "Showing only your submissions" hints in submit-only mode. */
  scope: TransactionScope;
};

export type UseTransactionsArgs = {
  /** Override the auto-detected scope. Useful for screens that need
   *  the full ledger regardless of the caller's role (e.g. an
   *  approver-only "all pending" inbox). */
  scope?: TransactionScope;
  /** Bumping this number forces the snapshot listener to drop and
   *  resubscribe. Wire to `useFirestoreRefresh().refreshKey` for
   *  pull-to-refresh on the FlatList. */
  refreshKey?: number;
};

export function useTransactions(
  projectId: string | undefined,
  args: UseTransactionsArgs = {},
): UseTransactionsResult {
  const { user } = useAuth();
  const { can, loading: permLoading, role } = usePermissions();
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Auto-detect scope from role unless caller pinned it explicitly.
  //
  // The capability matrix has three relevant caps:
  //   - `transaction.write`  → approver-tier with edit (SA/Admin/Accountant)
  //   - `transaction.read`   → ledger-wide read (Manager/Viewer + the above)
  //   - `transaction.submit` → can submit own bills (SiteEngineer/Supervisor)
  //
  // Submit-only roles ALSO carry `transaction.read` so the Transactions
  // tab renders for them and they can see their OWN submissions in
  // any state (pending / approved / rejected). The previous logic
  // collapsed read-OR-write into 'all', which meant SiteEngineer
  // (with both submit + read) saw the full ledger — leaking other
  // people's bills. Submit-without-write is the security boundary
  // for own-only scope; check that first.
  const autoScope: TransactionScope = can('transaction.write')
    ? 'all'
    : can('transaction.submit')
      ? 'own'
      : can('transaction.read')
        ? 'all'
        : 'own';
  const scope: TransactionScope = args.scope ?? autoScope;
  const refreshKey = args.refreshKey ?? 0;

  useEffect(() => {
    if (!projectId) {
      setData([]);
      setLoading(false);
      return;
    }
    // While role is settling, hold off on the query — otherwise we
    // briefly fire an 'all' query for a user who should only see
    // their own (race during sign-in / org switch).
    if (permLoading) {
      setLoading(true);
      return;
    }
    if (scope === 'own' && !user) {
      // Submit-only role with no signed-in user — return empty.
      setData([]);
      setLoading(false);
      return;
    }
    // Org / claims pipeline finished but user has no role in primary org
    // (or not signed in). Subscribing would hit rules and spam retries.
    if (user && role === null) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let q = db.collection('transactions').where('projectId', '==', projectId);
    if (scope === 'own' && user) {
      q = q.where('createdBy', '==', user.uid);
    }
    return subscribeWithRetry(
      q,
      (snap) => {
        const rows: Transaction[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Transaction, 'id'>),
        }));
        rows.sort(compareTransactionsNewestFirst);
        setData(rows);
        setLoading(false);
      },
      (err) => {
        console.warn('[useTransactions] snapshot error:', err);
        setLoading(false);
      },
      { tag: '[useTransactions]' },
    );
  }, [projectId, scope, user, permLoading, role, refreshKey]);

  const { totals, pendingPaymentOutTotal, pendingApprovalCount } = useMemo(() => {
    let income = 0;
    let expense = 0;
    let pendingPaymentOutTotalAcc = 0;
    let pendingApprovalCountAcc = 0;
    for (const t of data) {
      if (t.workflowStatus === 'pending_approval') {
        pendingApprovalCountAcc += 1;
        if (normalizeTransactionType(t.type) === 'payment_out') {
          pendingPaymentOutTotalAcc += t.amount;
        }
      }
      if (!isTransactionCountedInTotals(t)) continue;
      const normalized = normalizeTransactionType(t.type);
      if (normalized === 'payment_in') income += t.amount;
      else expense += t.amount;
    }
    return {
      totals: { income, expense, balance: income - expense } satisfies TransactionTotals,
      pendingPaymentOutTotal: pendingPaymentOutTotalAcc,
      pendingApprovalCount: pendingApprovalCountAcc,
    };
  }, [data]);

  return { data, loading, totals, pendingPaymentOutTotal, pendingApprovalCount, scope };
}
