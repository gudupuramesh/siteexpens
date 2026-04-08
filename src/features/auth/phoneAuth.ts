/**
 * Phone OTP authentication wrapper around `@react-native-firebase/auth`.
 *
 * On native, RNFirebase handles the anti-abuse flow automatically (Play
 * Integrity / SafetyNet on Android, silent APNs on iOS) — no reCAPTCHA
 * verifier is required. The caller keeps the returned `ConfirmationResult`
 * around (see `pendingConfirmation.ts`) until the user enters the OTP.
 */
import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';

export type PhoneConfirmation = FirebaseAuthTypes.ConfirmationResult;

/**
 * Sends an OTP to the given phone number. The phone number must include the
 * country code in E.164 format, e.g. "+919876543210".
 */
export async function sendOtp(phoneE164: string): Promise<PhoneConfirmation> {
  return auth().signInWithPhoneNumber(phoneE164);
}

/**
 * Confirms the OTP code entered by the user. Throws on invalid code.
 */
export async function confirmOtp(
  confirmation: PhoneConfirmation,
  code: string,
): Promise<void> {
  await confirmation.confirm(code);
}
