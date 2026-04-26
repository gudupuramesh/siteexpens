import { useMemo } from 'react';
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';
import {
  DEFAULT_TASK_CATEGORIES,
  type TaskCategoryOption,
} from './types';
import type { TaskCategoryLibraryItem } from './taskCategories';

export type UseTaskCategoriesResult = {
  data: TaskCategoryOption[];
  loading: boolean;
};

export function useTaskCategories(orgId: string | undefined): UseTaskCategoriesResult {
  const [library, setLibrary] = useState<TaskCategoryLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setLibrary([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('taskCategoryLibrary')
      .where('orgId', '==', orgId)
      .onSnapshot(
        (snap) => {
          const rows: TaskCategoryLibraryItem[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<TaskCategoryLibraryItem, 'id'>),
          }));
          rows.sort((a, b) => a.label.localeCompare(b.label));
          setLibrary(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useTaskCategories] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId]);

  const data = useMemo(() => {
    const map = new Map<string, TaskCategoryOption>();
    for (const item of DEFAULT_TASK_CATEGORIES) map.set(item.key, item);
    for (const item of library) map.set(item.key, { key: item.key, label: item.label });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [library]);

  return { data, loading };
}
