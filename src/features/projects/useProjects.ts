/**
 * Live subscription to all projects the current user can access, scoped
 * to their primary organization. Sorted client-side by createdAt (desc)
 * so that docs with a pending serverTimestamp (createdAt === null until
 * the server round-trip completes) still appear in the list instead of
 * being excluded by an orderBy on a null field.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';

import type { Project } from './types';

export type UseProjectsResult = {
  data: Project[];
  loading: boolean;
};

export function useProjects(): UseProjectsResult {
  const { data: userDoc, loading: userLoading } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? null;

  const [data, setData] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) {
      setLoading(true);
      return;
    }
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('projects')
      .where('orgId', '==', orgId)
      .onSnapshot(
        (snap) => {
          const rows: Project[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Project, 'id'>),
          }));
          // Newest first; docs with a still-pending serverTimestamp
          // (createdAt === null locally) sort to the top.
          rows.sort((a, b) => {
            const at = a.createdAt ? a.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
            const bt = b.createdAt ? b.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
            return bt - at;
          });
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useProjects] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId, userLoading]);

  return { data, loading };
}
