/**
 * Count of non-completed tasks visible to the current user, scoped the
 * same way as transaction dashboards: org-wide for SA/Admin, projectId
 * `in` for roles with bounded project visibility. Clients get 0.
 */
import { useEffect, useMemo, useState } from 'react';

import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';
import { db } from '@/src/lib/firebase';
import { subscribeWithRetry } from '@/src/lib/subscribeWithRetry';
import { useAuth } from '@/src/features/auth/useAuth';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProjects } from '@/src/features/projects/useProjects';

import type { TaskStatus } from './types';

const FIRESTORE_IN_LIMIT = 30;

type TaskRow = { status: TaskStatus };

export type UseOrgOpenTaskCountResult = {
  openCount: number;
  loading: boolean;
};

export function useOrgOpenTaskCount(orgId: string | undefined): UseOrgOpenTaskCountResult {
  const { user } = useAuth();
  const { role, loading: permLoading } = usePermissions();
  const { data: myProjects, loading: projectsLoading } = useProjects();
  const [rows, setRows] = useState<TaskRow[]>([]);
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
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (role === null) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (role === 'client') {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let q = db.collection('tasks').where('orgId', '==', orgId) as FirebaseFirestoreTypes.Query;

    if (
      role === 'siteEngineer'
      || role === 'supervisor'
      || role === 'manager'
      || role === 'accountant'
      || role === 'viewer'
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
        const list: TaskRow[] = snap.docs.map((d) => {
          const data = d.data() as { status?: TaskStatus };
          return { status: data.status ?? 'not_started' };
        });
        setRows(list);
        setLoading(false);
      },
      (err) => {
        console.warn('[useOrgOpenTaskCount] snapshot error:', err);
        setRows([]);
        setLoading(false);
      },
      { tag: '[useOrgOpenTaskCount]' },
    );
  }, [orgId, role, permLoading, projectsLoading, user, projectIdsKey, myProjects]);

  const openCount = useMemo(
    () => rows.filter((r) => r.status !== 'completed').length,
    [rows],
  );

  return { openCount, loading };
}
