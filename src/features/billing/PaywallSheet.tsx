/**
 * PaywallSheet — bottom-sheet modal shown when an action is blocked
 * by the active plan's limits.
 *
 * Used in two modes:
 *   1. **Limit-reached** (default): a specific action just failed
 *      (server returned `failed-precondition` with reason
 *      `plan_limit_*`, OR the client gate caught it before the
 *      round-trip). The sheet leads with a one-line explanation of
 *      WHICH limit was hit + a "Compare plans" CTA.
 *   2. **Browse plans** (from settings): no blocked action — the
 *      user just wants to see what each tier offers.
 *
 * The "Upgrade" CTA on each card navigates to `/subscription` which
 * runs the real RevenueCat purchase flow (`Purchases.purchasePackage`).
 * This sheet stays as a lightweight teaser — the full plan-comparison
 * + purchase + restore UI lives on the subscription screen so it can
 * be reached from anywhere (paywall trigger, More tab, deep link).
 */
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

import {
  PLAN_LABELS,
  PLAN_LIMITS,
  PLAN_ORDER,
  PLAN_PRICING_INR,
  PLAN_TAGLINES,
  isUnlimited,
  nextTierAbove,
} from './limits';
import type { PlanTier } from './types';

/** Why the paywall is showing — drives the headline copy. */
export type PaywallReason =
  | 'plan_limit_members'
  | 'plan_limit_projects'
  | 'plan_limit_storage'
  | 'browse';

export type PaywallSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Tier the org is currently on. Determines which card is marked
   *  "Current plan" + which is the suggested upgrade target. */
  currentTier: PlanTier;
  /** Why we're showing the sheet. */
  reason: PaywallReason;
  /** Optional override of the default headline message. Useful for
   *  context-specific copy ("You've used 4.2 GB of 5 GB" instead of
   *  the generic "Storage limit reached"). */
  headline?: string;
};

const REASON_HEADLINES: Record<Exclude<PaywallReason, 'browse'>, string> = {
  plan_limit_members: 'Invite more team members',
  plan_limit_projects: 'Project limit reached',
  plan_limit_storage: 'Storage full',
};

export function PaywallSheet({
  visible,
  onClose,
  currentTier,
  reason,
  headline,
}: PaywallSheetProps) {
  const goToSubscription = useCallback(() => {
    onClose();
    router.push('/(app)/subscription');
  }, [onClose]);

  // Suggested upgrade is the next tier above the current one. For
  // Free we'll suggest Studio (skipping Solo) when the reason is
  // member-cap because Solo also has 1 member — same problem.
  const suggestedTier = useMemo<PlanTier | null>(() => {
    if (reason === 'plan_limit_members' && currentTier === 'free') {
      return 'studio';
    }
    return nextTierAbove(currentTier);
  }, [currentTier, reason]);

  const resolvedHeadline =
    headline ??
    (reason === 'browse' ? 'Compare plans' : REASON_HEADLINES[reason]);

  const limitSubhead = useMemo(() => {
    if (reason === 'browse') return null;
    const label = PLAN_LABELS[currentTier];
    if (reason === 'plan_limit_members') {
      if (currentTier === 'free') {
        return (
          <>
            The Free plan includes one team seat. Upgrade to Solo, Studio, or Agency when you are ready to grow—Studio and Agency add multiple seats.
          </>
        );
      }
      if (PLAN_LIMITS[currentTier].maxMembers <= 1) {
        return (
          <>
            Your {label} plan includes one team seat. Upgrade to Studio or Agency to add more people.
          </>
        );
      }
    }
    return (
      <>
        Your <Text variant="metaStrong" color="text">{label}</Text> plan has reached its cap. Upgrade to keep working.
      </>
    );
  }, [currentTier, reason]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text variant="title" color="text">
              {resolvedHeadline}
            </Text>
            <Pressable hitSlop={12} onPress={onClose}>
              <Ionicons name="close" size={22} color={color.textMuted} />
            </Pressable>
          </View>

          {reason !== 'browse' ? (
            <Text variant="caption" color="textMuted" style={styles.subhead}>
              {limitSubhead}
            </Text>
          ) : (
            <Text variant="caption" color="textMuted" style={styles.subhead}>
              Pick the plan that fits your studio.
            </Text>
          )}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {PLAN_ORDER.map((tier) => (
              <PlanCard
                key={tier}
                tier={tier}
                isCurrent={tier === currentTier}
                isSuggested={tier === suggestedTier}
                onUpgrade={goToSubscription}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Plan card ──────────────────────────────────────────────────────

type PlanCardProps = {
  tier: PlanTier;
  isCurrent: boolean;
  isSuggested: boolean;
  onUpgrade: () => void;
};

function PlanCard({ tier, isCurrent, isSuggested, onUpgrade }: PlanCardProps) {
  const limits = PLAN_LIMITS[tier];
  const pricing = PLAN_PRICING_INR[tier];

  return (
    <View
      style={[
        styles.card,
        isSuggested && styles.cardSuggested,
        isCurrent && styles.cardCurrent,
      ]}
    >
      <View style={styles.cardHead}>
        <View style={styles.cardTitleRow}>
          <Text variant="bodyStrong" color="text">
            {PLAN_LABELS[tier]}
          </Text>
          {isCurrent ? (
            <View style={[styles.pill, styles.pillCurrent]}>
              <Text variant="metaStrong" color="textMuted" style={styles.pillText}>
                CURRENT
              </Text>
            </View>
          ) : isSuggested ? (
            <View style={[styles.pill, styles.pillSuggested]}>
              <Text variant="metaStrong" color="primary" style={styles.pillText}>
                RECOMMENDED
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" color="textMuted" numberOfLines={2}>
          {PLAN_TAGLINES[tier]}
        </Text>
      </View>

      <View style={styles.priceRow}>
        {pricing ? (
          <>
            <Text variant="title" color="text">
              ₹{pricing.monthly.toLocaleString('en-IN')}
            </Text>
            <Text variant="caption" color="textMuted" style={styles.priceUnit}>
              /month · or ₹{pricing.annual.toLocaleString('en-IN')}/yr
            </Text>
          </>
        ) : (
          <Text variant="title" color="text">
            Free
          </Text>
        )}
      </View>

      <View style={styles.featureList}>
        <FeatureRow
          label="Team members"
          value={
            isUnlimited(limits.maxMembers)
              ? 'Unlimited'
              : `${limits.maxMembers}`
          }
        />
        <FeatureRow
          label="Projects"
          value={
            isUnlimited(limits.maxProjects)
              ? 'Unlimited'
              : `${limits.maxProjects}`
          }
        />
        <FeatureRow label="Storage" value={formatBytes(limits.maxStorageBytes)} />
      </View>

      {!isCurrent ? (
        <Pressable
          onPress={onUpgrade}
          style={({ pressed }) => [
            styles.cta,
            isSuggested && styles.ctaSuggested,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text
            variant="bodyStrong"
            style={isSuggested ? styles.ctaTextSuggested : styles.ctaText}
          >
            {tier === 'free' ? 'Downgrade' : `Upgrade to ${PLAN_LABELS[tier]}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.featureRow}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="metaStrong" color="text">
        {value}
      </Text>
    </View>
  );
}

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(0)} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${b} bytes`;
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: color.borderStrong,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  subhead: {
    paddingHorizontal: screenInset,
    paddingBottom: space.sm,
  },
  list: { flexGrow: 0 },
  listContent: {
    paddingHorizontal: screenInset,
    paddingTop: space.xs,
    paddingBottom: space.md,
    gap: 12,
  },

  card: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    gap: space.sm,
  },
  cardCurrent: {
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
  },
  cardSuggested: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  cardHead: { gap: 4 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pillCurrent: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  pillSuggested: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.primary,
  },
  pillText: { fontSize: 10, letterSpacing: 0.6 },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  priceUnit: {},

  featureList: { gap: 6 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  cta: {
    marginTop: space.sm,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  ctaSuggested: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  ctaText: { color: color.text },
  ctaTextSuggested: { color: color.onPrimary },
});
