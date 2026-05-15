/**
 * v2 KpiCard — compact KPI tile for the metric strip.
 *
 * Used in 3-up rows on dashboards (CRM Pipeline / Hot / Conversion).
 *
 * Layout:
 *   ┌─────────────────────┐
 *   │ CAPTION         [⚡] │
 *   │                      │
 *   │ value (colored)      │
 *   │ subline              │
 *   └─────────────────────┘
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';

import { Text } from './Text';

export type KpiCardProps = {
  caption: string;
  /** Already-formatted value string. */
  value: string;
  /**
   * @deprecated Per the app-wide color discipline (only blue/red/orange/green
   * carry meaning), KPI values and icons now render in neutral theme tokens.
   * The prop is kept for back-compat with existing callers but its value is
   * ignored — pass it or omit it.
   */
  hue?: string;
  /** Ionicon shown in the top-right corner. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional subline beneath the value (e.g. "5 open"). */
  sub?: string;
  style?: ViewStyle;
};

export function KpiCard({
  caption,
  value,
  icon,
  sub,
  style,
}: KpiCardProps) {
  const t = useThemeV2();

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
        style,
      ]}
    >
      <View style={styles.head}>
        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.6 }}>
          {caption.toUpperCase()}
        </Text>
        {icon ? (
          <Ionicons name={icon} size={12} color={t.colors.tertiary} />
        ) : null}
      </View>
      <Text
        variant="callout"
        color="label"
        style={{ fontWeight: '700', marginTop: 1 }}
        numberOfLines={1}
      >
        {value}
      </Text>
      {sub ? (
        <Text
          variant="caption2"
          color="secondary"
          style={{ marginTop: 2 }}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingHorizontal: 11,
    paddingTop: 9,
    paddingBottom: 10,
    minWidth: 0,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
});
