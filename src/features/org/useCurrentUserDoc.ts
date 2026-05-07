/**
 * Live subscription to the current user's Firestore document. Used by
 * route guards (to know whether onboarding is needed) and by the profile
 * screen (to render company/email/phone).
 *
 * Returns `{ data: null, loading: true }` while the first snapshot is in
 * flight. After that, `data` is either the user doc or null (no doc yet,
 * which the AuthProvider creates on first sign-in so it should never stay
 * null for long).
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';
import { subscribeWithRetry } from '@/src/lib/subscribeWithRetry';
import { useAuth } from '@/src/features/auth/useAuth';

import type { UserDoc } from './types';

export type UseCurrentUserDocResult = {
  data: UserDoc | null;
  loading: boolean;
};

export function useCurrentUserDoc(): UseCurrentUserDocResult {
  const { user } = useAuth();
  const [data, setData] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    return subscribeWithRetry(
      db.collection('users').doc(user.uid),
      (snap) => {
        setData(snap.exists ? (snap.data() as UserDoc) : null);
        setLoading(false);
      },
      (err) => {
        console.warn('[useCurrentUserDoc] snapshot error:', err);
        setLoading(false);
      },
      { tag: '[useCurrentUserDoc]' },
    );
  }, [user]);

  return { data, loading };
}
