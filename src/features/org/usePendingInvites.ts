/**
 * Live subscription to `organizations/{orgId}/pendingInvites` — the
 * org-scoped mirror of phone-keyed pending invites. Used by the Team
 * and Roles screen to surface invitees who haven't signed in yet.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { RoleKey } from './types';

export type PendingInvite = {
  /** E.164 phone number — also the document id. */
  phoneNumber: string;
  role: RoleKey;
  displayName: string | null;
  /** Project ids this invitee will be added to on first sign-in. */
  projectIds: string[];
  /** Legacy single-project field (still read for back-compat). */
  projectId: string | null;
  invitedBy: string | null;
  invitedAt: Date | null;
};

export function usePendingInvites(orgId: string | null | undefined): {
  data: PendingInvite[];
  loading: boolean;
} {
  const [data, setData] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('organizations')
      .doc(orgId)
      .collection('pendingInvites')
      .onSnapshot(
        (snap) => {
          const out: PendingInvite[] = [];
          snap.forEach((doc) => {
            const v = doc.data() as Record<string, unknown>;
            const legacyProjectId = typeof v.projectId === 'string' ? v.projectId : null;
            const projectIds = Array.isArray(v.projectIds)
              ? (v.projectIds.filter((p) => typeof p === 'string') as string[])
              : legacyProjectId
                ? [legacyProjectId]
                : [];
            out.push({
              phoneNumber: (v.phoneNumber as string) ?? doc.id,
              role: v.role as RoleKey,
              displayName:
                typeof v.displayName === 'string' && v.displayName ? v.displayName : null,
              projectIds,
              projectId: legacyProjectId,
              invitedBy: typeof v.invitedBy === 'string' ? v.invitedBy : null,
              invitedAt:
                v.invitedAt && typeof (v.invitedAt as { toDate?: () => Date }).toDate === 'function'
                  ? (v.invitedAt as { toDate: () => Date }).toDate()
                  : null,
            });
          });
          setData(out);
          setLoading(false);
        },
        (err) => {
          console.warn('[usePendingInvites] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId]);

  return { data, loading };
}
