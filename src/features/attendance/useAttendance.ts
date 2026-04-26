/**
 * Live subscription to attendance records for a project on a given date.
 */
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { AttendanceRecord } from './types';

export type AttendanceSummary = {
  present: number;
  absent: number;
  halfDay: number;
  total: number;
};

export type UseAttendanceResult = {
  data: AttendanceRecord[];
  loading: boolean;
  summary: AttendanceSummary;
};

export function useAttendance(
  projectId: string | undefined,
  dateString: string,
  orgId: string | undefined,
): UseAttendanceResult {
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // orgId is required: Firestore rules check `resource.data.orgId` and
    // list queries must constrain on the same field for the read to be
    // allowed. Without orgId in the where clause, the rule rejects the
    // entire snapshot listener with permission-denied.
    if (!projectId || !dateString || !orgId) {
      setData([]);
      setLoading(false);
      return;
    }

    // Reset day records immediately on date change so we don't flash the
    // previous date's status pills before the new snapshot resolves. The
    // roster keeps the row list stable; only the per-day overlay clears.
    setData([]);
    setLoading(true);
    const unsub = db
      .collection('attendance')
      .where('orgId', '==', orgId)
      .where('projectId', '==', projectId)
      .where('date', '==', dateString)
      .onSnapshot(
        (snap) => {
          const rows: AttendanceRecord[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AttendanceRecord, 'id'>),
          }));
          rows.sort((a, b) => a.labourName.localeCompare(b.labourName));
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useAttendance] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [projectId, dateString, orgId]);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let halfDay = 0;
    for (const r of data) {
      if (r.status === 'present') present++;
      else if (r.status === 'absent') absent++;
      else if (r.status === 'half_day') halfDay++;
    }
    return { present, absent, halfDay, total: data.length };
  }, [data]);

  return { data, loading, summary };
}
