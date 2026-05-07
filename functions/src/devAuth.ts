/**
 * Reviewer login bypass — mints a Firebase custom token when the caller
 * presents the phone + PIN that match Firebase secrets. Used by Play Store
 * and App Store reviewers who can't receive Indian SMS for OTP.
 *
 * Active in BOTH development AND production release builds. The gate is
 * the PIN, not __DEV__. See `src/features/auth/phoneAuth.ts` header for
 * the full security model.
 *
 * Configure (once per project):
 *   printf '%s' '+919999900000' | firebase functions:secrets:set DEV_LOGIN_PHONE --project sitexpens --data-file=-
 *   printf '%s' 'XXXXXX'        | firebase functions:secrets:set DEV_LOGIN_PIN   --project sitexpens --data-file=-
 *
 * The client only invokes this path when the entered phone matches
 * `EXPO_PUBLIC_DEV_LOGIN_PHONE` (baked into the bundle at build time).
 *
 * Security model:
 *   - Phone is discoverable in the bundle. Don't rely on phone secrecy.
 *   - PIN is server-side only (Firebase Functions secret).
 *   - Per-IP rate limit below caps brute force at 10 attempts/hour.
 *   - 6-digit PIN + 10/hour/IP → ~11 years to exhaust on a single IP.
 *   - Rotate `DEV_LOGIN_PIN` periodically and after store review completes.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FirebaseAuthError, getAuth } from 'firebase-admin/auth';

const DEV_LOGIN_PHONE = defineSecret('DEV_LOGIN_PHONE');
const DEV_LOGIN_PIN = defineSecret('DEV_LOGIN_PIN');

type Payload = {
  phoneE164?: string;
  pin?: string;
};

function normalizePhoneE164(raw: string): string {
  const t = raw.trim();
  return t.startsWith('+') ? t : `+${t.replace(/^\+/, '')}`;
}

// In-memory per-IP attempt counter. Cloud Functions instances are
// short-lived and may be replicated, so this is a best-effort throttle
// (an attacker who hits multiple instances gets more headroom). Good
// enough for v1.0; upgrade to Firestore-backed counter if abuse appears.
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    attempts.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_MAX_ATTEMPTS) {
    throw new HttpsError(
      'resource-exhausted',
      'Too many sign-in attempts from this address. Try again in an hour.',
    );
  }
}

export const mintDevTestToken = onCall<Payload>(
  { secrets: [DEV_LOGIN_PHONE, DEV_LOGIN_PIN] },
  async (req) => {
    const ip = req.rawRequest.ip ?? 'unknown';
    checkRateLimit(ip);

    const { phoneE164, pin } = req.data ?? {};
    if (!phoneE164 || !pin) {
      throw new HttpsError(
        'invalid-argument',
        '`phoneE164` and `pin` are required.',
      );
    }

    let allowedPhone: string;
    let allowedPin: string;
    try {
      allowedPhone = normalizePhoneE164(DEV_LOGIN_PHONE.value());
      allowedPin = DEV_LOGIN_PIN.value().trim();
    } catch {
      throw new HttpsError(
        'failed-precondition',
        'Reviewer login secrets are not configured.',
      );
    }

    if (!allowedPhone || !allowedPin) {
      throw new HttpsError(
        'failed-precondition',
        'Reviewer login is disabled (empty secrets).',
      );
    }

    const norm = normalizePhoneE164(phoneE164);
    const pinDigits = pin.replace(/\D/g, '');
    const allowedDigits = allowedPin.replace(/\D/g, '');

    if (norm !== allowedPhone || pinDigits !== allowedDigits) {
      throw new HttpsError('permission-denied', 'Invalid phone or PIN.');
    }

    let uid: string;
    try {
      uid = (await getAuth().getUserByPhoneNumber(norm)).uid;
    } catch {
      uid = (await getAuth().createUser({ phoneNumber: norm })).uid;
    }

    try {
      const customToken = await getAuth().createCustomToken(uid);
      return { customToken };
    } catch (e) {
      const msg =
        e instanceof FirebaseAuthError ? e.message : (e as Error).message;
      if (
        typeof msg === 'string' &&
        (msg.includes('signBlob') || msg.includes('insufficient-permission'))
      ) {
        throw new HttpsError(
          'failed-precondition',
          'IAM: Cloud Functions cannot mint custom tokens. Run scripts/fix-custom-token-iam.sh (or grant Service Account Token Creator on firebase-adminsdk to the Compute default SA).',
        );
      }
      throw e;
    }
  },
);
