/**
 * `mintCustomToken` — exchange an MSG91-issued OTP `access-token` for a
 * Firebase custom token.
 *
 * Why we do this server-side:
 *   - The MSG91 widget hands the app a JWT-like access token after the
 *     user completes the OTP flow. That token alone doesn't grant
 *     access to Firebase; we have to (a) re-validate it against
 *     MSG91's verifyAccessToken endpoint with our secret authKey, then
 *     (b) mint a Firebase custom token tied to the verified phone
 *     number. The client signs into Firebase Auth with that token.
 *
 *   - The MSG91 authKey must NEVER ship in the client bundle. It lives
 *     here as a Firebase secret (`MSG91_AUTH_KEY`).
 *
 * This callable does not fix “Mobile requests are not allowed for this widget” on Send OTP;
 * that error comes from the React Native SDK before OTP succeeds — enable Mobile Integration
 * on the widget in MSG91 (see repo `.env.example`).
 *
 * Setup (must match MSG91 “server side” / widget verify instructions):
 *   The Auth Key in the MSG91 dashboard (e.g. dropdown next to verifyAccessToken) is the
 *   same value as `authkey` in:
 *   POST https://control.msg91.com/api/v5/widget/verifyAccessToken
 *   Store it only as a Firebase secret — never in the client:
 *     printf '%s' 'YOUR_AUTH_KEY' | firebase functions:secrets:set MSG91_AUTH_KEY
 *
 * Wire format:
 *   POST <onCall endpoint>
 *   { data: { accessToken: string, phoneE164: string } }  →  { result: { customToken: string } }
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FirebaseAuthError, getAuth } from 'firebase-admin/auth';

const MSG91_AUTH_KEY = defineSecret('MSG91_AUTH_KEY');

type Payload = {
  accessToken?: string;
  phoneE164?: string;
};

type MSG91VerifyResponse = {
  type?: 'success' | 'error';
  message?: string;
};

export const mintCustomToken = onCall<Payload>(
  { secrets: [MSG91_AUTH_KEY] },
  async (req) => {
    const { accessToken, phoneE164 } = req.data ?? {};
    if (!accessToken || !phoneE164) {
      throw new HttpsError(
        'invalid-argument',
        'Both `accessToken` and `phoneE164` are required.',
      );
    }

    let verifyJson: MSG91VerifyResponse;
    try {
      const resp = await fetch(
        'https://control.msg91.com/api/v5/widget/verifyAccessToken',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authkey: MSG91_AUTH_KEY.value(),
            'access-token': accessToken,
          }),
        },
      );
      const raw = await resp.text();
      try {
        verifyJson = JSON.parse(raw) as MSG91VerifyResponse;
      } catch {
        throw new HttpsError(
          'unavailable',
          `MSG91 non-JSON response (HTTP ${resp.status}): ${raw.slice(0, 200)}`,
        );
      }
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError(
        'unavailable',
        `MSG91 reachability failure: ${(err as Error).message}`,
      );
    }

    if (verifyJson.type !== 'success') {
      throw new HttpsError(
        'permission-denied',
        verifyJson.message ?? 'OTP access token rejected by MSG91.',
      );
    }

    const phoneNorm = phoneE164.startsWith('+') ? phoneE164 : `+${phoneE164}`;
    let uid: string;
    try {
      uid = (await getAuth().getUserByPhoneNumber(phoneNorm)).uid;
    } catch {
      uid = (await getAuth().createUser({ phoneNumber: phoneNorm })).uid;
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
