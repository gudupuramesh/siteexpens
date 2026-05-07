/**
 * Live attendance for a given month, grouped by staffId.
 *
 * Returns a `Record<staffId, StaffAttendance[]>` so the
 * StaffSection / payroll preview can compute per-staff totals
 * without iterating the whole list every time. Loading state
 * is global (single onSnapshot), not per-staff.
 *
 * Why a single org-scoped query rather than per-staff:
 *   - A studio with 10 staff × 22 days/month = 220 docs/month.
 *   - One range query over `orgId + date` (composite index)
 *     scales linearly with the staff count, not multiplicatively
 *     with subscription churn.
 */
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { StaffAttendance } from './types';
import { dateKey } from './types';

export type UseStaffAttendanceResult = {
  byStaff: Record<string, StaffAttendance[]>;
  loading: boolean;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function useStaffAttendance(
  orgId: string | null | undefined,
  month: Date,
): UseStaffAttendanceResult {
  const [data, setData] = useState<StaffAttendance[]>([]);
  const [loading, setLoading] = useState(true);

  // Recompute the date keys only when the month bucket changes
  // (not on every render — `month` Date instances may differ
  // millisecond-by-millisecond between calls but resolve to the
  // same month).
  const [startKey, endKey] = useMemo(() => {
    return [dateKey(startOfMonth(month)), dateKey(endOfMonth(month))];
  }, [month]);

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('staffAttendance')
      .where('orgId', '==', orgId)
      .where('date', '>=', startKey)
      .where('date', '<=', endKey)
      .onSnapshot(
        (snap) => {
          const rows: StaffAttendance[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<StaffAttendance, 'id'>),
          }));
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useStaffAttendance] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId, startKey, endKey]);

  const byStaff = useMemo(() => {
    const m: Record<string, StaffAttendance[]> = {};
    for (const a of data) {
      (m[a.staffId] ??= []).push(a);
    }
    return m;
  }, [data]);

  return { byStaff, loading };
}
