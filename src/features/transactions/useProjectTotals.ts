/**
 * Live subscription to org-wide transactions, grouped by projectId
 * so dashboards (Overview, Projects list, Notifications) can render
 * tiny per-project income/expense/balance ribbons without firing N
 * separate Firestore queries.
 *
 * Role-aware query strategy. The Firestore rules now scope
 * `transactions` reads by project membership AND role; an unscoped
 * `where('orgId', '==', X)` query would fail for non-admin users
 * (Firestore's "if any returned doc is rule-rejected, the whole
 * query fails" semantic). The hook chooses a query shape that's
 * guaranteed to return only docs the caller can read:
 *
 *   - Super Admin / Admin → `where('orgId', '==', orgId)`. Rules
 *     let them read everything in their studio.
 *   - Manager / Accountant / Viewer → fetch the user's accessible
 *     projects from `useProjects` (already filtered by
 *     `memberIds.array-contains`), then run
 *     `where('orgId', '==', orgId).where('projectId', 'in', ids)`.
 *     Firestore's `in` operator caps at 30 ids — for users with
 *     fewer memberships (the common case) this is one query;
 *     more would need chunking which is currently out of scope.
 *   - Site Engineer / Supervisor → `where('orgId', '==', orgId)
 *     .where('createdBy', '==', uid)`. Matches the `useTransactions`
 *     own-scope and the rules' per-creator gate for submit-only roles.
 *   - Client → returns an empty result set without querying. Clients
 *     never see the studio ledger.
 *
 * Same return shape across all strategies; consumers don't change.
 */
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/src/lib/firebase';
import { subscribeWithRetry } from '@/src/lib/subscribeWithRetry';
import { useAuth } from '@/src/features/auth/useAuth';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProjects } from '@/src/features/projects/useProjects';

import type { Transaction } from './types';
import { isTransactionCountedInTotals, normalizeTransactionType } from './types';

export type ProjectTotals = {
  income: number;
  expense: number;
  balance: number;
};

export type UseProjectTotalsResult = {
  totalsByProject: Map<string, ProjectTotals>;
  /** All org transactions the caller is allowed to see (already
   *  scoped by role + project membership). */
  transactions: Transaction[];
  loading: boolean;
};

/** Firestore `in` query operator cap. Users with more accessible
 *  projects than this hit a soft limit; chunk + merge can land in a
 *  follow-up if it ever becomes a real problem. */
const FIRESTORE_IN_LIMIT = 30;

export function useProjectTotals(orgId: string | undefined): UseProjectTotalsResult {
  const { user } = useAuth();
  const { role, loading: permLoading } = usePermissions();
  const { data: myProjects, loading: projectsLoading } = useProjects();
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable comma-joined string of accessible project ids — keeps
  // the effect dep array primitive so we don't re-subscribe every
  // render when `myProjects` is a new array reference with the
  // same contents.
  const projectIdsKey = useMemo(
    () => myProjects.map((p) => p.id).sort().join(','),
    [myProjects],
  );

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    // Wait for role + projects to settle before issuing a query —
    // otherwise we briefly fire the wrong-shape query for a user
    // mid-org-switch / sign-in.
    if (permLoading || projectsLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setData([]);
      setLoading(false);
      return;
    }

    // Never issue org-wide or scoped transaction queries until we know
    // the viewer's role — `role === null` used to fall through to the
    // "full org" branch and caused permission-denied storms.
    if (role === null) {
      setData([]);
      setLoading(false);
      return;
    }

    // Client never sees the studio ledger. Return empty without
    // touching Firestore.
    if (role === 'client') {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let q = db.collection('transactions').where('orgId', '==', orgId);

    // Submit-only roles: own submissions only.
    if (role === 'siteEngineer' || role === 'supervisor') {
      q = q.where('createdBy', '==', user.uid);
    } else if (role === 'manager' || role === 'accountant' || role === 'viewer') {
      // Approver/reader roles that DON'T have studio-wide visibility:
      // restrict to the user's accessible projects so the query
      // doesn't try to read transactions from projects they're not
      // in (which would fail under the new rules).
      const ids = myProjects.map((p) => p.id).slice(0, FIRESTORE_IN_LIMIT);
      if (ids.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }
      q = q.where('projectId', 'in', ids);
    }
    // SA / Admin / unknown role: query the full org. Rules let
    // admins read all; unknown roles return permission-denied
    // gracefully via the snapshot error handler below.

    return subscribeWithRetry(
      q,
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
        setData([]);
        setLoading(false);
      },
      { tag: '[useProjectTotals]' },
    );
  }, [orgId, role, permLoading, projectsLoading, user, projectIdsKey, myProjects]);

  const totalsByProject = useMemo(() => {
    const m = new Map<string, ProjectTotals>();
    for (const t of data) {
      if (!t.projectId) continue;
      if (!isTransactionCountedInTotals(t)) continue;
      const existing = m.get(t.projectId) ?? { income: 0, expense: 0, balance: 0 };
      const kind = normalizeTransactionType(t.type);
      if (kind === 'payment_in') existing.income += t.amount;
      else existing.expense += t.amount;
      existing.balance = existing.income - existing.expense;
      m.set(t.projectId, existing);
    }
    return m;
  }, [data]);

  return { totalsByProject, transactions: data, loading };
}
