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
): UseAttendanceResult {
  const [data, setData] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !dateString) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('attendance')
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
  }, [projectId, dateString]);

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
