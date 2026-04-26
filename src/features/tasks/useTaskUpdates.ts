import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { TaskUpdate } from './types';

export type UseTaskUpdatesResult = {
  data: TaskUpdate[];
  loading: boolean;
};

export function useTaskUpdates(taskId: string | undefined): UseTaskUpdatesResult {
  const [data, setData] = useState<TaskUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!taskId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('tasks')
      .doc(taskId)
      .collection('updates')
      .onSnapshot(
        (snap) => {
          const rows: TaskUpdate[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<TaskUpdate, 'id'>),
          }));
          // Newest first — feed reads top-down chronologically backwards.
          rows.sort((a, b) => {
            const at = a.createdAt ? a.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
            const bt = b.createdAt ? b.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
            return bt - at;
          });
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useTaskUpdates] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [taskId]);

  return { data, loading };
}
