/**
 * Per-task listeners on `tasks/{id}/updates` for updates whose createdAt
 * falls in [dayStart, dayEnd). Merged into one list for Site tab / daily views.
 * Avoids collectionGroup queries (no index migration).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { db, firestore } from '@/src/lib/firebase';

import type { TaskUpdate } from './types';

export type ProjectTaskUpdateRow = TaskUpdate & {
  taskId: string;
  taskTitle: string;
};

function parseLocalDayBounds(dateKey: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const start = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const end = new Date(y, mo - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}

export type UseProjectTaskUpdatesForDateResult = {
  data: ProjectTaskUpdateRow[];
  loading: boolean;
};

export function useProjectTaskUpdatesForDate(
  projectId: string | undefined,
  dateKey: string,
  tasks: { id: string; title: string }[],
  /** Bumping forces listener teardown/resubscribe (e.g. project screen focus). */
  refreshKey = 0,
): UseProjectTaskUpdatesForDateResult {
  const [data, setData] = useState<ProjectTaskUpdateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const taskIdsKey = useMemo(
    () =>
      [...tasks]
        .map((t) => t.id)
        .sort()
        .join(','),
    [tasks],
  );

  useEffect(() => {
    if (!projectId || !dateKey) {
      setData([]);
      setLoading(false);
      return;
    }

    const bounds = parseLocalDayBounds(dateKey);
    if (!bounds) {
      setData([]);
      setLoading(false);
      return;
    }

    const { start: dayStart, end: dayEnd } = bounds;
    const tsStart = firestore.Timestamp.fromDate(dayStart);
    const tsEnd = firestore.Timestamp.fromDate(dayEnd);

    const taskList = tasksRef.current;
    const taskCount = taskList.length;
    if (taskCount === 0) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const titleById = new Map(taskList.map((t) => [t.id, t.title]));
    const bucket = new Map<string, TaskUpdate[]>();
    const firstSeen = new Set<string>();

    const mergeAndPublish = () => {
      const flat: ProjectTaskUpdateRow[] = [];
      for (const [taskId, rows] of bucket) {
        const title = titleById.get(taskId) ?? 'Task';
        for (const r of rows) {
          flat.push({ ...r, taskId, taskTitle: title });
        }
      }
      flat.sort((a, b) => {
        const at = a.createdAt ? a.createdAt.toMillis() : 0;
        const bt = b.createdAt ? b.createdAt.toMillis() : 0;
        return bt - at;
      });
      setData(flat);
    };

    const unsubs = taskList.map((task) => {
      const q = db
        .collection('tasks')
        .doc(task.id)
        .collection('updates')
        .where('createdAt', '>=', tsStart)
        .where('createdAt', '<', tsEnd);

      return q.onSnapshot(
        (snap) => {
          const rows: TaskUpdate[] = snap.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<TaskUpdate, 'id'>),
          }));
          bucket.set(task.id, rows);
          if (!firstSeen.has(task.id)) {
            firstSeen.add(task.id);
            if (firstSeen.size >= taskCount) {
              setLoading(false);
            }
          }
          mergeAndPublish();
        },
        (err) => {
          console.warn('[useProjectTaskUpdatesForDate] snapshot error:', task.id, err);
          bucket.set(task.id, []);
          if (!firstSeen.has(task.id)) {
            firstSeen.add(task.id);
            if (firstSeen.size >= taskCount) {
              setLoading(false);
            }
          }
          mergeAndPublish();
        },
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [projectId, dateKey, taskIdsKey, refreshKey]);

  return { data, loading };
}
