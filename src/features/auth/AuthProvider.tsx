/**
 * AuthProvider subscribes to Firebase auth state and exposes the current
 * user (or null) plus a loading flag via React context.
 *
 * On first sign-in of a new phone number, this provider also ensures a
 * `users/{uid}` document exists in Firestore with the user's basic profile.
 */
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db } from '@/src/lib/firebase';

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

async function ensureUserDoc(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return;
  }
  await setDoc(ref, {
    phoneNumber: user.phoneNumber ?? '',
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? null,
    primaryOrgId: null,
    createdAt: serverTimestamp(),
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (next) => {
      if (next) {
        try {
          await ensureUserDoc(next);
        } catch (err) {
          // Non-fatal: we still let the user in. Firestore writes can fail
          // due to offline mode or rules; surface it via console for now.
          console.warn('[auth] failed to ensure user doc:', err);
        }
      }
      setUser(next);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
