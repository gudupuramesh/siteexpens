import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { ProjectLabour } from './types';

export type UseProjectLabourResult = {
  data: ProjectLabour[];
  loading: boolean;
};

export function useProjectLabour(
  projectId: string | undefined,
  orgId: string | undefined,
): UseProjectLabourResult {
  const [data, setData] = useState<ProjectLabour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // orgId is required: Firestore rule on projectLabour reads
    // `resource.data.orgId`, and list queries must constrain on the
    // same field for the rule to evaluate.
    if (!projectId || !orgId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('projectLabour')
      .where('orgId', '==', orgId)
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          const rows = snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<ProjectLabour, 'id'>),
            }))
            .filter((row) => !row.disabled)
            .sort((a, b) => a.labourName.localeCompare(b.labourName));
          setData(rows);
          setLoading(false);
        },
        (err) => {
          console.warn('[useProjectLabour] snapshot error:', err);
          setLoading(false);
        },
      );

    return unsub;
  }, [projectId, orgId]);

  return { data, loading };
}
