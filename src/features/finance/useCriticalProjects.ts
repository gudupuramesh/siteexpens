/**
 * Critical-projects detection — surfaces active projects that
 * need attention on the Overview tab.
 *
 * A project is critical when ANY of:
 *  - **overspend** (DUE)  expense > income AND expense > 0
 *  - **late**     (LATE)  endDate < today AND status !== completed
 *  - **stale**    (STALE) no transaction in the last 30 days
 *
 * Returns rows sorted by:
 *   1. number of triggered reasons (desc) — multi-flagged first
 *   2. magnitude of negative balance (more-negative first)
 *
 * The hook is pure — no extra Firestore reads. It reads the
 * already-streamed `useProjects` + `useProjectTotals` data.
 */
import { useMemo } from 'react';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import {
  type Project,
  type ProjectStatus,
} from '@/src/features/projects/types';
import { useProjects } from '@/src/features/projects/useProjects';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';

export type CriticalReason = 'overspend' | 'late' | 'stale';

export type CriticalProjectRow = {
  project: Project;
  reasons: CriticalReason[];
  /** Convenience — passed through from useProjectTotals so the
   *  banner doesn't have to re-look it up. */
  totals: { income: number; expense: number; balance: number };
};

const STALE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Statuses for which the critical check applies. We only flag
 *  active / on-hold projects — completed and archived are by
 *  definition done and shouldn't generate noise. */
const ACTIVE_STATUSES: ProjectStatus[] = ['active', 'on_hold'];

export function useCriticalProjects(): {
  rows: CriticalProjectRow[];
  loading: boolean;
} {
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;

  const { data: projects, loading: pLoading } = useProjects();
  const { totalsByProject, transactions, loading: tLoading } = useProjectTotals(orgId);

  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const staleCutoff = today.getTime() - STALE_DAYS * MS_PER_DAY;

    // Build a per-project last-activity timestamp from the
    // already-streamed transactions. Single linear pass over
    // transactions; cheaper than per-project queries.
    const lastTxnByProject = new Map<string, number>();
    for (const t of transactions) {
      const d = t.date?.toMillis?.() ?? t.createdAt?.toMillis?.() ?? 0;
      const prev = lastTxnByProject.get(t.projectId) ?? 0;
      if (d > prev) lastTxnByProject.set(t.projectId, d);
    }

    const rows: CriticalProjectRow[] = [];
    for (const p of projects) {
      if (!ACTIVE_STATUSES.includes(p.status)) continue;
      const totals = totalsByProject.get(p.id) ?? {
        income: 0,
        expense: 0,
        balance: 0,
      };

      const reasons: CriticalReason[] = [];
      if (totals.expense > totals.income && totals.expense > 0) {
        reasons.push('overspend');
      }
      const endMs = p.endDate?.toMillis?.() ?? null;
      if (endMs !== null && endMs < today.getTime()) {
        reasons.push('late');
      }
      const lastTxn = lastTxnByProject.get(p.id) ?? 0;
      // Treat "never had a txn" as stale only if the project was
      // created > STALE_DAYS ago — otherwise a brand-new project
      // would always show as stale on day one.
      const createdMs = p.createdAt?.toMillis?.() ?? today.getTime();
      const baseline = lastTxn || createdMs;
      if (baseline < staleCutoff) {
        reasons.push('stale');
      }

      if (reasons.length > 0) {
        rows.push({ project: p, reasons, totals });
      }
    }

    rows.sort((a, b) => {
      if (b.reasons.length !== a.reasons.length)
        return b.reasons.length - a.reasons.length;
      return a.totals.balance - b.totals.balance;
    });

    return { rows, loading: pLoading || tLoading };
  }, [projects, totalsByProject, transactions, pLoading, tLoading]);
}
