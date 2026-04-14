/**
 * Real-time subscription to a single material request document.
 */
import { useEffect, useState } from 'react';
import { db } from '@/src/lib/firebase';
import type { MaterialRequest } from './types';

export type UseMaterialRequestResult = {
  data: MaterialRequest | null;
  loading: boolean;
};

export function useMaterialRequest(
  requestId: string | undefined,
): UseMaterialRequestResult {
  const [data, setData] = useState<MaterialRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!requestId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('materialRequests')
      .doc(requestId)
      .onSnapshot(
        (snap) => {
          const raw = snap.data();
          if (raw) {
            setData({ id: snap.id, ...(raw as Omit<MaterialRequest, 'id'>) });
          } else {
            setData(null);
          }
          setLoading(false);
        },
        (err) => {
          console.warn('[useMaterialRequest] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [requestId]);

  return { data, loading };
}
