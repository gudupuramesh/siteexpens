/**
 * Live subscription to the current user's *primary* organization. Returns
 * `{ data: null, loading: true }` until both the user doc and the org
 * doc have loaded at least once.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

import type { Organization } from './types';
import { useCurrentUserDoc } from './useCurrentUserDoc';

export type UseCurrentOrganizationResult = {
  data: Organization | null;
  loading: boolean;
};

export function useCurrentOrganization(): UseCurrentOrganizationResult {
  const { data: userDoc, loading: userLoading } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? null;

  const [data, setData] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) {
      setLoading(true);
      return;
    }
    if (!orgId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('organizations')
      .doc(orgId)
      .onSnapshot(
        (snap) => {
          if (snap.exists) {
            setData({ id: snap.id, ...(snap.data() as Omit<Organization, 'id'>) });
          } else {
            setData(null);
          }
          setLoading(false);
        },
        (err) => {
          console.warn('[useCurrentOrganization] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId, userLoading]);

  return { data, loading };
}
