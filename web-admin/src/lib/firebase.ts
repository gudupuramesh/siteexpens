/**
 * Firebase Web SDK initialisation for the App Owner admin portal.
 *
 * Talks to the same Firebase project (`sitexpens`) as the mobile
 * RN client. Uses the standard Web SDK (not the RN facade in
 * `src/lib/firebase.ts`) because this app runs in a browser.
 *
 * Auth: Google sign-in only — no phone OTP. The operator's Google
 * account must have the `role: 'app_owner'` custom claim set via
 * `scripts/grant-app-owner.ts`.
 *
 * Functions: callables in the `us-central1` region matching the
 * server. The connector wraps them so screens can call e.g.
 * `adminListSubscribers()` with type-safe payload + result.
 */
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// These keys are public by design — Firebase config is shipped to
// every web client. Security comes from rules + custom claims, not
// from hiding the project id.
const firebaseConfig = {
  apiKey: 'AIzaSyCTXnw4GlafJIR1vZb9d02MLcF98nfPCyg',
  authDomain: 'sitexpens.firebaseapp.com',
  projectId: 'sitexpens',
  storageBucket: 'sitexpens.firebasestorage.app',
  messagingSenderId: '288864968221',
  appId: '1:288864968221:ios:d4d838777e1768526ff0f4',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

// ── Auth helpers ──────────────────────────────────────────────────

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged };
export type { User };

// ── Callable wrappers ─────────────────────────────────────────────

export const callAdmin = {
  listSubscribers: httpsCallable<
    { pageSize?: number; filters?: { tier?: string; status?: string } },
    {
      rows: Array<{
        id: string;
        name: string;
        ownerId: string;
        ownerContact: string | null;
        tier: string;
        status: string;
        expiresAt: number | null;
        memberCount: number;
        projectCount: number;
        storageBytes: number;
        createdAt: number | null;
      }>;
      total: number;
    }
  >(functions, 'adminListSubscribers'),

  overrideOrgTier: httpsCallable<
    {
      orgId: string;
      tier: 'free' | 'solo' | 'studio' | 'agency';
      expiresAt: string | null;
      note?: string;
    },
    { ok: true }
  >(functions, 'adminOverrideOrgTier'),

  updatePlanConfig: httpsCallable<
    {
      free: { maxMembers: number; maxProjects: number; maxStorageBytes: number };
      solo: { maxMembers: number; maxProjects: number; maxStorageBytes: number };
      studio: { maxMembers: number; maxProjects: number; maxStorageBytes: number };
      agency: { maxMembers: number; maxProjects: number; maxStorageBytes: number };
    },
    { ok: true }
  >(functions, 'adminUpdatePlanConfig'),

  getRevenueAnalytics: httpsCallable<
    Record<string, never>,
    {
      totalOrgs: number;
      tierMix: Record<'free' | 'solo' | 'studio' | 'agency', number>;
      statusMix: Record<
        'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired',
        number
      >;
      mrrInr: number;
      arrInr: number;
      trialEndingSoon: number;
      manuallyOverridden: number;
    }
  >(functions, 'adminGetRevenueAnalytics'),
};
