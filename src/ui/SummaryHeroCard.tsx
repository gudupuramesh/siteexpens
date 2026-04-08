/**
 * SummaryHeroCard: a wide brand-colored card with 1-3 metric cells.
 * Used for prominent summaries like Party Balances, Wallet, etc.
 *
 * We render a solid primary fill rather than a gradient to keep the
 * native dependency footprint small; the visual impact comes from the
 * large elevation and the contrast with the canvas. Can be swapped for
 * expo-linear-gradient later without changing the public API.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { color, radius, shadow, space } from '@/src/theme';

import { Text } from './Text';

export type HeroMetric = {
  label: string;
  value: string;
};

export function SummaryHeroCard({
  title,
  metrics,
  style,
}: {
  title: string;
  metrics: HeroMetric[];
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.card, style]}>
      <Text variant="caption" color="onPrimary" style={styles.title}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.row}>
        {metrics.map((m, i) => (
          <View
            key={`${m.label}-${i}`}
            style={[
              styles.cell,
              i > 0 && styles.cellDivider,
            ]}
          >
            <Text variant="title" color="onPrimary" tabular>
              {m.value}
            </Text>
            <Text variant="caption" color="onPrimary" style={styles.cellLabel}>
              {m.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.primary,
    borderRadius: radius.lg,
    padding: space.lg,
    ...shadow.lg,
  },
  title: {
    opacity: 0.8,
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    marginTop: space.sm,
  },
  cell: {
    flex: 1,
    paddingHorizontal: space.sm,
  },
  cellDivider: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.25)',
  },
  cellLabel: {
    marginTop: 2,
    opacity: 0.85,
  },
});
