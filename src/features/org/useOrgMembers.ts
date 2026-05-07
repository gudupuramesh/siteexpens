/**
 * Resolve org roster from `organizations/{orgId}/memberPublic` — the production,
 * rules-safe projection maintained by Cloud Functions (not peer `users/{uid}` reads).
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
    if (!orgId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('organizations')
      .doc(orgId)
      .collection('memberPublic')
      .onSnapshot(
        (snap) => {
          const resolved: ProjectMember[] = snap.docs.map((d) => {
            const u = d.data() as {
              displayName?: string;
              photoURL?: string | null;
              phoneNumber?: string;
              roleKey?: string;
            };
            return {
              uid: d.id,
              displayName: typeof u.displayName === 'string' && u.displayName.trim() ? u.displayName : 'Member',
              photoURL: u.photoURL ?? null,
              phoneNumber: typeof u.phoneNumber === 'string' ? u.phoneNumber : null,
              // `useOrgMembers` doesn't validate roleKey here (the rules-safe
              // memberPublic doc holds it but consumers of this hook only need
              // identity for member-pickers; project-scoped role logic lives
              // in `useProjectMembers`). Pass it through if present, else null.
              role: (typeof u.roleKey === 'string' ? u.roleKey : null) as ProjectMember['role'],
              isProjectClient: false,
            };
          });
          resolved.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
          setMembers(resolved);
          setLoading(false);
        },
        (err) => {
          console.warn('[useOrgMembers] memberPublic snapshot error:', err);
          setLoading(false);
        },
      );

    return unsub;
  }, [orgId]);

  return { members, loading };
}
