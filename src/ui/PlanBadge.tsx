/**
 * PlanBadge — small inline pill that surfaces the org's current
 * subscription tier with a recognisable icon + label.
 *
 * Used on:
 *   - Select Company screen (each org card)
 *   - Studio profile header
 *   - More tab hero card
 *
 * Design choices:
 *   - Icons chosen to feel "interior-design" tasteful rather than
 *     gamey: a leaf for the Free starter tier, a star for Solo (the
 *     individual designer), a diamond for Studio (refined craft), a
 *     trophy for Agency (top of the ladder).
 *   - Tint comes from the theme's primary palette to keep the badge
 *     consistent with the app's overall look — no per-tier colour
 *     riot. The tier identity comes from the ICON, not the colour.
 *   - Compact + medium sizes to fit beside org names and inside
 *     hero cards without dominating the layout.
 */
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { color, radius, space } from '@/src/theme';
import { Text } from '@/src/ui/Text';
import { PLAN_LABELS } from '@/src/features/billing/limits';
import type { PlanTier } from '@/src/features/billing/types';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Map tier → Ionicon name. Picked to read intuitively even without
 *  the label: leaf = starter, star = single, diamond = refined,
 *  trophy = top. */
const TIER_ICON: Record<PlanTier, IoniconName> = {
  free: 'leaf-outline',
  solo: 'star',
  studio: 'diamond',
  agency: 'trophy',
};

export type PlanBadgeSize = 'sm' | 'md';

export type PlanBadgeProps = {
  tier: PlanTier;
  /** "sm" — 11px text, 12px icon; for list rows.
   *  "md" — 13px text, 14px icon; for headers + hero cards. */
  size?: PlanBadgeSize;
  /** Hide the text label; render icon-only. Useful in very tight
   *  spots. Defaults to false. */
  iconOnly?: boolean;
  /** Override style for parent layout (margins, alignment). */
  style?: import('react-native').ViewStyle;
};

export function PlanBadge({
  tier,
  size = 'sm',
  iconOnly = false,
  style,
}: PlanBadgeProps) {
  const isMd = size === 'md';
  const iconSize = isMd ? 14 : 12;
  const padH = isMd ? 10 : 8;
  const padV = isMd ? 4 : 3;

  return (
    <View
      style={[
        styles.pill,
        {
          paddingHorizontal: padH,
          paddingVertical: padV,
        },
        style,
      ]}
      accessibilityLabel={`${PLAN_LABELS[tier]} plan`}
    >
      <Ionicons name={TIER_ICON[tier]} size={iconSize} color={color.primary} />
      {iconOnly ? null : (
        <Text
          variant={isMd ? 'metaStrong' : 'caption'}
          color="primary"
          style={styles.label}
        >
          {PLAN_LABELS[tier]}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: color.primarySoft,
    borderRadius: radius.pill ?? 999,
    alignSelf: 'flex-start',
  },
  label: {
    letterSpacing: 0.3,
  },
});
