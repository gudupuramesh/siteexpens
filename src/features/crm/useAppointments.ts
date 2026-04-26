import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Appointment } from './types';

export type UseAppointmentsFilters = {
  leadId?: string;
  from?: Date;
  to?: Date;
};

export function useAppointments(
  orgId: string | undefined,
  filters?: UseAppointmentsFilters,
): {
  data: Appointment[];
  loading: boolean;
} {
  const [data, setData] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const leadId = filters?.leadId;
  const from = filters?.from;
  const to = filters?.to;
  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('appointments')
      .where('orgId', '==', orgId)
      .onSnapshot(
        (snap) => {
          let rows: Appointment[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Appointment, 'id'>),
          }));

          if (leadId) {
            rows = rows.filter((a) => a.leadId === leadId);
          }

          if (from) {
            const startMs = from.getTime();
            rows = rows.filter((a) => {
              const t = a.scheduledAt;
              if (!t) return false;
              return t.toMillis() >= startMs;
            });
          }
          if (to) {
            const endMs = to.getTime();
            rows = rows.filter((a) => {
              const t = a.scheduledAt;
              if (!t) return false;
              return t.toMillis() <= endMs;
            });
          }

          rows.sort((a, b) => {
            const am = a.scheduledAt?.toMillis() ?? 0;
            const bm = b.scheduledAt?.toMillis() ?? 0;
            return am - bm;
          });

          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useAppointments] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId, leadId, from, to]);

  return { data, loading };
}

export function useAppointment(apptId: string | undefined): {
  data: Appointment | null;
  loading: boolean;
} {
  const [data, setData] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apptId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('appointments')
      .doc(apptId)
      .onSnapshot(
        (snap) => {
          if (!snap.exists) {
            setData(null);
            setLoading(false);
            return;
          }
          setData({ id: snap.id, ...(snap.data() as Omit<Appointment, 'id'>) });
          setLoading(false);
        },
        (err) => {
          console.warn('[useAppointment] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [apptId]);

  return { data, loading };
}
