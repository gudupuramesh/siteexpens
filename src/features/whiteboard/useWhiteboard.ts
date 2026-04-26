/**
 * Live subscription to whiteboards for a project. Sorted with the
 * most-recently-updated first.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Whiteboard } from './types';

export type UseWhiteboardsResult = {
  data: Whiteboard[];
  loading: boolean;
};

export function useWhiteboards(
  projectId: string | undefined,
  orgId: string | undefined,
): UseWhiteboardsResult {
  const [data, setData] = useState<Whiteboard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Both filters are required: Firestore rules check `resource.data.orgId`
    // and list queries must constrain on the same field, so we need orgId
    // in the query (not just projectId) for the read to be allowed.
    if (!projectId || !orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('whiteboards')
      .where('orgId', '==', orgId)
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const rows: Whiteboard[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Whiteboard, 'id'>),
          }));
          rows.sort((a, b) => {
            const at = a.updatedAt ? a.updatedAt.toMillis() : Number.MAX_SAFE_INTEGER;
            const bt = b.updatedAt ? b.updatedAt.toMillis() : Number.MAX_SAFE_INTEGER;
            return bt - at;
          });
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useWhiteboards] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
    // orgId belongs in the deps: it loads async from userDoc, and without
    // it the effect would re-bind only when projectId changes — leaving
    // the snapshot listener attached with a stale orgId (or never
    // subscribing if orgId was undefined on first render).
  }, [projectId, orgId]);

  return { data, loading };
}
