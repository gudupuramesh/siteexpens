/**
 * Subscription — full-screen plan picker.
 *
 * Surfaces the four pricing tiers (Free / Solo / Studio / Agency)
 * as comparable cards in one vertical scroll. The card matching
 * the org's effective tier carries a CURRENT pill; the next tier
 * up carries a RECOMMENDED pill. Above the cards we render a
 * usage banner ("YOUR PLAN") for paid users showing renewal date
 * + storage / member / project counters against their limits.
 *
 * Data source:
 *  - `useSubscription()` (single source of truth on the client)
 *  - `PLAN_LIMITS / PLAN_LABELS / PLAN_TAGLINES / PLAN_PRICING_INR`
 *    from `src/features/billing/limits.ts`
 *
 * Purchase flow: Phase C is wired here. Tapping Upgrade calls
 * `Purchases.purchasePackage` from react-native-purchases (RevenueCat),
 * which presents the native Apple/Google purchase sheet. On success
 * the RevenueCat webhook updates `org.subscription` server-side and
 * `useSubscription` re-renders automatically — we don't need to do any
 * local mutation. The user sees "CURRENT" flip to the new tier within
 * ~1s of the purchase completing.
 *
 * Restore Purchases is Apple-required (App Store Review Guideline
 * 3.1.1). Reachable from the bottom of this screen AND the More tab
 * Account section (TODO: add there if not present).
 */
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_ORDER,
  PLAN_PRICING_INR,
  PLAN_TAGLINES,
  isUnlimited,
  nextTierAbove,
} from '@/src/features/billing/limits';
import { ENTITLEMENT_ID, productIdFor } from '@/src/features/billing/productIds';
import { useSubscription } from '@/src/features/billing/useSubscription';
import { usePermissions } from '@/src/features/org/usePermissions';
import type { PlanTier, SubscriptionPeriod, SubscriptionStatus } from '@/src/features/billing/types';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, screenInset, space } from '@/src/theme/tokens';

// ── Helpers ─────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(b >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${Math.max(0, b)} B`;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Annual savings vs. 12 × monthly, rounded to nearest %. */
function annualSavingsPercent(tier: PlanTier): number {
  const p = PLAN_PRICING_INR[tier];
  if (!p) return 0;
  const fullYear = p.monthly * 12;
  if (fullYear <= 0) return 0;
  return Math.round(((fullYear - p.annual) / fullYear) * 100);
}

const STATUS_TONE: Record<
  SubscriptionStatus,
  { fg: string; bg: string; label: string }
> = {
  active:    { fg: color.success,   bg: color.successSoft, label: 'ACTIVE' },
  trialing:  { fg: color.success,   bg: color.successSoft, label: 'TRIAL' },
  past_due:  { fg: color.warning,   bg: color.warningSoft, label: 'PAST DUE' },
  cancelled: { fg: color.danger,    bg: color.dangerSoft,  label: 'CANCELLED' },
  expired:   { fg: color.danger,    bg: color.dangerSoft,  label: 'EXPIRED' },
};

// ── Purchase + restore (RevenueCat) ────────────────────────────────
//
// `purchaseTier` resolves the right RevenueCat package for the (tier,
// period) combination, presents the native Apple/Google purchase
// sheet, and resolves once the user dismisses it (cancel) or the
// transaction completes (success / failure). Server-side, the
// RevenueCat webhook updates `org.subscription` within ~1s — the
// UI doesn't need to mutate state locally because `useSubscription`
// will re-render off the Firestore snapshot.

async function purchaseTier(
  tier: PlanTier,
  period: SubscriptionPeriod,
): Promise<'success' | 'cancelled' | 'error'> {
  const productId = productIdFor(tier, period);
  if (!productId) {
    Alert.alert(
      'Free plan',
      'You\'re already on the Free plan — no purchase needed.',
    );
    return 'cancelled';
  }
  try {
    const offerings = await Purchases.getOfferings();
    const pkg: PurchasesPackage | undefined =
      offerings.current?.availablePackages.find(
        (p) => p.product.identifier === productId,
      );
    if (!pkg) {
      Alert.alert(
        'Plan unavailable',
        `The ${PLAN_LABELS[tier]} ${period} plan isn\'t available right now. Please try again in a few minutes, or contact support.`,
      );
      return 'error';
    }
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
      // Webhook will land within ~1s and update org.subscription.
      // useSubscription re-renders automatically; we just close.
      return 'success';
    }
    // Edge case — purchase reported no error but entitlement isn't
    // active yet. Could be a sandbox/Production receipt drift; tell
    // the user to retry.
    Alert.alert(
      'Almost there',
      'Your purchase went through but we\'re still confirming with the store. Pull to refresh in a moment.',
    );
    return 'error';
  } catch (err: unknown) {
    if ((err as { userCancelled?: boolean })?.userCancelled) return 'cancelled';
    Alert.alert(
      'Purchase failed',
      (err as { message?: string })?.message ?? 'Please try again.',
    );
    return 'error';
  }
}

async function restorePurchases(): Promise<void> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
      Alert.alert(
        'Subscription restored',
        'Your subscription is active again. The new plan will reflect within a few seconds.',
      );
    } else {
      Alert.alert(
        'Nothing to restore',
        'No previous purchases were found on this Apple ID / Google account.',
      );
    }
  } catch (err) {
    Alert.alert(
      'Restore failed',
      (err as { message?: string })?.message ?? 'Please try again.',
    );
  }
}

// ── Legal links ────────────────────────────────────────────────────
//
// Apple requires Privacy Policy + Terms of Service to be reachable
// from the purchase screen. URLs come from app.json's expo block —
// same source the More tab uses, so what we surface in-app matches
// what was submitted to App Store / Play Store review.

async function openLegalUrl(
  key: 'privacyPolicy' | 'termsOfService',
  label: string,
): Promise<void> {
  const expoExtra = (Constants.expoConfig ?? {}) as Record<string, unknown>;
  const url = typeof expoExtra[key] === 'string' ? (expoExtra[key] as string) : '';
  if (!url) {
    Alert.alert(label, `${label} link is not configured yet.`);
    return;
  }
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert(label, `Cannot open ${url}`);
      return;
    }
    await Linking.openURL(url);
  } catch (err) {
    Alert.alert(label, (err as Error).message);
  }
}

// ── Screen ──────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const {
    subscription,
    limits,
    effectiveTier,
    counters,
    storageUsagePercent,
  } = useSubscription();
  const { can } = usePermissions();
  // STUDIO OWNER ONLY. Even Admins can't subscribe — Apple ID is
  // tied to one device, so two admins on two phones could end up
  // double-charging. See `billing.manage` JSDoc in permissions.ts
  // for the full reasoning.
  const canManageBilling = can('billing.manage');

  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  // `busyTier` tracks which row's CTA is mid-purchase so we can
  // disable all other CTAs during the transaction (you can't buy two
  // tiers at once, and the native sheet blocks input anyway).
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [restoring, setRestoring] = useState(false);

  const suggested = nextTierAbove(effectiveTier);

  const onUpgrade = async (tier: PlanTier) => {
    if (busyTier) return;
    setBusyTier(tier);
    try {
      const result = await purchaseTier(tier, period);
      if (result === 'success') {
        // Webhook will update org.subscription within ~1s; useSubscription
        // re-renders, the CURRENT pill flips to the new tier, no need
        // to navigate. Pop one level so the user sees the dashboard
        // with the new entitlement applied.
        if (router.canGoBack()) router.back();
      }
    } finally {
      setBusyTier(null);
    }
  };

  const onRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      await restorePurchases();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom nav header — back chevron + centered title. Same
          shape as select-company.tsx so iOS 26's Liquid Glass
          back button stays out of the way. */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(app)/(tabs)' as never);
          }}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={color.primary} />
          <Text variant="body" color="primary">Back</Text>
        </Pressable>
        <Text variant="rowTitle" color="text" style={styles.headerTitle}>
          Subscription
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* The usage card is the ONE element everyone sees — it
            shows the studio's current plan, member/project counts,
            and storage usage. For paid plans it also shows the
            renewal date. We always render it for non-owners (so
            they see SOMETHING), and keep the existing owner-side
            logic of "skip when on Free" since the Free plan card
            below already shows those limits. */}
        {effectiveTier !== 'free' || !canManageBilling ? (
          <>
            <Text style={styles.sectionLabel}>YOUR PLAN</Text>
            <CurrentPlanCard
              tier={effectiveTier}
              status={subscription.status}
              expiresAt={subscription.expiresAt?.toDate?.() ?? null}
              willRenew={subscription.willRenew}
              memberCount={counters.memberCount}
              maxMembers={limits.maxMembers}
              projectCount={counters.projectCount}
              maxProjects={limits.maxProjects}
              storageBytes={counters.storageBytes}
              maxStorageBytes={limits.maxStorageBytes}
              storageUsagePercent={storageUsagePercent}
            />
          </>
        ) : null}

        {canManageBilling ? (
          <>
            <View style={styles.chooseRow}>
              <Text style={styles.sectionLabel}>CHOOSE YOUR PLAN</Text>
              <PeriodToggle period={period} onChange={setPeriod} />
            </View>

            {PLAN_ORDER.map((tier) => (
              <PlanCard
                key={tier}
                tier={tier}
                period={period}
                isCurrent={tier === effectiveTier}
                isSuggested={!!suggested && tier === suggested}
                busy={busyTier === tier}
                disabled={busyTier !== null && busyTier !== tier}
                onUpgrade={() => void onUpgrade(tier)}
              />
            ))}

            {/* Apple-required auto-renewal disclosure block. App Store
                Review Guideline 3.1.2(a) requires the EXACT terms
                below to be visible on the purchase screen, BEFORE the
                user taps an upgrade CTA. Privacy Policy + Terms of
                Service links are also required and must be tappable
                from here. */}
            <View style={styles.termsBlock}>
              <Text style={styles.termsTitle}>Subscription terms</Text>
              <Text style={styles.termsBody}>
                Payment will be charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} account
                at confirmation of purchase. Subscriptions auto-renew at the same price and period
                unless turned off at least 24 hours before the end of the current period. Manage or
                cancel your subscription at any time from your{' '}
                {Platform.OS === 'ios' ? 'Apple ID Settings' : 'Google Play account'}.
              </Text>
              <View style={styles.termsLinks}>
                <Pressable
                  onPress={() => void openLegalUrl('privacyPolicy', 'Privacy Policy')}
                  hitSlop={8}
                >
                  <Text variant="metaStrong" color="primary">Privacy Policy</Text>
                </Pressable>
                <Text variant="meta" color="textFaint"> · </Text>
                <Pressable
                  onPress={() => void openLegalUrl('termsOfService', 'Terms of Service')}
                  hitSlop={8}
                >
                  <Text variant="metaStrong" color="primary">Terms of Service</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.fineprint}>
              Prices include applicable taxes. Billing is handled by the {Platform.OS === 'ios' ? 'App Store' : 'Google Play Store'}.
            </Text>

            <Pressable
              onPress={() => void onRestore()}
              disabled={restoring}
              hitSlop={8}
              style={({ pressed }) => [
                styles.restoreBtn,
                (pressed || restoring) && { opacity: 0.6 },
              ]}
              accessibilityLabel="Restore purchase"
            >
              {restoring ? (
                <ActivityIndicator size="small" color={color.primary} />
              ) : (
                <Ionicons name="refresh" size={16} color={color.primary} />
              )}
              <Text variant="bodyStrong" color="primary">
                {restoring ? 'Restoring…' : 'Restore purchase'}
              </Text>
            </Pressable>
          </>
        ) : (
          // Non-owner read-only footer. The studio owner is the
          // billing relationship — admins/managers/etc. can see
          // limits + usage but can't tap Upgrade. The hint
          // explicitly names "Studio Owner" so they know who to
          // ask, and `Apple ID is per-device` is implied by the
          // word "device" in the body copy.
          <View style={styles.adminOnlyNote}>
            <Ionicons name="lock-closed-outline" size={16} color={color.textMuted} />
            <View style={styles.adminOnlyBody}>
              <Text variant="bodyStrong" color="text">
                Plan changes are managed by the Studio Owner
              </Text>
              <Text variant="meta" color="textMuted" style={styles.adminOnlyHint}>
                Subscriptions are tied to the Apple ID on the owner's device,
                so only the Studio Owner can upgrade or downgrade. Ask your
                owner to change the plan from their phone.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Current plan card ───────────────────────────────────────────────

type CurrentPlanCardProps = {
  tier: PlanTier;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  willRenew: boolean;
  memberCount: number;
  maxMembers: number;
  projectCount: number;
  maxProjects: number;
  storageBytes: number;
  maxStorageBytes: number;
  storageUsagePercent: number;
};

function CurrentPlanCard(props: CurrentPlanCardProps) {
  const tone = STATUS_TONE[props.status];

  // Storage progress fill colour shifts as the bar fills up so the
  // user sees "you're getting close" before they hit a wall.
  const storageFill =
    props.storageUsagePercent >= 95
      ? color.danger
      : props.storageUsagePercent >= 80
      ? color.warning
      : color.primary;

  const renewalLine = (() => {
    if (!props.expiresAt) return null;
    if (props.willRenew) return `Renews ${formatDate(props.expiresAt)}`;
    return `Cancels on ${formatDate(props.expiresAt)}`;
  })();

  return (
    <View style={styles.usageCard}>
      <View style={styles.usageHead}>
        <Text variant="title" color="text">{PLAN_LABELS[props.tier]}</Text>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.fg }]}>
            {tone.label}
          </Text>
        </View>
      </View>
      {renewalLine ? (
        <Text variant="meta" color="textMuted" style={{ marginTop: 4 }}>
          {renewalLine}
        </Text>
      ) : null}

      <View style={styles.usageDivider} />

      {/* Storage */}
      <View style={styles.usageRow}>
        <Text variant="caption" color="textMuted">STORAGE</Text>
        <Text variant="metaStrong" color="text">
          {formatBytes(props.storageBytes)}
          <Text style={{ color: color.textFaint }}>
            {' / '}
            {isUnlimited(props.maxStorageBytes)
              ? 'Unlimited'
              : formatBytes(props.maxStorageBytes)}
          </Text>
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${props.storageUsagePercent}%`, backgroundColor: storageFill },
          ]}
        />
      </View>

      {/* Members */}
      <View style={[styles.usageRow, { marginTop: 14 }]}>
        <Text variant="caption" color="textMuted">MEMBERS</Text>
        <Text variant="metaStrong" color="text">
          {props.memberCount}
          <Text style={{ color: color.textFaint }}>
            {' / '}
            {isUnlimited(props.maxMembers) ? '∞' : props.maxMembers}
          </Text>
        </Text>
      </View>

      {/* Projects */}
      <View style={[styles.usageRow, { marginTop: 8 }]}>
        <Text variant="caption" color="textMuted">PROJECTS</Text>
        <Text variant="metaStrong" color="text">
          {props.projectCount}
          <Text style={{ color: color.textFaint }}>
            {' / '}
            {isUnlimited(props.maxProjects) ? '∞' : props.maxProjects}
          </Text>
        </Text>
      </View>
    </View>
  );
}

// ── Plan card ───────────────────────────────────────────────────────

type PlanCardProps = {
  tier: PlanTier;
  period: 'monthly' | 'annual';
  isCurrent: boolean;
  isSuggested: boolean;
  /** True while THIS card's purchase is in flight (shows spinner). */
  busy?: boolean;
  /** True while ANOTHER card's purchase is in flight (greys this CTA out). */
  disabled?: boolean;
  onUpgrade: () => void;
};

/** Qualitative feature matrix per tier. Limits-style features
 *  (members / projects / storage) are pulled live from PLAN_LIMITS;
 *  these are the value-prop bullets shown below them. */
const FEATURE_MATRIX: Record<
  PlanTier,
  { included: string[]; absent: string[] }
> = {
  free: {
    included: ['Site, CRM, Toolkit'],
    absent: ['Roles & permissions', 'Priority support'],
  },
  solo: {
    included: ['Site, CRM, Toolkit'],
    absent: ['Roles & permissions', 'Priority support'],
  },
  studio: {
    included: ['Site, CRM, Toolkit', 'Roles & permissions', 'Priority support'],
    absent: [],
  },
  agency: {
    included: [
      'Site, CRM, Toolkit',
      'Roles & permissions',
      'Priority support',
      'Multi-org switching',
    ],
    absent: [],
  },
};

function PlanCard({
  tier,
  period,
  isCurrent,
  isSuggested,
  busy = false,
  disabled = false,
  onUpgrade,
}: PlanCardProps) {
  const limits = PLAN_LIMITS[tier];
  const pricing = PLAN_PRICING_INR[tier];
  const features = FEATURE_MATRIX[tier];

  const headlinePrice = (() => {
    if (!pricing) return { main: 'Free', sub: 'Forever' };
    if (period === 'annual') {
      const monthlyEquiv = Math.round(pricing.annual / 12);
      const savings = annualSavingsPercent(tier);
      return {
        main: `${formatINR(pricing.annual)} / year`,
        sub:
          savings > 0
            ? `${formatINR(monthlyEquiv)}/mo · save ${savings}%`
            : `${formatINR(monthlyEquiv)}/mo`,
      };
    }
    return {
      main: `${formatINR(pricing.monthly)} / month`,
      sub: `or ${formatINR(pricing.annual)} / year`,
    };
  })();

  const ctaLabel = (() => {
    if (isCurrent) return null;
    // Up vs. down based on PLAN_ORDER index.
    return `Upgrade to ${PLAN_LABELS[tier]}`;
  })();

  return (
    <View
      style={[
        styles.card,
        isSuggested && styles.cardSuggested,
        isCurrent && styles.cardCurrent,
      ]}
    >
      {/* Title + pill */}
      <View style={styles.cardHead}>
        <Text variant="title" color="text">{PLAN_LABELS[tier]}</Text>
        {isCurrent ? (
          <View style={styles.cardPillCurrent}>
            <Text style={styles.cardPillCurrentText}>CURRENT</Text>
          </View>
        ) : isSuggested ? (
          <View style={styles.cardPillSuggested}>
            <Text style={styles.cardPillSuggestedText}>RECOMMENDED</Text>
          </View>
        ) : null}
      </View>
      <Text variant="meta" color="textMuted" style={styles.cardTagline}>
        {PLAN_TAGLINES[tier]}
      </Text>

      {/* Price block */}
      <View style={styles.priceBlock}>
        <Text style={styles.priceMain}>{headlinePrice.main}</Text>
        <Text variant="caption" color="textMuted" style={styles.priceSub}>
          {headlinePrice.sub}
        </Text>
      </View>

      <View style={styles.cardDivider} />

      {/* Limits — always rendered, every card uses the same shape so
          the visual comparison reads like a proper grid. */}
      <FeatureRow
        included
        label={
          isUnlimited(limits.maxMembers)
            ? 'Unlimited team members'
            : `${limits.maxMembers} team member${limits.maxMembers === 1 ? '' : 's'}`
        }
      />
      <FeatureRow
        included
        label={
          isUnlimited(limits.maxProjects)
            ? 'Unlimited projects'
            : `${limits.maxProjects} project${limits.maxProjects === 1 ? '' : 's'}`
        }
      />
      <FeatureRow
        included
        label={`${formatBytes(limits.maxStorageBytes)} storage`}
      />

      {/* Qualitative features */}
      {features.included.map((f) => (
        <FeatureRow key={f} included label={f} />
      ))}
      {features.absent.map((f) => (
        <FeatureRow key={f} included={false} label={f} />
      ))}

      {/* CTA */}
      {ctaLabel ? (
        <Pressable
          onPress={onUpgrade}
          disabled={busy || disabled}
          style={({ pressed }) => [
            styles.cta,
            isSuggested && styles.ctaPrimary,
            (busy || disabled) && { opacity: 0.5 },
            pressed && !busy && !disabled && { opacity: 0.85 },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={isSuggested ? '#fff' : color.primary} />
          ) : (
            <Text style={isSuggested ? styles.ctaTextPrimary : styles.ctaTextHollow}>
              {ctaLabel}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function FeatureRow({ included, label }: { included: boolean; label: string }) {
  return (
    <View style={styles.featureRow}>
      <Ionicons
        name={included ? 'checkmark-circle' : 'remove-circle-outline'}
        size={16}
        color={included ? color.success : color.textFaint}
      />
      <Text
        variant="body"
        color={included ? 'text' : 'textFaint'}
        style={styles.featureText}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Period toggle ───────────────────────────────────────────────────

function PeriodToggle({
  period,
  onChange,
}: {
  period: 'monthly' | 'annual';
  onChange: (p: 'monthly' | 'annual') => void;
}) {
  return (
    <View style={styles.toggleWrap}>
      <Pressable
        onPress={() => onChange('monthly')}
        style={[styles.toggleBtn, period === 'monthly' && styles.toggleBtnActive]}
      >
        <Text
          style={
            period === 'monthly'
              ? [styles.toggleLabel, styles.toggleLabelActive]
              : styles.toggleLabel
          }
        >
          Monthly
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('annual')}
        style={[styles.toggleBtn, period === 'annual' && styles.toggleBtnActive]}
      >
        <Text
          style={
            period === 'annual'
              ? [styles.toggleLabel, styles.toggleLabelActive]
              : styles.toggleLabel
          }
        >
          Yearly
        </Text>
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 80,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 80,
  },

  // Scroll
  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.huge,
  },

  // Section labels (mono caps)
  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  chooseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: 4,
  },

  // ── Current plan (usage) card
  usageCard: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    padding: space.md,
    marginBottom: 4,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  usageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  usageDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
    marginVertical: 14,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Status pill (used on the usage card)
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  statusPillText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Storage progress
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.surface,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Plan card
  card: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    padding: space.md,
    marginTop: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardCurrent: {
    // Subtle slate fill for the active plan so the user sees at a
    // glance which row is theirs even before reading the pill.
    backgroundColor: color.surface,
  },
  cardSuggested: {
    borderColor: color.primary,
    borderWidth: 1.5,
    backgroundColor: color.bg,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTagline: {
    marginTop: 4,
  },

  // Pills inside cards
  cardPillCurrent: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  cardPillCurrentText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textMuted,
    letterSpacing: 1,
  },
  cardPillSuggested: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: color.primarySoft,
  },
  cardPillSuggestedText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: 1,
  },

  // Price
  priceBlock: {
    marginTop: 12,
  },
  priceMain: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.4,
  },
  priceSub: {
    marginTop: 2,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
    marginVertical: 12,
  },

  // Feature rows
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  featureText: {
    flex: 1,
    minWidth: 0,
  },

  // CTA
  cta: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimary: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  ctaTextHollow: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.2,
  },
  ctaTextPrimary: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },

  // Period toggle
  toggleWrap: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    borderRadius: 8,
    backgroundColor: color.bg,
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: color.primary,
  },
  toggleLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.1,
  },
  toggleLabelActive: {
    color: '#fff',
  },

  // Apple-required subscription terms block
  termsBlock: {
    marginTop: 24,
    padding: space.md,
    borderRadius: 10,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    gap: 8,
  },
  termsTitle: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textMuted,
    letterSpacing: 1.4,
  },
  termsBody: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 17,
    color: color.textMuted,
  },
  termsLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  // Footer
  fineprint: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    lineHeight: 16,
    color: color.textFaint,
    marginTop: 12,
    textAlign: 'center',
  },
  restoreBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },

  // Non-owner read-only note (replaces the entire upgrade UI for
  // anyone who isn't Studio Owner). Quiet styling — looks like a
  // neutral info card, not a paywall block.
  adminOnlyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: 10,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  adminOnlyBody: {
    flex: 1,
    minWidth: 0,
  },
  adminOnlyHint: {
    marginTop: 4,
    lineHeight: 17,
  },
});
