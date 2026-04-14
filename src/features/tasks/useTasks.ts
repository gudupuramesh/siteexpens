import { useEffect, useState } from 'react';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { db } from '@/src/lib/firebase';

import type { Task } from './types';

export type UseTasksResult = {
  data: Task[];
  loading: boolean;
};

export function useTasks(
  projectId: string | undefined,
  statusFilter?: string,
): UseTasksResult {
  const [data, setData] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let query = db
      .collection('tasks')
      .where('projectId', '==', projectId) as FirebaseFirestoreTypes.Query;

    if (statusFilter) {
      query = query.where('status', '==', statusFilter);
    }

    const unsub = query.onSnapshot(
      (snap) => {
        const rows: Task[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Task, 'id'>),
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
        console.warn('[useTasks] snapshot error:', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [projectId, statusFilter]);

  return { data, loading };
}
