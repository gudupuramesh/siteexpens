/**
 * Fetch project member user docs. Reads `project.memberIds` then resolves each
 * uid against `users/{uid}`. memberIds lists are tiny in Phase 1 so we skip
 * the `where(documentId, 'in', ...)` chunking and just read docs in parallel.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

export type ProjectMember = {
  uid: string;
  displayName: string;
  photoURL: string | null;
};

export type UseProjectMembersResult = {
  members: ProjectMember[];
  loading: boolean;
};

export function useProjectMembers(projectId: string | undefined): UseProjectMembersResult {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('projects')
      .doc(projectId)
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
            console.warn('[useProjectMembers] user fetch error:', err);
            setLoading(false);
          }
        },
        (err) => {
          console.warn('[useProjectMembers] project snapshot error:', err);
          setLoading(false);
        },
      );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [projectId]);

  return { members, loading };
}
