/**
 * Phone OTP authentication wrapper around the Firebase JS SDK.
 *
 * Notes on platforms:
 * - On **web**, we use `RecaptchaVerifier` from `firebase/auth` — this is
 *   fully supported.
 * - On **native (iOS/Android)**, the JS SDK's `signInWithPhoneNumber` requires
 *   a recaptcha verifier, which is web-only. To use phone auth on device we
 *   will either (a) switch to `@react-native-firebase/auth` inside an EAS dev
 *   build, or (b) wire up an in-app reCAPTCHA via a WebView. Both land in a
 *   follow-up PR. For now, calling `sendOtp` on native throws a clear error.
 *
 * The caller is responsible for keeping the returned `ConfirmationResult`
 * around (typically in module state or React state) until the user enters
 * the OTP.
 */
import { Platform } from 'react-native';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';

import { auth } from '@/src/lib/firebase';

/**
 * Builds an invisible reCAPTCHA verifier. Only callable on web — on native
 * this throws because `RecaptchaVerifier` expects a DOM element.
 */
export function createWebRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  if (Platform.OS !== 'web') {
    throw new Error(
      'createWebRecaptchaVerifier() is web-only. Native phone auth is not wired up yet.',
    );
  }
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
}

/**
 * Sends an OTP to the given phone number. The phone number must include the
 * country code in E.164 format, e.g. "+919876543210".
 *
 * On web, pass a `RecaptchaVerifier` built with `createWebRecaptchaVerifier`.
 */
export async function sendOtp(
  phoneE164: string,
  verifier: RecaptchaVerifier,
): Promise<ConfirmationResult> {
  if (Platform.OS !== 'web') {
    throw new Error(
      'Phone auth on native is not yet supported in this scaffold. ' +
        'Run the app on web for now, or wait for the EAS dev build PR.',
    );
  }
  return signInWithPhoneNumber(auth, phoneE164, verifier);
}

/**
 * Confirms the OTP code entered by the user. Returns the Firebase user on
 * success. Throws on invalid code.
 */
export async function confirmOtp(
  confirmation: ConfirmationResult,
  code: string,
): Promise<void> {
  await confirmation.confirm(code);
}
