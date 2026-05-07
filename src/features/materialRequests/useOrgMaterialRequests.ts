/**
 * Org-wide material requests (e.g. pending approvals on the Overview tab).
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { MaterialRequest, MaterialRequestStatus } from './types';

export type UseOrgMaterialRequestsResult = {
  data: MaterialRequest[];
  loading: boolean;
};

export function useOrgMaterialRequests(
  orgId: string | null | undefined,
  status?: MaterialRequestStatus,
): UseOrgMaterialRequestsResult {
  const [data, setData] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = db.collection('materialRequests').where('orgId', '==', orgId);
    if (status) {
      q = q.where('status', '==', status);
    }
    const unsub = q.onSnapshot(
      (snap) => {
        const rows: MaterialRequest[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MaterialRequest, 'id'>),
        }));
        rows.sort((a, b) => {
          const at = a.createdAt ? a.createdAt.toMillis() : 0;
          const bt = b.createdAt ? b.createdAt.toMillis() : 0;
          return bt - at;
        });
        setData(rows);
        setLoading(false);
      },
      (err) => {
        console.warn('[useOrgMaterialRequests] snapshot error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [orgId, status]);

  return { data, loading };
}
