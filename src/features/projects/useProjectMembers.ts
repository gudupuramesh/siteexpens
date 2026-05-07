/**
 * Fetch project-linked app users: `project.memberIds` (staff) plus
 * `project.clientUids` (studio clients scoped to this project). Resolves each uid
 * against `organizations/{orgId}/memberPublic/{uid}` (rules-safe projection
 * containing displayName / photoURL / phoneNumber / roleKey). Missing docs
 * fall back to placeholders — never reads peer `users/{uid}` from client.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';
import type { RoleKey } from '@/src/features/org/types';

export type ProjectMember = {
  uid: string;
  displayName: string;
  photoURL: string | null;
  phoneNumber: string | null;
  /**
   * Role of this member in the org. Sourced from
   * `memberPublic.roleKey` (kept in sync server-side by the
   * `onOrganizationWriteMemberPublic` trigger). Null when the
   * memberPublic doc doesn't yet exist (race window after invite,
   * before the trigger runs) — UI should render a sensible
   * fallback.
   */
  role: RoleKey | null;
  /** True when uid is on this project via `clientUids` only (not `memberIds`). */
  isProjectClient: boolean;
};

const VALID_ROLES = new Set<RoleKey>([
  'superAdmin',
  'admin',
  'manager',
  'accountant',
  'siteEngineer',
  'supervisor',
  'viewer',
  'client',
]);

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
          const data = snap.data() as
            | { memberIds?: string[]; clientUids?: string[]; orgId?: string }
            | undefined;
          const memberIds = data?.memberIds ?? [];
          const clientUids = data?.clientUids ?? [];
          const orgId = typeof data?.orgId === 'string' ? data.orgId : '';
          const staffSet = new Set(memberIds);
          const uidSet = new Set<string>([...memberIds, ...clientUids]);
          const uids = [...uidSet];

          if (uids.length === 0) {
            setMembers([]);
            setLoading(false);
            return;
          }

          try {
            let resolved: ProjectMember[];
            if (!orgId) {
              resolved = uids.map((uid) => ({
                uid,
                displayName: 'Member',
                photoURL: null,
                phoneNumber: null,
                role: null,
                isProjectClient: clientUids.includes(uid) && !staffSet.has(uid),
              }));
            } else {
              const docs = await Promise.all(
                uids.map((uid) =>
                  db.collection('organizations').doc(orgId).collection('memberPublic').doc(uid).get(),
                ),
              );
              if (cancelled) return;
              resolved = docs.map((d, i) => {
                const uid = uids[i];
                const u = d.exists
                  ? (d.data() as {
                      displayName?: string;
                      photoURL?: string | null;
                      phoneNumber?: string;
                      roleKey?: string;
                    })
                  : undefined;
                const inStaff = staffSet.has(uid);
                const inClientList = clientUids.includes(uid);
                // Validate the roleKey against the known set so an
                // unexpected value (legacy / typo) doesn't surface
                // as a bogus label downstream.
                const role: RoleKey | null =
                  typeof u?.roleKey === 'string' && VALID_ROLES.has(u.roleKey as RoleKey)
                    ? (u.roleKey as RoleKey)
                    : null;
                return {
                  uid,
                  displayName:
                    typeof u?.displayName === 'string' && u.displayName.trim() ? u.displayName : 'Member',
                  photoURL: u?.photoURL ?? null,
                  phoneNumber: typeof u?.phoneNumber === 'string' ? u.phoneNumber : null,
                  role,
                  isProjectClient: inClientList && !inStaff,
                };
              });
            }
            resolved.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
            setMembers(resolved);
            setLoading(false);
          } catch (err) {
            console.warn('[useProjectMembers] memberPublic fetch error:', err);
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
