/**
 * Shared App-Owner auth gate for every admin callable.
 *
 * Every callable in this directory MUST start with `assertAppOwner(request)`
 * — that's the security boundary that lets us bypass per-org rules
 * via the Admin SDK and read across the system. Without this, the
 * callables would expose every org doc + every subscription state
 * to any authenticated user.
 *
 * The check looks at the Firebase Auth custom claim `role: 'app_owner'`
 * which is set by `scripts/grant-app-owner.ts` (or by directly calling
 * `admin.auth().setCustomUserClaims(uid, { role: 'app_owner' })` once
 * via the Firebase MCP). Custom claims live in the user's ID token;
 * no Firestore round-trip per call.
 */
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';

export function assertAppOwner(request: CallableRequest): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const role = request.auth.token?.role;
  if (role !== 'app_owner') {
    throw new HttpsError(
      'permission-denied',
      'App Owner privilege required.',
    );
  }
  return request.auth.uid;
}
