/**
 * Live subscription to a single project document.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Project } from './types';

export type UseProjectResult = {
  data: Project | null;
  loading: boolean;
  error: string | null;
};

export function useProject(projectId: string | undefined): UseProjectResult {
  const [data, setData] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const unsub = db
      .collection('projects')
      .doc(projectId)
      .onSnapshot(
        (snap) => {
          const existsField = (snap as unknown as { exists: boolean | (() => boolean) }).exists;
          const exists = typeof existsField === 'function' ? existsField() : existsField;
          const raw = snap.data();
          if (exists && raw) {
            setData({ id: snap.id, ...(raw as Omit<Project, 'id'>) });
          } else {
            setData(null);
          }
          setLoading(false);
        },
        (err) => {
          console.warn('[useProject] snapshot error:', err);
          setError((err as Error).message ?? 'Failed to load project');
          setLoading(false);
        },
      );
    return unsub;
  }, [projectId]);

  return { data, loading, error };
}
