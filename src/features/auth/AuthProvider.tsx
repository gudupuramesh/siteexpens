/**
 * AuthProvider subscribes to Firebase auth state and exposes the current
 * user (or null) plus a loading flag via React context.
 *
 * On first sign-in of a new phone number, this provider also ensures a
 * `users/{uid}` document exists in Firestore with the user's basic profile.
 */
import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

import { auth, db } from '@/src/lib/firebase';

export type AuthUser = FirebaseAuthTypes.User;

export type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
};

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
});

async function ensureUserDoc(user: AuthUser): Promise<void> {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (snap.exists) {
    return;
  }
  await ref.set({
    phoneNumber: user.phoneNumber ?? '',
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? null,
    primaryOrgId: null,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (next) => {
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
