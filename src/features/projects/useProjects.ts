/**
 * Live subscription to all projects the current user can access, scoped
 * to their primary organization.
 *
 * Visibility rules (mirrors the role matrix):
 *   - Super Admin and the org owner: see every project in the org.
 *   - Client role: only projects with their uid in `clientUids`.
 *   - Everyone else (admin / accountant / manager / supervisor /
 *     siteEngineer / viewer): only projects with their uid in
 *     `memberIds`. Admin and Accountant default to "all checked" when
 *     assigned via the team picker, so they still see every project
 *     unless an admin narrows them later.
 *
 * Sorted client-side by createdAt (desc) so docs with a pending
 * serverTimestamp (createdAt === null until the server round-trip
 * completes) still appear in the list instead of being excluded by an
 * orderBy on a null field.
 */
import { useEffect, useState } from 'react';

import { useAuth } from '@/src/features/auth/useAuth';
import { db } from '@/src/lib/firebase';
import { subscribeWithRetry } from '@/src/lib/subscribeWithRetry';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';

import type { Project } from './types';

export type UseProjectsResult = {
  data: Project[];
  loading: boolean;
};

export function useProjects(): UseProjectsResult {
  const { user } = useAuth();
  const { data: userDoc, loading: userLoading } = useCurrentUserDoc();
  const { data: org, loading: orgLoading } = useCurrentOrganization();
  const orgId = userDoc?.primaryOrgId ?? null;

  const [data, setData] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading || orgLoading) {
      setLoading(true);
      return;
    }
    if (!orgId || !user) {
      setData([]);
      setLoading(false);
      return;
    }

    // Resolve role with the same backfill `usePermissions` uses so
    // legacy orgs (no `roles` map) keep working.
    const role =
      org?.roles?.[user.uid] ??
      (user.uid === org?.ownerId
        ? 'superAdmin'
        : org?.memberIds?.includes(user.uid)
          ? 'admin'
          : null);

    setLoading(true);
    const base = db.collection('projects').where('orgId', '==', orgId);
    const query =
      // Super Admin and org owner always see everything.
      role === 'superAdmin' || user.uid === org?.ownerId
        ? base
        : role === 'client'
          ? base.where('clientUids', 'array-contains', user.uid)
          : base.where('memberIds', 'array-contains', user.uid);

    return subscribeWithRetry(
      query,
      (snap) => {
        const rows: Project[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Project, 'id'>),
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
        console.warn('[useProjects] snapshot error:', err);
        setLoading(false);
      },
      { tag: '[useProjects]' },
    );
  }, [orgId, userLoading, orgLoading, user, org]);

  return { data, loading };
}
