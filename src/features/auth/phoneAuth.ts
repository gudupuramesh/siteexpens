/**
 * Phone OTP flow.
 *
 * Architecture:
 *   1. The MSG91 native widget is initialised once (`initializeWidget`)
 *      with the dashboard widgetId + tokenAuth.
 *   2. `sendOtp(phoneE164)` triggers an SMS via MSG91.
 *   3. `confirmOtp(...)` verifies with MSG91, then `mintCustomToken`.
 *
 * MSG91 is loaded dynamically so Expo Go can boot without native MSG91/BiometricAuth;
 * use the reviewer bypass phone (`EXPO_PUBLIC_DEV_LOGIN_PHONE`) or a development build for SMS.
 * Dashboard: enable **Mobile Integration** on the OTP widget; see `.env.example` checklist.
 *
 * Reviewer bypass: a single phone number routes through `mintDevTestToken` instead
 * of MSG91. Active in BOTH dev and production release builds — Play Store / App
 * Store reviewers can't receive Indian SMS, so they need a way to sign in.
 *
 * Security model:
 *   - The bypass phone IS embedded in the bundle (EXPO_PUBLIC_DEV_LOGIN_PHONE)
 *     and discoverable by anyone who decompiles the AAB / IPA
 *   - The PIN is the real secret — stored in Firebase Functions secret DEV_LOGIN_PIN,
 *     never exposed to clients. Server-side rate limiting in mintDevTestToken
 *     prevents brute force.
 *   - Pick a non-real Indian phone (e.g. +919999900000) so it can't collide
 *     with a real user, and a strong PIN.
 */
import { auth, callFunction } from '@/src/lib/firebase';

import { studioAuth } from './studioAuth';

/** Marks a pending session that skips MSG91 and uses `mintDevTestToken`. */
export const REVIEWER_OTP_BYPASS_REQ_ID = '__reviewer_otp_bypass__';
/** @deprecated kept as alias for older imports — use REVIEWER_OTP_BYPASS_REQ_ID. */
export const DEV_OTP_BYPASS_REQ_ID = REVIEWER_OTP_BYPASS_REQ_ID;

/** User-facing copy when MSG91 rejects mobile/widget — short in release, detailed in dev. */
const MSG91_MOBILE_WIDGET_BODY = __DEV__
  ? 'MSG91 blocked this request (mobile integration / widget). Check the dashboard: Mobile Integration must be on for this widget; set EXPO_PUBLIC_MSG91_WIDGET_ID and EXPO_PUBLIC_MSG91_TOKEN_AUTH in .env and rebuild. Deploying Cloud Functions alone does not fix Send OTP.'
  : 'SMS sign-in is temporarily unavailable. Please try again later or contact support.';

function mapMsg91UserError(msg: string | undefined): string {
  const raw = (msg ?? '').trim();
  const m = raw.toLowerCase();
  if (
    m.includes('mobile requests are not allowed') ||
    m.includes('not allowed for this widget')
  ) {
    return MSG91_MOBILE_WIDGET_BODY;
  }
  return raw || 'Something went wrong. Please try again.';
}

function normalizePhoneE164(raw: string): string {
  const t = raw.trim();
  return t.startsWith('+') ? t : `+${t.replace(/^\+/, '')}`;
}

/** Reviewer bypass — active in dev AND production. Routes the configured
 *  phone to mintDevTestToken (PIN-gated server-side) instead of MSG91 SMS.
 *  See file header for security model. */
function isReviewerOtpBypass(phoneE164: string): boolean {
  const devPhone = process.env.EXPO_PUBLIC_DEV_LOGIN_PHONE?.trim();
  if (!devPhone) return false;
  return normalizePhoneE164(phoneE164) === normalizePhoneE164(devPhone);
}

const WIDGET_ID =
  process.env.EXPO_PUBLIC_MSG91_WIDGET_ID ?? studioAuth.msg91WidgetId;
const TOKEN_AUTH =
  process.env.EXPO_PUBLIC_MSG91_TOKEN_AUTH ?? studioAuth.msg91TokenAuth;

type OTPWidgetModule = typeof import('@msg91comm/sendotp-react-native');

let msg91ModulePromise: Promise<OTPWidgetModule> | null = null;
let initialised = false;

function loadMsg91Module(): Promise<OTPWidgetModule> {
  if (!msg91ModulePromise) {
    msg91ModulePromise = import('@msg91comm/sendotp-react-native');
  }
  return msg91ModulePromise;
}

async function ensureInitialised(): Promise<void> {
  if (initialised) return;
  if (!WIDGET_ID || !TOKEN_AUTH) {
    throw new Error(
      'SMS sign-in is not configured for this build. Set EXPO_PUBLIC_MSG91_WIDGET_ID and EXPO_PUBLIC_MSG91_TOKEN_AUTH.',
    );
  }
  let mod: OTPWidgetModule;
  try {
    mod = await loadMsg91Module();
  } catch {
    throw new Error(
      'SMS login needs native MSG91 modules. In Expo Go use your dev bypass phone (EXPO_PUBLIC_DEV_LOGIN_PHONE), or install a development build.',
    );
  }
  try {
    mod.OTPWidget.initializeWidget(WIDGET_ID, TOKEN_AUTH);
  } catch (e) {
    throw new Error(
      mapMsg91UserError(e instanceof Error ? e.message : String(e)),
    );
  }
  initialised = true;
}

type Msg91Response = {
  type?: 'success' | 'error';
  message?: string;
  ['access-token']?: string;
  invisibleVerified?: boolean;
  code?: number;
};

export type PhoneConfirmation = {
  phoneE164: string;
  reqId: string;
  accessToken?: string;
};

function toMsg91Phone(phoneE164: string): string {
  return phoneE164.replace(/^\+/, '');
}

function unwrap(res: unknown): Msg91Response {
  return (res ?? {}) as Msg91Response;
}

/**
 * MSG91 widget responses are not uniform across versions: the session JWT may appear in
 * `access-token` or in `message`. Handling both is required for production reliability, not a workaround.
 */
function looksLikeJwt(value: string | undefined): boolean {
  if (!value || value.length < 32) return false;
  const parts = value.split('.');
  return parts.length === 3 && value.startsWith('eyJ');
}

function accessTokenFromMsg91(res: Msg91Response): string | undefined {
  const fromHeader = res['access-token']?.trim();
  if (fromHeader) return fromHeader;
  const msg = res.message?.trim();
  if (msg && looksLikeJwt(msg)) return msg;
  return undefined;
}

export async function sendOtp(phoneE164: string): Promise<PhoneConfirmation> {
  const normalized = normalizePhoneE164(phoneE164);
  if (isReviewerOtpBypass(normalized)) {
    return {
      phoneE164: normalized,
      reqId: REVIEWER_OTP_BYPASS_REQ_ID,
    };
  }

  await ensureInitialised();
  const { OTPWidget } = await loadMsg91Module();
  const identifier = toMsg91Phone(normalized);

  let res: Msg91Response;
  try {
    res = unwrap(await OTPWidget.sendOTP({ identifier }));
  } catch (e) {
    throw new Error(
      mapMsg91UserError(e instanceof Error ? e.message : String(e)),
    );
  }

  if (res.type !== 'success') {
    throw new Error(mapMsg91UserError(res.message));
  }

  const accessToken = accessTokenFromMsg91(res);
  const msg = res.message?.trim() ?? '';
  const reqId =
    accessToken && msg === accessToken ? '' : msg;

  return {
    phoneE164: normalized,
    reqId,
    accessToken,
  };
}

export async function confirmOtp(
  c: PhoneConfirmation,
  code: string,
): Promise<void> {
  if (c.reqId === REVIEWER_OTP_BYPASS_REQ_ID) {
    // Production reviewer bypass — server validates PIN against
    // DEV_LOGIN_PIN secret + per-IP rate limit. See file header.
    const pin = code.replace(/\D/g, '');
    if (!pin) {
      throw new Error('Enter your PIN.');
    }
    const { data } = await callFunction<
      { phoneE164: string; pin: string },
      { customToken: string }
    >('mintDevTestToken', { phoneE164: c.phoneE164, pin });
    await auth.signInWithCustomToken(data.customToken);
    return;
  }

  await ensureInitialised();
  const { OTPWidget } = await loadMsg91Module();

  let accessToken = c.accessToken;
  if (!accessToken) {
    if (!c.reqId) {
      throw new Error('Session expired — please request a new code.');
    }
    let res: Msg91Response;
    try {
      res = unwrap(await OTPWidget.verifyOTP({ reqId: c.reqId, otp: code }));
    } catch (e) {
      throw new Error(
        mapMsg91UserError(e instanceof Error ? e.message : String(e)),
      );
    }
    if (res.type !== 'success') {
      throw new Error(mapMsg91UserError(res.message));
    }
    accessToken = accessTokenFromMsg91(res);
    if (!accessToken) {
      throw new Error(
        'Could not complete sign-in after OTP. Please request a new code and try again.',
      );
    }
  }

  const { data } = await callFunction<
    { accessToken: string; phoneE164: string },
    { customToken: string }
  >('mintCustomToken', { accessToken, phoneE164: c.phoneE164 });

  await auth.signInWithCustomToken(data.customToken);
}
