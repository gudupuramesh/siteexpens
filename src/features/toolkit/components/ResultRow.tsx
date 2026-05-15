/**
 * v2 ResultRow — labelled output card.
 *
 * Visual: surface card (radii.field) with caption label top, a hero/title
 * value + unit in the middle, optional secondary sub-line below.
 *
 * Two tones:
 *  • default — neutral surface, label + value in label/secondary colors
 *  • primary — blue-tinted surface, label/value in blue.base for the
 *              "hero" answer of each calculator
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export type ResultRowProps = {
  label: string;
  /** Pre-formatted value string. Pass "—" or empty if not yet computed. */
  value: string;
  unit?: string;
  /** Smaller sub-text under the result — derived numbers, hints, etc. */
  sub?: string;
  /** Visual weight: "primary" = blue accent, "default" = neutral surface. */
  tone?: 'default' | 'primary';
};

export function ResultRow({
  label,
  value,
  unit,
  sub,
  tone = 'default',
}: ResultRowProps) {
  const t = useThemeV2();
  const isPrimary = tone === 'primary';

  const cardBg = isPrimary
    ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
    : t.colors.surface;
  const cardBorder = isPrimary
    ? t.palette.blue.base + '33' // ~20% blue tint
    : t.mode === 'dark'
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(0,0,0,0.04)';

  const labelColor = isPrimary ? t.palette.blue.base : t.colors.tertiary;
  const valueColor = isPrimary ? t.palette.blue.base : t.colors.label;
  const unitColor = isPrimary ? t.palette.blue.base : t.colors.tertiary;
  const subColor = t.colors.secondary;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderRadius: t.radii.field,
          borderColor: cardBorder,
          borderWidth: t.hairline,
        },
      ]}
    >
      <Text
        variant="caption2"
        style={{ color: labelColor, letterSpacing: 0.5 }}
      >
        {label.toUpperCase()}
      </Text>

      <View style={styles.row}>
        <Text
          variant="title2"
          style={{
            color: valueColor,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}
        >
          {value || '—'}
        </Text>
        {unit ? (
          <Text
            variant="footnote"
            style={{
              color: unitColor,
              marginLeft: 6,
              fontWeight: '600',
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>

      {sub ? (
        <Text
          variant="caption1"
          style={{ color: subColor, marginTop: 2 }}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
});
