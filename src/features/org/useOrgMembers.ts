/**
 * Resolve org.memberIds to user display docs (same shape as useProjectMembers).
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { ProjectMember } from '@/src/features/projects/useProjectMembers';

export type UseOrgMembersResult = {
  members: ProjectMember[];
  loading: boolean;
};

export function useOrgMembers(orgId: string | undefined): UseOrgMembersResult {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('organizations')
      .doc(orgId)
      .onSnapshot(
        async (snap) => {
          if (cancelled) return;
          const data = snap.data() as { memberIds?: string[] } | undefined;
          const memberIds = data?.memberIds ?? [];
          if (memberIds.length === 0) {
            setMembers([]);
            setLoading(false);
            return;
          }
          try {
            const docs = await Promise.all(
              memberIds.map((uid) => db.collection('users').doc(uid).get()),
            );
            if (cancelled) return;
            const resolved: ProjectMember[] = docs.map((d, i) => {
              const u = d.data() as { displayName?: string; photoURL?: string | null } | undefined;
              return {
                uid: memberIds[i],
                displayName: u?.displayName ?? 'Member',
                photoURL: u?.photoURL ?? null,
              };
            });
            resolved.sort((a, b) => a.displayName.localeCompare(b.displayName));
            setMembers(resolved);
            setLoading(false);
          } catch (err) {
            console.warn('[useOrgMembers] user fetch error:', err);
            setLoading(false);
          }
        },
        (err) => {
          console.warn('[useOrgMembers] org snapshot error:', err);
          setLoading(false);
        },
      );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [orgId]);

  return { members, loading };
}
