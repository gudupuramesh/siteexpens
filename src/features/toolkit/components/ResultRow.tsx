/**
 * Big-number result row. Used inside results sections of every
 * calculator — a label + a hero numeric value (+ optional unit and
 * sub-line for derived calculations like wastage).
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, space } from '@/src/theme';

export type ResultRowProps = {
  label: string;
  /** Pre-formatted value string. Pass "—" or empty if not yet computed. */
  value: string;
  unit?: string;
  /** Smaller sub-text under the result — derived numbers, hints, etc. */
  sub?: string;
  /** Visual weight: "primary" = blue accent, "default" = slate. */
  tone?: 'default' | 'primary';
};

export function ResultRow({
  label,
  value,
  unit,
  sub,
  tone = 'default',
}: ResultRowProps) {
  const isPrimary = tone === 'primary';
  return (
    <View style={[styles.wrap, isPrimary ? styles.wrapPrimary : null]}>
      <Text style={isPrimary ? { ...styles.label, color: color.primary } : styles.label}>
        {label}
      </Text>
      <View style={styles.row}>
        <Text
          style={isPrimary ? { ...styles.value, color: color.primary } : styles.value}
          tabular
        >
          {value || '—'}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 4,
  },
  wrapPrimary: {
    backgroundColor: color.primarySoft,
    borderColor: color.primary,
  },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  value: {
    fontFamily: fontFamily.sans,
    fontSize: 24,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.4,
  },
  unit: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 0.6,
  },
  sub: {
    fontSize: 12,
    color: color.textMuted,
    marginTop: 2,
  },
});
