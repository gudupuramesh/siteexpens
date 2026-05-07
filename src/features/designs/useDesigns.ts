/**
 * Live subscriptions for the Files library.
 *
 *   - useDesigns(projectId, orgId) — list, sorted newest-first
 *   - useDesign(designId)          — one entry
 *
 * No more useDesignVersions — versions were removed from the model.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';
import type { Design } from './types';

export type UseDesignsResult = {
  data: Design[];
  loading: boolean;
};

export function useDesigns(
  projectId: string | undefined,
  orgId: string | undefined,
): UseDesignsResult {
  const [data, setData] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firestore rules check `resource.data.orgId`; list queries must
    // constrain on the same field for the rule to evaluate.
    if (!projectId || !orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('designs')
      .where('orgId', '==', orgId)
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const rows: Design[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Design, 'id'>),
          }));
          rows.sort((a, b) => {
            // Newest update first; designs without updatedAt sink.
            const at = a.updatedAt?.toMillis() ?? 0;
            const bt = b.updatedAt?.toMillis() ?? 0;
            return bt - at;
          });
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useDesigns] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [projectId, orgId]);

  return { data, loading };
}

// ── Single design ────────────────────────────────────────────────────

export type UseDesignResult = {
  data: Design | null;
  loading: boolean;
};

export function useDesign(designId: string | undefined): UseDesignResult {
  const [data, setData] = useState<Design | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!designId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('designs')
      .doc(designId)
      .onSnapshot(
        (snap) => {
          if (!snap.exists) setData(null);
          else setData({ id: snap.id, ...(snap.data() as Omit<Design, 'id'>) });
          setLoading(false);
        },
        (err) => {
          console.warn('[useDesign] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [designId]);

  return { data, loading };
}
