import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Lead } from './types';

export type UseLeadsResult = {
  data: Lead[];
  loading: boolean;
};

function leadSortKey(lead: Lead): number {
  const ts = lead.createdAt;
  if (!ts) return 0;
  return ts.toMillis();
}

export function useLeads(orgId: string | undefined): UseLeadsResult {
  const [data, setData] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('leads')
      .where('orgId', '==', orgId)
      .onSnapshot(
        (snap) => {
          const rows: Lead[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Lead, 'id'>),
          }));
          rows.sort((a, b) => leadSortKey(b) - leadSortKey(a));
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useLeads] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId]);

  return { data, loading };
}

export function useLead(leadId: string | undefined): {
  data: Lead | null;
  loading: boolean;
} {
  const [data, setData] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('leads')
      .doc(leadId)
      .onSnapshot(
        (snap) => {
          if (!snap.exists) {
            setData(null);
            setLoading(false);
            return;
          }
          setData({ id: snap.id, ...(snap.data() as Omit<Lead, 'id'>) });
          setLoading(false);
        },
        (err) => {
          console.warn('[useLead] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [leadId]);

  return { data, loading };
}
