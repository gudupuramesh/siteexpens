/**
 * Firebase client handles.
 *
 * We use `@react-native-firebase` which auto-initializes from the native
 * config files (`google-services.json` on Android, `GoogleService-Info.plist`
 * on iOS) wired up via `app.json`. No JS-side `initializeApp` call is needed.
 *
 * This module exists so the rest of the app can import `auth` / `db` from a
 * single path without knowing which transport is underneath.
 */
import authModule, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestoreModule, {
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';

export const auth: FirebaseAuthTypes.Module = authModule();
export const db: FirebaseFirestoreTypes.Module = firestoreModule();
