import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import { dprDocId } from './dpr';
import type { DailyProgressReport } from './types';

export type UseDprResult = {
  data: DailyProgressReport | null;
  loading: boolean;
};

export function useDpr(
  projectId: string | undefined,
  date: string | undefined,
): UseDprResult {
  const [data, setData] = useState<DailyProgressReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !date) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('dpr')
      .doc(dprDocId(projectId, date))
      .onSnapshot(
        (snap) => {
          if (!snap.exists) {
            setData(null);
            setLoading(false);
            return;
          }
          setData({
            id: snap.id,
            ...(snap.data() as Omit<DailyProgressReport, 'id'>),
          });
          setLoading(false);
        },
        (err) => {
          console.warn('[useDpr] snapshot error:', err);
          setData(null);
          setLoading(false);
        },
      );
    return unsub;
  }, [projectId, date]);

  return { data, loading };
}
