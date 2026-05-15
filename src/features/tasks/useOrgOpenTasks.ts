/**
 * `useOrgOpenTasks` — full list of non-completed tasks across the active
 * org, scoped by role the same way as `useOrgOpenTaskCount`:
 *
 *   - `superAdmin` / `admin` → every task in the org
 *   - `manager` / `accountant` / `viewer` / `siteEngineer` / `supervisor`
 *     → tasks restricted to the projects they have access to (uses the
 *     `projectId in [...]` clause; capped at Firestore's 30-id limit)
 *   - `client` → empty list
 *
 * Returns the actual `Task` rows (sorted by endDate ascending — most
 * urgent first, undated bucket pushed to the end). The org-wide tasks
 * inbox screen (`app/(app)/tasks.tsx`) consumes this directly so the
 * one home-tab summary count cell and the inbox screen agree on
 * exactly the same row set.
 */
import { useEffect, useMemo, useState } from 'react';

import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';
import { db } from '@/src/lib/firebase';
import { subscribeWithRetry } from '@/src/lib/subscribeWithRetry';
import { useAuth } from '@/src/features/auth/useAuth';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProjects } from '@/src/features/projects/useProjects';

import type { Task } from './types';

const FIRESTORE_IN_LIMIT = 30;

export type UseOrgOpenTasksResult = {
  /** Open (not-completed) tasks. Sorted by endDate ascending; undated
   *  tasks are bucketed last so the most-urgent ones float up. */
  tasks: Task[];
  loading: boolean;
};

export function useOrgOpenTasks(orgId: string | undefined): UseOrgOpenTasksResult {
  const { user } = useAuth();
  const { role, loading: permLoading } = usePermissions();
  const { data: myProjects, loading: projectsLoading } = useProjects();
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const projectIdsKey = useMemo(
    () => myProjects.map((p) => p.id).sort().join(','),
    [myProjects],
  );

  useEffect(() => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (permLoading || projectsLoading) {
      setLoading(true);
      return;
    }
    if (!user || role === null || role === 'client') {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let q = db
      .collection('tasks')
      .where('orgId', '==', orgId) as FirebaseFirestoreTypes.Query;

    if (
      role === 'siteEngineer' ||
      role === 'supervisor' ||
      role === 'manager' ||
      role === 'accountant' ||
      role === 'viewer'
    ) {
      const ids = myProjects.map((p) => p.id).slice(0, FIRESTORE_IN_LIMIT);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      q = q.where('projectId', 'in', ids);
    }

    return subscribeWithRetry(
      q,
      (snap) => {
        const list: Task[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Task, 'id'>),
        }));
        setRows(list);
        setLoading(false);
      },
      (err) => {
        console.warn('[useOrgOpenTasks] snapshot error:', err);
        setRows([]);
        setLoading(false);
      },
      { tag: '[useOrgOpenTasks]' },
    );
  }, [orgId, role, permLoading, projectsLoading, user, projectIdsKey, myProjects]);

  // Filter to non-completed + sort by endDate ascending (undated last).
  const tasks = useMemo(() => {
    const open = rows.filter((r) => r.status !== 'completed');
    open.sort((a, b) => {
      const ae = a.endDate?.toMillis?.() ?? Number.POSITIVE_INFINITY;
      const be = b.endDate?.toMillis?.() ?? Number.POSITIVE_INFINITY;
      return ae - be;
    });
    return open;
  }, [rows]);

  return { tasks, loading };
}
