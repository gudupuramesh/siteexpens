# IAP & Subscriptions Playbook
*Apple StoreKit + RevenueCat + Firebase + React Native + Expo*

> Written after shipping `com.siteexpens.app` v1.0.4 (build 10) to TestFlight with a
> fully working sandbox purchase flow. This is the field guide for doing it again on the
> next project without re-discovering the same gotchas.

---

## TL;DR

- **Stack**: StoreKit (Apple's payment) → RevenueCat (receipt validation + webhooks) → Cloud Function (auth + dedupe + Firestore write) → `useSubscription` hook (single source of truth) → UI gates
- **Key decision**: `App User ID = orgId` (not user uid) — entitlements stick to the studio so the owner can switch phones / hand the studio to another admin without losing the subscription
- **Hardest bug**: Expo SDK 54 + RN 0.81 + prebuilt RN ships an archive that crashes at launch with `Library not loaded: @rpath/hermes.framework/hermes`. Section 6 has the full 4-patch Podfile fix.
- **Only the Studio Owner can subscribe.** Admins and below see read-only usage stats. Apple ID is per-device.
- **Production-quality artifacts**: idempotent Podfile post_install, signed-via-automatic-provisioning archive, server-side idempotent webhook with `webhookEvents/{eventId}` dedupe, Bearer-tolerant auth, `effectiveTier` that downgrades to free on expiry — all paste-able into the next project.

If you're chasing a specific error, jump straight to **Section 12 (Common Errors → Fix)**.

---

## 0. Architecture at a glance

```
┌──────────────────┐   tap Subscribe   ┌────────────────────┐
│  React Native    │──────────────────▶│   Apple StoreKit   │
│  (subscription   │                   │  (system process,  │
│  .tsx)           │                   │   Face ID gate)    │
└──────────────────┘                   └─────────┬──────────┘
        ▲                                        │
        │ Firestore                              │ App Store Server
        │ snapshot                               │ Notification (S2S)
        │                                        ▼
┌──────────────────┐  ┌─────────────────────────────────────────┐
│ useSubscription  │  │            RevenueCat                    │
│ (reads org doc)  │  │  (receipts, products, webhooks, sandbox  │
└────────┬─────────┘  │   ↔ production routing, retries 3×/1h)   │
         │            └────────────────────────┬─────────────────┘
         │                                     │ POST /webhook
         │                                     │ Authorization: Bearer <secret>
         │                                     ▼
         │                          ┌────────────────────────┐
         │                          │  revenueCatWebhook     │
         │                          │  (Cloud Function v2):  │
         │                          │   1. auth check        │
         │                          │   2. dedupe by event.id │
         │                          │   3. map productId →    │
         │                          │      (tier, period)    │
         │                          │   4. write Firestore   │
         │                          └────────────┬───────────┘
         │                                       │ merge: true
         └──────── reads ──── Firestore ─────────┘
                              `organizations/{orgId}.subscription`
```

**Why this split:**
- **Apple StoreKit** is the only legal payment processor for IAP — non-negotiable.
- **RevenueCat** abstracts the 30+ App Store Server Notification event types, handles sandbox/production receipt routing, retries failed webhooks, and gives one stable client SDK that works across iOS + Android.
- **Cloud Function** is where we apply our schema: dedupe, tier mapping, Firestore write. Trusted boundary.
- **Firestore** is the source of truth on the client. RC dashboard is a UI for ops, not a runtime data plane.
- **`useSubscription`** reads the Firestore doc — no extra `Purchases.getCustomerInfo()` round-trip per UI gate.

**App User ID = orgId**: the comment in `src/features/billing/initRevenueCat.ts:19-21` spells it out:

> "Per types.ts:46, purchases attach to the studio, so when the owner switches phones or another admin pays, the entitlement stays on the org."

This is the most important architecture decision in the whole system. Don't change it.

---

## 1. Prerequisites checklist (operator side)

These steps unlock everything else. Most are 5-minute clicks; tax forms can be 24-48h Apple-side propagation.

### App Store Connect
**Where**: https://appstoreconnect.apple.com → top-right account dropdown → **Agreements, Tax, and Banking**

| Row | Status when "done" |
|---|---|
| Paid Apps | "Active" with green checkmark, no warning banner |
| Tax Forms | All territories show green "Submitted" (W-8BEN-E for India entity selling to US Apple) |
| Bank Account | Green checkmark, masked account number visible |
| Contact Info | All four (Senior Mgmt, Financial, Marketing, Technical) green |

Then **Subscriptions** under My Apps → your app:

1. Click **+ Create Subscription Group** — name it something stable (we used `Interior OS Plans`). Apple requires upgrades/downgrades to be in the same group.
2. Add **6 auto-renewable subscription products** to the group:

| Tier | Period | Product ID | Pricing (INR) |
|---|---|---|---|
| Solo | Monthly | `interioros.solo.monthly` | ₹499 |
| Solo | Annual | `interioros.solo.annual` | ₹4,999 |
| Studio | Monthly | `interioros.studio.monthly` | ₹1,999 |
| Studio | Annual | `interioros.studio.annual` | ₹19,999 |
| Agency | Monthly | `interioros.agency.monthly` | ₹4,999 |
| Agency | Annual | `interioros.agency.annual` | ₹49,999 |

Use the same IDs in App Store Connect, Play Console, AND RevenueCat. **Mismatched IDs are the #1 RevenueCat configuration bug.**

3. For each product: **Subscription Duration**, **Subscription Prices**, **Localization** (display name + description), **Review Information** (screenshot of the paywall — Apple needs unique screenshots per product, not reused). Status flips to **"Ready to Submit"** when filled.

4. **Sandbox Testers**: Users and Access → Sandbox → Testers → "+". Use unique emails (e.g. `tester1+sandbox@yourdomain.com`), set country to match your storefront, save the password. You need at least 2 testers — each can only buy each subscription once per cycle.

5. **App-Specific Shared Secret**: My Apps → your app → App Information → bottom right "App-Specific Shared Secret" → click View/Generate → copy. RevenueCat needs this.

6. **App Store Connect API Key**: Users and Access → Integrations → App Store Connect API → "+" generate. Download the .p8, copy Issuer ID + Key ID. RevenueCat uses this to auto-import products.

### Play Console (parallel)
- Setup → Payments profile → Create. Tax info (PAN), bank.
- Monetize → Subscriptions → create the same 6 products with the same IDs. Activate base plans.
- Setup → API access → grant a service account "Pub/Sub Editor". Download JSON. RevenueCat needs this.

### Verification before moving on
- [ ] App Store Connect → Agreements → Paid Apps says **Active**, no banner
- [ ] All 6 IAP products show **Ready to Submit**
- [ ] At least 2 sandbox testers exist
- [ ] App-Specific Shared Secret + ASC API Key copied somewhere safe (we'll paste both into RevenueCat next)

---

## 2. RevenueCat dashboard setup

### Create the project
1. https://app.revenuecat.com → sign up → **Create Project** → name it the app's name.
2. **Add iOS App**:
   - Bundle ID: `com.siteexpens.app` (or your bundle id)
   - Paste **App-Specific Shared Secret**
   - Paste **App Store Connect API Key** (.p8 file + Issuer ID + Key ID)
3. **Add Android App** (when ready):
   - Package name (same as iOS bundle ID convention)
   - Service account JSON

### Products (auto-imports)
RC pulls products from App Store Connect via the API key. Refresh **Project Settings → Products** until all 6 (or 12 — 6 per platform) appear with green status.

### Entitlements
**Project Settings → Entitlements → "+ New"** → ID `paid` → attach all 6 products. Any non-free purchase grants `paid`. **Tier-specific limits are NOT enforced via separate entitlements** — the tier is on `org.subscription.tier`, the entitlement is just a single boolean flag.

### Offerings
**Project Settings → Offerings → "+ New"** → ID `default` → mark as **Current** → add 6 packages.

> ⚠️ **Gotcha**: RevenueCat's dropdown only shows `$rc_monthly` once. After two products you'll see no slot for a third monthly. **Use Custom identifier** (e.g. `solo_monthly`, `studio_monthly`, `agency_monthly`) for the 4th-onwards. RC accepts arbitrary identifiers.

Suggested identifiers:

| Package identifier | Product attached |
|---|---|
| `$rc_monthly` | `interioros.solo.monthly` (the default) |
| `solo_annual` | `interioros.solo.annual` |
| `studio_monthly` | `interioros.studio.monthly` |
| `studio_annual` | `interioros.studio.annual` |
| `agency_monthly` | `interioros.agency.monthly` |
| `agency_annual` | `interioros.agency.annual` |

### Webhook
**Project Settings → Integrations → Webhooks**:
- **URL**: paste your Cloud Function URL (we'll deploy in Section 3)
- **Authorization header**: any random secret. We used the literal string `Bearer rc_webhook_<random-hex>`. RevenueCat sends whatever string you type here verbatim — there's no enforced format.
- Save the secret somewhere — we paste the SAME string into Firebase secrets.

### Public SDK keys
**Project Settings → API Keys → "Public app-specific" tab**. Two keys:
- `appl_…` for iOS
- `goog_…` for Android

These are PUBLIC — meant to be embedded in the client. The Secret API key is for server-side calls only; do not paste it into mobile code.

### Verification
- [ ] Customers tab loads without errors
- [ ] Products page lists 6 (or 12) products with green status
- [ ] Offerings → `default` exists, marked Current, contains 6 packages
- [ ] Webhook URL set + Authorization secret saved

---

## 3. Firebase: webhook function + secret

### Set the secret
On your dev machine:
```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
```
When prompted, paste the **same value** you put in the RevenueCat dashboard's Authorization header field.

Verify:
```bash
firebase functions:secrets:access REVENUECAT_WEBHOOK_AUTH
```
…or check Cloud Console → Secret Manager.

### The webhook handler
Production code from `functions/src/billing/revenueCatWebhook.ts` — **paste-able verbatim** into the next project (rename module imports and product-id mapping):

```ts
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { tierAndPeriodFromProductIdServer } from './productIdMap';
import type { Subscription, SubscriptionStatus } from './types';

const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

type RCEvent = {
  id: string;                 // unique — used for idempotency
  type: string;               // INITIAL_PURCHASE | RENEWAL | CANCELLATION | …
  app_user_id: string;        // we set this = orgId via Purchases.logIn(orgId)
  product_id: string;
  expiration_at_ms: number | null;
  cancel_reason?: string | null;
  event_timestamp_ms: number;
};

function statusFromEventType(type: string): SubscriptionStatus | null {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'TRANSFER':
      return 'active';
    case 'CANCELLATION':  return 'cancelled';   // tier intact until expiry
    case 'EXPIRATION':    return 'expired';     // downgrade to free
    case 'BILLING_ISSUE': return 'past_due';    // RC retrying, ~16-day grace
    default:              return null;          // SUBSCRIBER_ALIAS, NON_RENEWING_PURCHASE
  }
}

export const revenueCatWebhook = onRequest(
  { region: 'us-central1', secrets: [REVENUECAT_WEBHOOK_AUTH], memory: '256MiB', cpu: 1 },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('method not allowed'); return; }

    // Auth — tolerant of `Bearer ` prefix in either direction.
    const expected = REVENUECAT_WEBHOOK_AUTH.value();
    const got = req.header('authorization') ?? '';
    const normalise = (s: string) => s.replace(/^Bearer\s+/i, '').trim();
    if (!expected || normalise(got) !== normalise(expected)) {
      console.warn('[revenueCatWebhook] auth mismatch', {
        headerPresent: got.length > 0, headerLen: got.length,
        headerStart: got.slice(0, 10), expectedLen: expected ? expected.length : 0,
      });
      res.status(401).send('unauthorized');
      return;
    }

    const event = (req.body as { event?: RCEvent } | undefined)?.event;
    if (!event?.id || !event.app_user_id) {
      res.status(400).send('bad payload'); return;
    }

    const db = getFirestore();

    // Idempotency — webhookEvents/{eventId} so retries are silently ignored.
    const eventRef = db.collection('webhookEvents').doc(event.id);
    if ((await eventRef.get()).exists) {
      res.status(200).send('ok (duplicate)'); return;
    }
    await eventRef.set({
      type: event.type, orgId: event.app_user_id, productId: event.product_id ?? null,
      receivedAt: FieldValue.serverTimestamp(),
      eventTimestamp: event.event_timestamp_ms ? Timestamp.fromMillis(event.event_timestamp_ms) : null,
    });

    const status = statusFromEventType(event.type);
    if (!status) { res.status(200).send('ok (no-op)'); return; }

    const tap = event.product_id ? tierAndPeriodFromProductIdServer(event.product_id) : null;
    const tier = event.type === 'EXPIRATION' ? 'free' as const : tap?.tier ?? null;
    if (!tier) {
      await eventRef.update({ warning: `Unknown product_id: ${event.product_id}` });
      res.status(200).send('ok (unknown product)'); return;
    }

    const subscription: Subscription = {
      tier, status,
      productId: tier === 'free' ? null : event.product_id,
      period: tap?.period ?? null,
      revenueCatId: event.app_user_id,
      expiresAt: event.expiration_at_ms ? Timestamp.fromMillis(event.expiration_at_ms) : null,
      willRenew: status === 'active' && !event.cancel_reason,
      updatedAt: null,
      source: 'webhook',
    };

    await db.collection('organizations').doc(event.app_user_id).set(
      { subscription: { ...subscription, updatedAt: FieldValue.serverTimestamp() } },
      { merge: true },
    );

    res.status(200).send('ok');
  },
);
```

### Why each thing is the way it is
- **`onRequest` v2** with secrets binding — the `defineSecret` API automatically wires the env var.
- **Bearer-tolerant auth** — RC sends what you type; operators sometimes paste with `Bearer `, sometimes without. Strip both sides and compare.
- **Diagnostic log on auth fail** — header length + first 10 chars, no secret material. Lets you debug "why is this 401" from Cloud Functions logs without a redeploy.
- **`webhookEvents/{eventId}` dedupe** — RC retries on 5xx with the same event id. Without dedupe, a retried `INITIAL_PURCHASE` could shift `expiresAt` forward incorrectly when racing with a manual override.
- **`merge: true`** — only the `subscription` field is touched. `memberIds`, `roles`, `counters` stay intact.
- **`EXPIRATION → tier='free'`** regardless of which product expired — simple, correct downgrade.

### Deploy
```bash
firebase deploy --only functions:revenueCatWebhook
```

### Verify
- RC dashboard → Webhooks → "Send test event" — the function should return 200.
- `firebase functions:log --only revenueCatWebhook --lines 20` shows the request.

---

## 4. Mobile code structure

Everything lives under `src/features/billing/`:

| File | Role |
|---|---|
| `initRevenueCat.ts` | `Purchases.configure()`, `Purchases.logIn(orgId)`, `Purchases.logOut()` |
| `productIds.ts` | `PRODUCT_IDS` constant, `productIdFor(tier, period)`, `ENTITLEMENT_ID`, `OFFERING_ID` |
| `useSubscription.ts` | Single source of truth — reads `org.subscription` from Firestore, computes `effectiveTier` + `limits` + `canAddMember` etc. |
| `types.ts` | `PlanTier`, `SubscriptionStatus`, `Subscription`, `PlanLimits`, `OrgCounters` |
| `limits.ts` | `PLAN_LIMITS`, `PLAN_LABELS`, `PLAN_PRICING_INR`, `nextTierAbove` |
| `errors.ts` | Error code → user-facing message mapping |
| `usePaywall.tsx` | Provider + hook for triggering the paywall sheet from anywhere |
| `PaywallSheet.tsx` | Bottom sheet that explains the limit + routes to `/subscription` |

### `initRevenueCat.ts` pattern

```ts
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const RC_API_KEY_IOS = 'appl_…';        // public — paste from RC dashboard
const RC_API_KEY_ANDROID = 'goog_…';

let configured = false;

export function initRevenueCat(): void {
  if (configured) return;               // idempotent — strict-mode safe
  configured = true;
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({
    apiKey: Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID,
  });
}

export async function identifyOrgWithRevenueCat(orgId: string): Promise<void> {
  if (!configured) initRevenueCat();
  if (!orgId) return;
  try { await Purchases.logIn(orgId); }
  catch (err) { console.warn('[initRevenueCat] logIn failed:', err); }
}

export async function clearRevenueCatIdentity(): Promise<void> {
  if (!configured) return;
  try { await Purchases.logOut(); }
  catch (err) { console.warn('[initRevenueCat] logOut failed:', err); }
}
```

### Lifecycle wiring

**`app/_layout.tsx`** — at the root, before any auth gate:
```ts
useEffect(() => { initRevenueCat(); }, []);
```

**`app/(app)/_layout.tsx`** — after the active org is known:
```ts
useEffect(() => {
  if (primaryOrgId) void identifyOrgWithRevenueCat(primaryOrgId);
}, [primaryOrgId]);
```

On sign-out, call `clearRevenueCatIdentity()` from your auth path so the next user's purchases don't get attached to the previous app user id.

### `useSubscription` — single source of truth on the client

```ts
const { subscription, effectiveTier, limits, counters,
        canAddMember, canAddProject, storageUsagePercent, loading
      } = useSubscription();
```

Key invariant: **`effectiveTier` collapses to `free` when `status` is `expired` / `cancelled` / `past_due`** — this mirrors the server's `effectiveLimits()` exactly so the client can't accidentally let actions through that the server will reject.

```ts
const ACTIVE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set(['active', 'trialing']);
const isActive = ACTIVE_STATUSES.has(sub.status);
const effectiveTier: PlanTier = isActive ? sub.tier : 'free';
```

UI gates always use `effectiveTier`/`limits`. `subscription.tier` is the raw doc field (used in the "your subscription expires on …" copy).

---

## 5. Apple-required UI elements

App Store Review Guidelines that bite if you skip them:

### 3.1.1 — Working purchase flow
If you advertise paid tiers in-app, the purchase flow MUST work. Showing "Coming soon" or "We'll email you" while displaying prices and CTAs is a confirmed rejection trigger. Even if the SDK isn't fully wired, you can't ship the prices.

### 3.1.2(a) — Auto-renewal disclosure
Must be visible on the purchase screen, BEFORE the user taps Subscribe. EXACT wording (rephrase carefully or use ours verbatim):

> *Payment will be charged to your Apple ID account at confirmation of purchase. Subscriptions auto-renew at the same price and period unless turned off at least 24 hours before the end of the current period. Manage or cancel your subscription at any time from your Apple ID Settings.*

For Android, swap "Apple ID" → "Google Play" and "Apple ID Settings" → "Google Play account".

### Privacy Policy + Terms of Service
Tappable links accessible from the purchase screen. Both URLs must be live + readable + match what's on App Store Connect's Privacy section.

### Restore Purchases — reachable from BOTH paywall AND a settings entry
Apple specifically requires this — if a user installs on a new device, they must be able to restore without re-buying. We put it in TWO places:

1. **Paywall / `/subscription`** — a dedicated button at the bottom
2. **More tab → Billing & subscription** row that routes to `/subscription`

Both paths reach the Restore button.

### Implementation pattern
Restore button:
```ts
async function restorePurchases() {
  try {
    const customerInfo = await Purchases.restorePurchases();
    if (customerInfo.entitlements.active['paid']) {
      Alert.alert('Subscription restored', '…');
    } else {
      Alert.alert('Nothing to restore', '…');
    }
  } catch (err) {
    Alert.alert('Restore failed', (err as { message?: string })?.message ?? 'Please try again.');
  }
}
```

### Submission notes for App Review
Include sandbox tester credentials so the reviewer can complete a test purchase. They WILL test it — Guideline 3.1.1.

---

## 6. The Expo SDK 54 + RN 0.81 + prebuilt RN hermes gotcha

**This section is the reason this document exists.** With this stack, an out-of-the-box archive build will:

1. Fail to compile (Layer 1 + Layer 2)
2. Fail to link (Layer 3)
3. Successfully archive but **crash at launch on TestFlight** with `Library not loaded: @rpath/hermes.framework/hermes` (Layer 4)

Layer 4 is the cruel one — your archive succeeds, you upload to TestFlight, processing completes, you install via TestFlight, you tap the icon, and it bounces straight back to home. You have to dig the crash report out of `Settings → Privacy → Analytics Data` to see why.

The fix is **4 idempotent patches in `ios/Podfile`'s `post_install` hook**. Paste this verbatim into the next project (rename `SiteExpens` → your target name):

```ruby
post_install do |installer|
  react_native_post_install(
    installer,
    config[:reactNativePath],
    :mac_catalyst_enabled => false,
    :ccache_enabled => ccache_enabled?(podfile_properties),
  )

  require 'fileutils'
  pods_root = File.expand_path('Pods', __dir__)
  hermes_destroot = File.join(pods_root, 'hermes-engine', 'destroot')

  # 1. Restore missing hermes destroot from CocoaPods cache.
  if Dir.exist?(hermes_destroot) && !Dir.exist?(File.join(hermes_destroot, 'include'))
    cache_pattern = File.expand_path(
      '~/Library/Caches/CocoaPods/Pods/External/hermes-engine/*/destroot',
    )
    cache_destroot = Dir.glob(cache_pattern).first
    if cache_destroot
      %w[include Library].each do |dir|
        src = File.join(cache_destroot, dir)
        dst = File.join(hermes_destroot, dir)
        if Dir.exist?(src) && !Dir.exist?(dst)
          puts "[hermes-patch] Restoring #{dir} from CocoaPods cache"
          FileUtils.cp_r(src, dst)
        end
      end
    end
  end

  # 2. Inject hermes header path into every pod's HEADER_SEARCH_PATHS.
  hermes_header_path = '"${PODS_ROOT}/hermes-engine/destroot/include"'
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      existing = config.build_settings['HEADER_SEARCH_PATHS']
      next if existing.is_a?(String) && existing.include?('hermes-engine/destroot/include')
      next if existing.is_a?(Array) && existing.any? { |p| p.include?('hermes-engine/destroot/include') }

      normalised = case existing
                   when nil then ['$(inherited)']
                   when String then [existing]
                   else existing
                   end
      normalised << hermes_header_path
      config.build_settings['HEADER_SEARCH_PATHS'] = normalised
    end
  end

  # 3. Link hermes.framework into the app target.
  hermes_fw_search = '"${PODS_ROOT}/hermes-engine/destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64"'
  installer.aggregate_targets.each do |aggregate|
    aggregate.user_build_configurations.each do |config_name, _|
      xcconfig_path = aggregate.xcconfig_path(config_name)
      next unless File.exist?(xcconfig_path)
      contents = File.read(xcconfig_path)
      changed = false
      unless contents.include?('-framework "hermes"')
        contents.sub!(/^(OTHER_LDFLAGS = .*)$/) { "#{Regexp.last_match(1)} -framework \"hermes\"" }
        changed = true
      end
      unless contents.include?('hermes.xcframework/ios-arm64')
        contents.sub!(/^(FRAMEWORK_SEARCH_PATHS = .*)$/) { "#{Regexp.last_match(1)} #{hermes_fw_search}" }
        changed = true
      end
      File.write(xcconfig_path, contents) if changed
      puts "[hermes-patch] Patched #{File.basename(xcconfig_path)}" if changed
    end
  end

  # 4. Embed + sign hermes.framework via custom Build Phase (Release + Debug).
  user_project_path = File.expand_path('SiteExpens.xcodeproj', __dir__)
  if File.directory?(user_project_path)
    user_project = Xcodeproj::Project.open(user_project_path)
    app_target = user_project.targets.find { |t| t.name == 'SiteExpens' }
    if app_target
      phase_name = '[hermes-patch] Embed hermes.framework'
      existing = app_target.shell_script_build_phases.find { |p| p.name == phase_name }
      unless existing
        phase = app_target.new_shell_script_build_phase(phase_name)
        phase.shell_script = <<~SH
          set -e
          case "$EFFECTIVE_PLATFORM_NAME" in
            *simulator) SLICE="ios-arm64_x86_64-simulator" ;;
            *)          SLICE="ios-arm64" ;;
          esac
          SRC="${PODS_ROOT}/hermes-engine/destroot/Library/Frameworks/universal/hermes.xcframework/${SLICE}/hermes.framework"
          DST="${BUILT_PRODUCTS_DIR}/${PRODUCT_NAME}.app/Frameworks/hermes.framework"
          if [ ! -d "$SRC" ]; then
            echo "warning: [hermes-patch] source slice not found at $SRC; skipping embed"
            exit 0
          fi
          mkdir -p "$(dirname "$DST")"
          if [ -d "$DST" ] && diff -rq "$SRC/hermes" "$DST/hermes" > /dev/null 2>&1; then
            echo "[hermes-patch] hermes.framework already up-to-date for $SLICE"
          else
            echo "[hermes-patch] Embedding hermes.framework ($SLICE)"
            rm -rf "$DST"
            /usr/bin/ditto "$SRC" "$DST"
            /usr/bin/xattr -cr "$DST"
          fi
          if [ -n "${EXPANDED_CODE_SIGN_IDENTITY}" ] && [ "${CODE_SIGNING_REQUIRED:-NO}" != "NO" ]; then
            echo "[hermes-patch] Signing hermes.framework"
            /usr/bin/codesign --force --sign "${EXPANDED_CODE_SIGN_IDENTITY}" --preserve-metadata=identifier,entitlements,flags --timestamp=none "$DST"
          fi
        SH
        phase.input_paths = [
          '$(PODS_ROOT)/hermes-engine/destroot/Library/Frameworks/universal/hermes.xcframework/ios-arm64/hermes.framework/hermes',
        ]
        phase.output_paths = [
          '$(BUILT_PRODUCTS_DIR)/$(PRODUCT_NAME).app/Frameworks/hermes.framework/hermes',
        ]
        # Run AFTER "[CP] Embed Pods Frameworks" so we override its (broken) copy.
        embed_idx = app_target.build_phases.index do |p|
          p.respond_to?(:name) && p.name == '[CP] Embed Pods Frameworks'
        end
        if embed_idx
          our_idx = app_target.build_phases.index(phase)
          app_target.build_phases.move(phase, embed_idx + 1) if our_idx && our_idx <= embed_idx
        end
        user_project.save
        puts '[hermes-patch] Added "Embed hermes.framework" Build Phase'
      end
    end
  end
end
```

### How to verify each patch landed

After `pod install`:
```bash
# Patch 1 — destroot has all 3 dirs:
ls ios/Pods/hermes-engine/destroot/
# → bin  include  Library

# Patch 2 — at least one pod xcconfig has the hermes header path:
grep -l 'hermes-engine/destroot/include' "ios/Pods/Target Support Files/"*/*.xcconfig | head -3

# Patch 3 — app xcconfig has -framework hermes:
grep -E '^OTHER_LDFLAGS' "ios/Pods/Target Support Files/Pods-SiteExpens/Pods-SiteExpens.release.xcconfig" | grep -- '-framework "hermes"'

# Patch 4 — pod install log printed: '[hermes-patch] Added "Embed hermes.framework" Build Phase'
```

After `xcodebuild archive`:
```bash
# hermes.framework is embedded:
ls ~/Library/Developer/Xcode/Archives/<date>/<archive>.xcarchive/Products/Applications/<app>.app/Frameworks/
# → React.framework  ReactNativeDependencies.framework  hermes.framework

# Binary records the right rpath dependency:
otool -L ~/Library/.../<app>.app/<app> | grep hermes
# → @rpath/hermes.framework/hermes (compatibility version 0.12.0, current version 0.12.0)
```

### Why each patch is necessary (summary)
| Patch | Symptom if missing | Why default doesn't work |
|---|---|---|
| 1 | `'hermes/hermes.h' file not found` (compile) | hermes-engine pod sometimes installs only `bin/`, missing headers + framework binary |
| 2 | `'hermes/hermes.h' file not found` (compile, in transitive pods) | Pod xcconfigs only include direct deps; many pods transitively include hermes via React-hermes umbrella |
| 3 | `Undefined symbols: hermes::vm::*` (link) | App's `OTHER_LDFLAGS` doesn't include `-framework hermes` |
| 4 | TestFlight launch crash: `Library not loaded: @rpath/hermes.framework/hermes` (runtime) | `Pods-SiteExpens-frameworks.sh` source path `${PODS_XCFRAMEWORKS_BUILD_DIR}/hermes-engine/Pre-built/` not populated for archive intermediate |

---

## 7. Build & ship checklist

### Source-of-truth files for version bumps

When bumping versions, update **ALL THREE** in lock-step:

| File | What to change |
|---|---|
| `app.json` | `expo.version` (semver, user-visible), `expo.ios.buildNumber` (string), `expo.android.versionCode` (integer) |
| `ios/SiteExpens/Info.plist` | `CFBundleShortVersionString` (matches `expo.version`), `CFBundleVersion` (matches `ios.buildNumber`) |
| `android/app/build.gradle` | `versionName "1.0.4"`, `versionCode 10` |

> **Why redundantly?** Expo prebuild syncs `app.json` → native files, but if you've already prebuilt and edited natively, the source-of-truth is split. Bumping all three avoids the "Apple says version X but I see Y" debugging session.

### `pod install` (UTF-8 encoding workaround)

On macOS with Homebrew Ruby 4.x, CocoaPods crashes with `Encoding::CompatibilityError: Unicode Normalization not appropriate for ASCII-8BIT` unless LANG is set:

```bash
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
```

Add to your `~/.zshrc` to make this permanent:
```bash
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

### Archive command (the one that worked)

```bash
cd ios && LANG=en_US.UTF-8 xcodebuild archive \
  -workspace SiteExpens.xcworkspace \
  -scheme SiteExpens \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ~/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/SiteExpens-1.0.4-build10.xcarchive \
  -allowProvisioningUpdates \
  COMPILER_INDEX_STORE_ENABLE=NO
```

**Why each flag:**
- `-allowProvisioningUpdates` — tells Xcode to fetch / refresh distribution profiles automatically. Without this, Xcode picks the first matching profile in your keychain — often a **development** profile, which gives you `aps-environment=development` + `get-task-allow=true`. Apple sometimes lets that through, but it's wrong.
- `-destination 'generic/platform=iOS'` — Apple-only archive; no simulator slice in the .ipa.
- `COMPILER_INDEX_STORE_ENABLE=NO` — skip clang's index store; archive is faster and you don't need code-completion for a build artifact.

Expected log tail: `** ARCHIVE SUCCEEDED **`.

### Export to .ipa with `ExportOptions.plist`

Create `/tmp/ExportOptions.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>           <string>app-store-connect</string>
  <key>teamID</key>           <string>YOUR_TEAM_ID</string>
  <key>destination</key>      <string>export</string>
  <key>signingStyle</key>     <string>automatic</string>
  <key>stripSwiftSymbols</key><true/>
  <key>uploadBitcode</key>    <false/>
  <key>uploadSymbols</key>    <true/>
</dict>
</plist>
```

Export:
```bash
LANG=en_US.UTF-8 xcodebuild -exportArchive \
  -archivePath ~/Library/Developer/Xcode/Archives/<date>/<archive>.xcarchive \
  -exportPath /tmp/build10-export \
  -exportOptionsPlist /tmp/ExportOptions.plist \
  -allowProvisioningUpdates
```

Output: `/tmp/build10-export/SiteExpens.ipa` (~25 MB).

### Verify the IPA before uploading

```bash
# 1. hermes.framework is embedded
unzip -l /tmp/build10-export/SiteExpens.ipa | grep 'Frameworks/.*\.framework/$' | sort -u
# Expect: React.framework  ReactNativeDependencies.framework  hermes.framework

# 2. Production entitlements (NOT development)
cd /tmp && rm -rf ipa-inspect && mkdir ipa-inspect && cd ipa-inspect && unzip -q /tmp/build10-export/SiteExpens.ipa
codesign -d --entitlements - Payload/SiteExpens.app
# Expect:
#   aps-environment      = production         (NOT development)
#   beta-reports-active  = true               (TestFlight feedback enabled)
#   get-task-allow       = false              (NOT true — that's dev only)
```

If `aps-environment = development` or `get-task-allow = true`, the archive was signed with a development profile — re-archive with `-allowProvisioningUpdates`.

### Upload via Transporter

1. Open `Transporter.app` (App Store)
2. Sign in with Apple ID
3. Drag `SiteExpens.ipa` into the window
4. Wait ~10 seconds for validation → click **Deliver**
5. Watch progress, expect "Delivery successful"

### Common upload rejections

> *"The bundle version must be higher than the previously uploaded version: 'X'"*

Apple's record of your latest build is stuck at X. Most common cause: a previous upload was rejected during initial scan but Apple's record still incremented. **Bump CFBundleVersion well past X** (we jumped from 5 to 10) and re-archive. Don't waste time trying to find why X is what it is — just clear it.

> *"The provided entity includes an attribute with a value that has already been used (-19232)"*

Same root cause as above — uniqueness violation. Same fix.

---

## 8. Sandbox testing flow

### iPhone setup (one-time)
- **Settings → App Store → scroll to bottom → Sandbox Account → Sign In** with one of your sandbox tester credentials
- DO NOT sign out of your real Apple ID — Sandbox is a separate slot. Real purchases keep working.

### TestFlight install
- Apple emails "Your build is ready to test" once App Store Connect finishes processing (~5-15 min after upload)
- Open TestFlight on iPhone → install your app

### The actual test
1. Open the app → trigger the paywall (try an action gated by the limits you set)
2. Tap any tier → Apple sheet slides up showing **`[Environment: Sandbox]`** label
3. Confirm with sandbox tester password (or Face ID if you've signed in before)
4. Apple shows "You're all set"
5. Within ~16 seconds, the paywall dismisses + the gated action now works

### Verify the webhook fired
```bash
firebase functions:log --only revenueCatWebhook --lines 20
```
Look for an INFO entry around the same timestamp as your tap. Should be a 200.

### Verify Firestore updated
Either via the Firebase Console (`organizations/{orgId}` → expand `subscription` field) or via CLI:
```bash
# Use Firebase MCP or a quick admin script — we used:
mcp__plugin_firebase_firebase__firestore_list_documents \
  --parent='projects/YOUR_PROJECT/databases/(default)/documents' \
  --collectionId='organizations'
```

Expected on the org you tested:
```
subscription:
  tier:        "solo"            (or whatever you bought)
  status:      "active"
  productId:   "interioros.solo.monthly"
  period:      "monthly"
  source:      "webhook"         (NOT "manual" or "migration")
  expiresAt:   <24h ahead>       (sandbox = 1 month accelerated to 24h)
  willRenew:   true
  updatedAt:   <within 16s of tap>
```

### Sandbox-accelerated cycles
| Real period | Sandbox time |
|---|---|
| 1 week | ~3 min |
| 1 month | ~5 min |
| 2 months | ~10 min |
| 3 months | ~15 min |
| 6 months | ~30 min |
| 1 year | ~1 hour |

Watch 2-3 renewal cycles fire before submitting to App Review. Webhook should land each time with `event.type = RENEWAL`.

### Cancellation testing
- iPhone Settings → App Store → Sandbox Account → tap your tester → tap the active subscription → cancel
- RC fires `CANCELLATION` event → webhook sets `org.subscription.status = 'cancelled'` and `willRenew = false`
- Tier stays at the paid value until `expiresAt`
- After expiry: `EXPIRATION` event → tier collapses to `free`

---

## 9. Edge cases & UX guarantees

The system already handles these correctly without any extra UI work:

| Scenario | What happens |
|---|---|
| User dismisses Apple sheet (cancel) | `purchasePackage()` rejects with `userCancelled: true` — handle silently, NO Alert |
| User backgrounds app mid-purchase | Apple completes the transaction in the system process. App-side promise may not resolve, but webhook fires. App reopens → snapshot delivers new tier. |
| App force-quits mid-purchase | StoreKit transaction queue persists. Next launch, RC SDK reconciles, webhook fires. |
| Phone offline during purchase | Apple queues. RC retries webhook 3× over 1h on connectivity return. |
| Cloud Function down briefly | RC retries webhook 3× exponential backoff. Manual replay from RC dashboard if needed. |
| User taps Subscribe twice | StoreKit dedupes at the system level. UI also has a `setBusy(true)` guard. |
| Mid-cycle upgrade Solo → Studio | Apple shows "Upgrade Subscription" with prorated price. Two webhook events fire (~1s apart): cancellation of Solo, INITIAL_PURCHASE of Studio. Final state on Firestore = Studio active. |
| Mid-cycle downgrade Studio → Solo | Scheduled at next renewal. User keeps Studio until expiry. RC fires PRODUCT_CHANGE on the actual switch. |
| Webhook delivery delayed 30s | The "vulnerable window" — UI shows old tier, server enforces old limits. Rare in practice; we don't add optimistic updates because the complexity isn't worth the 1-30 second improvement. |

### What you do NOT need to build
- "Don't close the app" warning during purchase — false anxiety, purchases can't fail by closing
- Periodic `Purchases.getCustomerInfo()` polling — the snapshot listener delivers updates
- Receipt re-validation on app foreground — RC handles automatically

---

## 10. Production-quality decisions (and why)

| Decision | Why correct |
|---|---|
| App User ID = orgId (not user uid) | Entitlement attaches to the studio. Owner switches phones, hands the studio to another admin — subscription stays. |
| Idempotent Podfile patches | Survives every `pod install` without manual repair. `pod install` runs CI, devs, and EAS — must work in all three. |
| Direct hermes embed (Patch 4) vs relying on xcframework intermediate | The intermediate isn't populated for archive builds. Embedding from the destroot directly is the only deterministic path. |
| Webhook auth tolerant of `Bearer ` prefix | RC sends what the operator typed in the dashboard. Tolerant compare = fewer 4 AM debugging sessions. |
| `useSubscription` reads from Firestore, not RC SDK | One snapshot = unlimited UI gates with no extra round-trip. RC is only called for purchase/restore. |
| `webhookEvents/{eventId}` dedupe | RC retries on 5xx with same id. Without dedupe, retried INITIAL_PURCHASE could shift `expiresAt` forward incorrectly during race. |
| `effectiveTier` collapses to `free` on expired/cancelled | Mirrors server's `effectiveLimits()` exactly — client and server agree on what user can do. |
| `billing.manage` = Studio Owner only | Apple ID is per-device. Two admins on two phones could double-charge. |
| Restore reachable from paywall AND More tab | Apple Guideline 3.1.1 explicitly requires both paths. |
| Auto-renewal terms verbatim Apple wording | Slightly off wording = rejection. Copy theirs verbatim. |
| `signingStyle: automatic` + `-allowProvisioningUpdates` | Distribution profile fetched/refreshed automatically. Manual signing = "wrong profile picked" debugging. |
| StoreKit Configuration file in scheme | Lets developers test purchases on Simulator without TestFlight propagation (~15 min savings per test cycle). |
| StudioAvatar = logo OR neutral icon, no random color palette | Consistent branding. The studio's logo carries identity, not a hash-based hue. |
| PlanBadge tier icons (leaf/star/diamond/trophy) | Reads intuitively without label. Tier identity from icon, not color riot. |
| Per-org `memberPublic` listener for owner names | Rules-safe (clients can't read other members' private user docs). Updates flow when ownership changes. |
| `OWNER_ONLY_CAPS` array | Easy to extend later (analytics export, account deletion, etc.). Self-documenting. |

---

## 11. Permission gating pattern

In `src/features/org/permissions.ts`:

```ts
/** Capabilities granted ONLY to the Studio Owner (Super Admin), even
 *  when other privileged roles like Admin get everything else. */
const OWNER_ONLY_CAPS: Capability[] = ['billing.manage'];

function capsFor(role: RoleKey): Set<Capability> {
  switch (role) {
    case 'superAdmin':
      return new Set<Capability>([...ALL_CAPS, ...OWNER_ONLY_CAPS]);
    case 'admin':
      // Admin gets everything operational EXCEPT owner-only.
      return new Set(ALL_CAPS);
    // ... other roles
  }
}
```

In a screen:
```ts
const { can } = usePermissions();
const canManageBilling = can('billing.manage');

return (
  <ScrollView>
    {/* Always shown — usage stats */}
    <CurrentPlanCard {...} />

    {canManageBilling ? (
      <>
        {/* Plan picker, Restore button, terms block */}
      </>
    ) : (
      <View style={styles.adminOnlyNote}>
        <Ionicons name="lock-closed-outline" size={16} color={color.textMuted} />
        <Text variant="bodyStrong" color="text">
          Plan changes are managed by the Studio Owner
        </Text>
        <Text variant="meta" color="textMuted">
          Subscriptions are tied to the Apple ID on the owner's device,
          so only the Studio Owner can upgrade or downgrade. Ask your
          owner to change the plan from their phone.
        </Text>
      </View>
    )}
  </ScrollView>
);
```

**Reusable pattern**: usage card always visible + read-only footer hint with lock icon for non-managers.

---

## 12. Common errors → fix lookup table

| Error / symptom | Cause | Fix |
|---|---|---|
| `fatal error: 'hermes/hermes.h' file not found` (compile) | hermes-engine destroot incomplete OR header path missing in xcconfig | Patches 1 + 2 in Podfile |
| `Undefined symbols for architecture arm64: hermes::vm::*` (link) | `-framework hermes` missing from app's `OTHER_LDFLAGS` | Patch 3 |
| TestFlight: `EXC_CRASH (SIGABRT) DYLD 1 Library missing: @rpath/hermes.framework/hermes` | hermes.framework linked but not embedded into `.app/Frameworks/` | Patch 4 |
| Webhook returns 401 | Auth header mismatch | `firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH` with same value as RC dashboard. Bearer tolerant on both sides. |
| Webhook returns 200 but `org.subscription` doesn't update | `event.app_user_id` is null | Verify `Purchases.logIn(orgId)` ran on client BEFORE the purchase |
| Webhook 200 but log says "Unknown product_id" | Product ID mismatch between client/server/RC dashboard | Triple-check IDs match in: App Store Connect, RC dashboard, `productIds.ts`, `productIdMap.ts` |
| `userCancelled` thrown from `purchasePackage` | Normal — user dismissed sheet | Catch silently. Do NOT show Alert. |
| Purchase reports success but `entitlements.active['paid']` is undefined | Sandbox/production receipt routing drift | Wait 10s and pull-to-refresh. Usually transient. |
| Transporter: `must be higher than '<N>'` | Apple's record stuck on stale build (often a rejected upload that incremented the counter) | Bump CFBundleVersion well past N (we went 5 → 10) |
| `pod install` crashes with `Encoding::CompatibilityError` | macOS Ruby + non-UTF-8 LANG | `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install` |
| Archive's IPA has `aps-environment = development` | Xcode picked development profile during archive | Add `-allowProvisioningUpdates` to xcodebuild archive command |
| Simulator build fails: `cannot link directly with 'SwiftUICore'` | Xcode 16+ generates `__preview.dylib` for SwiftUI Previews; preview dylib not allowed to link SwiftUICore | `xcodebuild ... ENABLE_DEBUG_DYLIB=NO` |
| Simulator build fails: stripped Release symbols missing | Prebuilt RN ships only Release archive; Debug-only classes (`RCTPackagerConnection`, etc.) absent | Skip Simulator IAP testing — use TestFlight + sandbox tester. Or set `ios.buildReactNativeFromSource: true` in `Podfile.properties.json` (slows archives 5×). |
| RC dashboard "Send test event" returns network error | Webhook URL wrong or function not deployed | `firebase deploy --only functions:revenueCatWebhook` and check Cloud Functions Console for the URL |
| App crashes on launch in TestFlight, dSYM warnings on upload | Missing dSYM for `React.framework` and `ReactNativeDependencies.framework` (prebuilt RN limitation) | Non-blocking. Crashes in YOUR code still symbolicate. Expected. |

---

## 13. File reference

| File | Role |
|---|---|
| `src/features/billing/initRevenueCat.ts` | Configure SDK + `logIn(orgId)` + `logOut()` |
| `src/features/billing/productIds.ts` | `PRODUCT_IDS` + `productIdFor()` + `ENTITLEMENT_ID` + `OFFERING_ID` |
| `src/features/billing/useSubscription.ts` | Reads Firestore → returns `subscription` + `effectiveTier` + `limits` + `canAddMember` etc. |
| `src/features/billing/types.ts` | `PlanTier`, `SubscriptionStatus`, `Subscription`, `PlanLimits`, `OrgCounters` |
| `src/features/billing/limits.ts` | `PLAN_LIMITS`, `PLAN_LABELS`, `PLAN_PRICING_INR`, `nextTierAbove()` |
| `src/features/billing/PaywallSheet.tsx` | Limit-reached sheet (routes to `/subscription`) |
| `src/features/billing/usePaywall.tsx` | `<PaywallProvider>` + `usePaywall()` for triggering from anywhere |
| `app/_layout.tsx` | `useEffect(() => { initRevenueCat(); }, [])` at root |
| `app/(app)/_layout.tsx` | `useEffect(() => { void identifyOrgWithRevenueCat(orgId) }, [orgId])` |
| `app/(app)/subscription.tsx` | Plan picker + purchase flow + Restore + Apple-required terms (gated by `billing.manage`) |
| `app/(app)/(tabs)/chats.tsx` | More tab — entry point to subscription screen |
| `src/ui/PlanBadge.tsx` | Reusable tier badge (icon + label, sm/md sizes) |
| `src/ui/StudioAvatar.tsx` | Reusable studio tile (logo OR neutral icon) |
| `src/features/org/permissions.ts` | `Capability` type + `OWNER_ONLY_CAPS` + role-to-caps matrix |
| `src/features/org/useMyOrganizations.ts` | Per-org snapshot returning `{ logoUrl, tier, ownerName, ... }` |
| `functions/src/billing/revenueCatWebhook.ts` | Cloud Function — auth + dedupe + Firestore write |
| `functions/src/billing/productIdMap.ts` | Server mirror of `productIds.ts` (must stay in sync) |
| `ios/Podfile` | 4-patch `post_install` hook (lines 55-228) |
| `ios/Configuration.storekit` | StoreKit local config — all 6 products mirrored, INR pricing |
| `ios/SiteExpens.xcodeproj/.../SiteExpens.xcscheme` | StoreKit reference inside `LaunchAction` |
| `app.json`, `ios/SiteExpens/Info.plist`, `android/app/build.gradle` | Version bumps in lock-step |

---

## 14. Future-proofing notes

- **Expo SDK 55 / RN 0.82 release**: Re-test the 4 hermes patches. Apple may fix the prebuilt embed in a later RN release; if so, Patch 4 becomes a no-op (idempotent guard already protects against double-add).
- **Android SDK key**: Currently a placeholder (`goog_PASTE_FROM_REVENUECAT_DASHBOARD`) in `initRevenueCat.ts`. Wire when Play Store submission is ready.
- **Optimistic local tier flip**: Currently we wait for the webhook (~1-3 sec). If the UX team wants instant, set `org.subscription` locally in the success branch of `purchasePackage()` and let webhook reconcile. Adds ~30 lines + edge cases. Skipped intentionally.
- **Promo codes / Family Sharing / introductory offers**: All supported by RevenueCat; configured per-product in App Store Connect. Not wired today. Add when marketing wants press-codes or 7-day trials.
- **Receipt re-validation on app foreground**: RevenueCat handles this automatically via `Purchases.invalidateCustomerInfoCache()` on focus. Document if you ever need to force it (after a server-side override, etc.).
- **`system/planConfig` admin override**: The architecture supports App Owner edits to plan limits via Firestore. The portal UI is out of scope today; `limits.ts` is the source of truth until then.

---

## Appendix A — `ExportOptions.plist` (paste-able)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>QWW8YD6KZV</string>
  <key>destination</key>
  <string>export</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
```

---

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| **StoreKit** | Apple's IAP framework (`StoreKit.framework`). The system process that shows the purchase sheet and validates Face ID. |
| **Subscription Group** | Apple's container for related subscriptions. Upgrades/downgrades only work within a group. |
| **Auto-Renewable Subscription** | The product type for monthly/annual recurring billing. Different from "Non-Renewing Subscription" (one-time time-bound) and "Consumable" (in-game currency). |
| **Entitlement** | RevenueCat's abstraction of "what the user has access to." We use one (`paid`) granted by any non-free product. |
| **Offering** | RevenueCat's bundle of packages shown to the user. We use one (`default`) containing 6 packages. |
| **Package** | An individual purchase option inside an offering — links a product ID to a UX-friendly identifier (`$rc_monthly`, `solo_annual`, etc.). |
| **App User ID** | RevenueCat's identifier for "who is the customer." We set this = `orgId` so entitlements stick to the studio. |
| **Sandbox Tester** | An Apple-provided test account used to make fake purchases. Does NOT charge real money. Configured per-device under Settings → App Store → Sandbox Account. |
| **App-Specific Shared Secret** | Apple-generated string in App Store Connect → App Information. RevenueCat needs it to validate receipts. |
| **App Store Connect API Key** | Apple-generated `.p8` file. Lets RevenueCat auto-import products from App Store Connect. |
| **Server-to-Server Notification** | Apple's mechanism for telling RevenueCat (and us, via RC) about subscription events. Doesn't require the app to be open. |
| **TestFlight** | Apple's beta-testing distribution. Auto-installs once a build passes processing. Sandbox testers see `[Environment: Sandbox]` on the purchase sheet. |
| **Bundle ID / Bundle Identifier** | Reverse-DNS app identifier (`com.siteexpens.app`). Must match across Xcode, App Store Connect, and RevenueCat. |
| **dSYM** | Debug symbol files Apple uses to symbolicate crash reports. Prebuilt RN ships without them — known limitation, non-blocking. |
| **Provisioning Profile** | Apple's signed certificate that tells iOS "this app is allowed to run on these devices with these capabilities." Distribution vs Development variants. |
| **`@rpath`** | Runtime search path. `@rpath/hermes.framework/hermes` means "look for hermes.framework in the app's known runtime paths." Requires the framework to be embedded into the app bundle. |
| **xcframework** | Apple's container format for prebuilt frameworks across multiple architectures (arm64 device, arm64+x86_64 simulator, etc.). |

---

*Last updated after Build 10 sandbox test on 2026-05-07. The 4-patch Podfile, Bearer-tolerant webhook auth, and `OWNER_ONLY_CAPS` pattern are all production-tested.*
