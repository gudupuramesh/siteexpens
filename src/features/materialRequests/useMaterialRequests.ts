/**
 * Real-time subscription to material requests for a project.
 * Optionally filter by status.
 */
import { useEffect, useState } from 'react';
import { db } from '@/src/lib/firebase';
import type { MaterialRequest, MaterialRequestStatus } from './types';

export type UseMaterialRequestsResult = {
  data: MaterialRequest[];
  loading: boolean;
};

export function useMaterialRequests(
  projectId: string | undefined,
  status?: MaterialRequestStatus,
  /** Bumping this number forces the snapshot listener to drop and
   *  resubscribe — wire to `useFirestoreRefresh().refreshKey`. */
  refreshKey = 0,
): UseMaterialRequestsResult {
  const [data, setData] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = db
      .collection('materialRequests')
      .where('projectId', '==', projectId) as FirebaseFirestoreTypes.Query;

    if (status) {
      query = query.where('status', '==', status);
    }

    const unsub = query.onSnapshot(
      (snap) => {
        const rows: MaterialRequest[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MaterialRequest, 'id'>),
        }));
        rows.sort((a, b) => {
          const at = a.createdAt ? a.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
          const bt = b.createdAt ? b.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
          return bt - at;
        });
        setData(rows);
        setLoading(false);
      },
      (err) => {
        console.warn('[useMaterialRequests] snapshot error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [projectId, status, refreshKey]);

  return { data, loading };
}

// Need this import for the query type
import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';
