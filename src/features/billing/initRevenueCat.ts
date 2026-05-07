/**
 * RevenueCat SDK initialisation.
 *
 * Lifecycle:
 *   1. `initRevenueCat()` runs once at app launch (in `app/_layout.tsx`).
 *      Configures the SDK with the platform-appropriate public key.
 *      Anonymous user — no app-user-id yet because the user hasn't
 *      signed in.
 *
 *   2. After auth + active org settle, `identifyOrgWithRevenueCat(orgId)`
 *      runs in `app/(app)/_layout.tsx`. The SDK calls `Purchases.logIn`
 *      which attaches the anonymous purchase history to the org-id app
 *      user, AND sends a `INITIAL_PURCHASE` webhook with `app_user_id =
 *      orgId` so server-side mapping is unambiguous.
 *
 *   3. On sign-out, `Purchases.logOut()` is called from the auth path
 *      to detach the device from the previous org's purchase history.
 *
 * App User ID = Org ID (NOT user uid). Per [types.ts:46], purchases
 * attach to the studio, so when the owner switches phones or another
 * admin pays, the entitlement stays on the org.
 *
 * SDK keys are PUBLIC and meant to be embedded in the client. They're
 * scoped per-platform per-app — never cross-app credentials. Replace
 * the placeholders below with the keys from RevenueCat dashboard →
 * Project Settings → API Keys → "Public app-specific" (do NOT use the
 * Secret API Key — that's for server-side only).
 */
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

// ── API keys ─────────────────────────────────────────────────────────
//
// Public app-specific SDK keys from RevenueCat → Project Settings →
// API Keys. These are PUBLIC — meant to be embedded in the client.
// Never paste a Secret API key here.
//
// The Android key is still a placeholder — paste the `goog_…` value
// once the Android app is configured in the RevenueCat dashboard.
// Until then, Android purchase attempts will throw at runtime; iOS
// is unaffected.

const RC_API_KEY_IOS = 'appl_SVsQDBJsupgnZlCfKasuYzthmdn';
const RC_API_KEY_ANDROID = 'goog_PASTE_FROM_REVENUECAT_DASHBOARD';

// ── Init ─────────────────────────────────────────────────────────────

let configured = false;

/** Configure the SDK once. Idempotent — safe to call from React Strict
 *  mode's double-render. */
export function initRevenueCat(): void {
  if (configured) return;
  configured = true;

  if (__DEV__) {
    // Verbose logs only in dev — production is silent.
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
  Purchases.configure({ apiKey });
}

// ── Org identity ─────────────────────────────────────────────────────

/** Bind the SDK to the org's RevenueCat App User ID. Idempotent —
 *  RevenueCat returns immediately if already logged in as the same id.
 *  Safe to call on every app foreground / org switch. */
export async function identifyOrgWithRevenueCat(orgId: string): Promise<void> {
  if (!configured) {
    // Defensive — should never happen because app/_layout.tsx mounts
    // initRevenueCat() before the auth gate, but guard anyway so a
    // refactor doesn't silently no-op the login.
    initRevenueCat();
  }
  if (!orgId) return;
  try {
    await Purchases.logIn(orgId);
  } catch (err) {
    // Non-fatal — the SDK retries automatically; a one-off network
    // hiccup shouldn't block the app from rendering.
    console.warn('[initRevenueCat] logIn failed:', err);
  }
}

/** Drop the SDK's bind to the previous org. Called from sign-out so
 *  the next user's purchases don't get attached to the previous app
 *  user id. Non-fatal on failure. */
export async function clearRevenueCatIdentity(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    console.warn('[initRevenueCat] logOut failed:', err);
  }
}
