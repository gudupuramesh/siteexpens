/**
 * Parties that are already associated with a project. Parties are org-scoped
 * with no direct project link, so we derive membership by unioning party IDs
 * referenced across the project's transactions, attendance records, and tasks.
 *
 * Subscribes to all three source collections + the org's parties, then filters
 * client-side. Keeps a single source of truth (useParties) for party docs while
 * letting callers see only parties that actually touch this project.
 */
import { useEffect, useMemo, useState } from 'react';

import { db } from '@/src/lib/firebase';

import { useParties } from './useParties';
import type { Party } from './types';

export type UseProjectPartiesResult = {
  parties: Party[];
  loading: boolean;
};

export function useProjectParties(
  orgId: string | undefined,
  projectId: string | undefined,
): UseProjectPartiesResult {
  const { data: allParties, loading: partiesLoading } = useParties(orgId);

  const [txnPartyIds, setTxnPartyIds] = useState<string[]>([]);
  const [attLabourIds, setAttLabourIds] = useState<string[]>([]);
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<string[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setTxnPartyIds([]);
      setAttLabourIds([]);
      setTaskAssigneeIds([]);
      setSourcesLoading(false);
      return;
    }

    setSourcesLoading(true);

    const unsubTxns = db
      .collection('transactions')
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const ids = new Set<string>();
          snap.docs.forEach((d) => {
            const pid = (d.data() as { partyId?: string }).partyId;
            if (pid) ids.add(pid);
          });
          setTxnPartyIds(Array.from(ids));
        },
        (err) => console.warn('[useProjectParties] txns error:', err),
      );

    // Constrain on orgId so the Firestore rule on /attendance can
    // verify the read before scanning. Without this, the entire
    // listener is denied with permission-denied.
    const unsubAtt = db
      .collection('attendance')
      .where('orgId', '==', orgId)
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const ids = new Set<string>();
          snap.docs.forEach((d) => {
            const lid = (d.data() as { labourId?: string }).labourId;
            if (lid) ids.add(lid);
          });
          setAttLabourIds(Array.from(ids));
        },
        (err) => console.warn('[useProjectParties] attendance error:', err),
      );

    const unsubTasks = db
      .collection('tasks')
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const ids = new Set<string>();
          snap.docs.forEach((d) => {
            const aid = (d.data() as { assignedTo?: string }).assignedTo;
            if (aid) ids.add(aid);
          });
          setTaskAssigneeIds(Array.from(ids));
          setSourcesLoading(false);
        },
        (err) => {
          console.warn('[useProjectParties] tasks error:', err);
          setSourcesLoading(false);
        },
      );

    return () => {
      unsubTxns();
      unsubAtt();
      unsubTasks();
    };
  }, [projectId]);

  const parties = useMemo(() => {
    const idSet = new Set<string>([...txnPartyIds, ...attLabourIds, ...taskAssigneeIds]);
    if (idSet.size === 0) return [];
    return allParties.filter((p) => idSet.has(p.id));
  }, [allParties, txnPartyIds, attLabourIds, taskAssigneeIds]);

  return { parties, loading: partiesLoading || sourcesLoading };
}
