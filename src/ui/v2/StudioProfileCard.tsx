/**
 * v2 StudioProfileCard — single-panel hero card.
 *
 * NEW layout per latest user feedback:
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │  [AS]  Studio Name                  ✦ AGENCY PLAN│
 *   │        +91 9876543210                             │
 *   │                                                   │
 *   │  [● 12 Projects] [● 8 Members] [📅 Renews May 12] │
 *   └──────────────────────────────────────────────────┘
 *
 *   • Plan badge is on the RIGHT, in line with the studio name
 *   • Phone number is the subline beneath the studio name
 *   • Bottom is a 3-pill row: Projects · Members · Expiry
 *   • No internal dividers — hierarchy via spacing only
 *   • No edit pen (the OrgSwitcher in the top header handles studio-switching;
 *     row destinations below handle profile editing)
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';

import { Text } from './Text';

type TierKey = 'free' | 'solo' | 'studio' | 'agency';
const TIER_LABEL: Record<TierKey, string> = {
  free: 'Free plan',
  solo: 'Solo plan',
  studio: 'Studio plan',
  agency: 'Agency plan',
};

export type StudioProfileCardProps = {
  /** Studio name. Required. */
  studioName: string;
  /** Subline shown beneath the studio name — typically the user's
   *  phone number. Optional. */
  subline?: string;
  /** Subscription tier for the plan badge. */
  tier: TierKey;
  /** Short value shown in the Expiry block, e.g. "May 12". Pass
   *  undefined for Free plan to skip the block. */
  expiryValue?: string;
  /** Label under the expiry value: "Renews" or "Expires" depending
   *  on `subscription.willRenew`. */
  expiryLabel?: string;
  /** Stat values for the bottom shaded blocks. */
  stats: {
    projects: string;
    members: string;
  };
};

export function StudioProfileCard({
  studioName,
  subline,
  tier,
  expiryValue,
  expiryLabel,
  stats,
}: StudioProfileCardProps) {
  const t = useThemeV2();

  // Initials from studio name (first 2 chars of the first 1–2 words)
  const initials = (studioName || 'S')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const planLabel = TIER_LABEL[tier] ?? 'Plan';
  const planAccent = t.mode === 'dark' ? '#FFD60A' : '#A6580B';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        t.shadows.resting,
      ]}
    >
      {/* Identity — avatar + (name + plan badge inline) + phone */}
      <View style={styles.identityRow}>
        <LinearGradient
          colors={['#FF9F0A', '#FF453A', '#BF5AF2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: '700',
              letterSpacing: 0.2,
            }}
          >
            {initials}
          </Text>
        </LinearGradient>

        <View style={styles.nameBlock}>
          <View style={styles.nameLine}>
            <Text
              variant="headline"
              color="label"
              style={{ flex: 1, marginRight: 8 }}
              numberOfLines={1}
            >
              {studioName}
            </Text>

            {/* Plan badge — sits inline at the right of the name row */}
            <View
              style={[
                styles.planBadge,
                {
                  backgroundColor:
                    t.mode === 'dark'
                      ? 'rgba(255,159,10,0.20)'
                      : 'rgba(255,159,10,0.16)',
                },
              ]}
            >
              <Ionicons name="sparkles" size={9} color={planAccent} />
              <Text
                variant="caption2"
                style={{
                  color: planAccent,
                  fontWeight: '700',
                  marginLeft: 4,
                  letterSpacing: 0.3,
                }}
              >
                {planLabel.toUpperCase()}
              </Text>
            </View>
          </View>

          {subline ? (
            <Text
              variant="footnote"
              color="secondary"
              style={{ marginTop: 2 }}
              numberOfLines={1}
            >
              {subline}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Stat strip — Projects · Members · Expiry.
          Single quiet surface (fill3) with hairline dividers between
          cells. Color shows up only as a tiny accent dot before each
          label, not as a candy-bright background fill — keeps the
          card reading as a calm executive dashboard rather than a
          dashboard for kids' apps. */}
      <View
        style={[
          styles.statStrip,
          {
            backgroundColor: t.colors.fill3,
            borderRadius: t.radii.chip,
          },
        ]}
      >
        <StatCell
          value={stats.projects}
          label="Projects"
          dot={t.palette.blue.base}
        />
        <View
          style={[styles.statDivider, { backgroundColor: t.colors.separator }]}
        />
        <StatCell
          value={stats.members}
          label="Members"
          dot={t.palette.green.base}
        />
        <View
          style={[styles.statDivider, { backgroundColor: t.colors.separator }]}
        />
        {expiryValue ? (
          <StatCell
            value={expiryValue}
            label={expiryLabel ?? 'Expires'}
            dot={t.palette.orange.base}
          />
        ) : (
          <StatCell
            value="—"
            label="No expiry"
            dot={t.colors.tertiary}
          />
        )}
      </View>
    </View>
  );
}

/**
 * StatCell — single column inside the quiet stat strip. Big neutral
 * value, small uppercase label preceded by a tone-tinted dot. The
 * dot is the only place color touches the cell — keeps the card
 * professional without giving up at-a-glance differentiation. */
function StatCell({
  value,
  label,
  dot,
}: {
  value: string;
  label: string;
  dot: string;
}) {
  return (
    <View style={blockStyles.cell}>
      <Text
        variant="title3"
        color="label"
        style={{ fontWeight: '700', letterSpacing: -0.3 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      <View style={blockStyles.cellLabelRow}>
        <View
          style={[
            blockStyles.cellDot,
            { backgroundColor: dot },
          ]}
        />
        <Text
          variant="caption2"
          color="secondary"
          style={{ letterSpacing: 0.4, marginLeft: 4 }}
          numberOfLines={1}
        >
          {label.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: 'hidden',
  },

  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,
  },

  // Quiet 3-up stat strip — Projects · Members · Expiry on one
  // surface with hairline dividers between.
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 12,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 4,
  },
});

const blockStyles = StyleSheet.create({
  cell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  cellLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  cellDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
