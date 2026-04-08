/**
 * StatStrip: a horizontal row of 2-3 labeled stat tiles used to summarize
 * a section (e.g. Projects dashboard, Site tab, Transactions tab).
 *
 * Each cell is a small rounded tile with an uppercase caption label and
 * a larger value. Cells can optionally use a tinted background (infoSoft,
 * successSoft, dangerSoft, warningSoft) to color-code meaning — but only
 * in summary strips, never in list rows.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { color, radius, space } from '@/src/theme';

import { Text } from './Text';

export type StatTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';

export type StatCell = {
  label: string;
  value: string;
  tone?: StatTone;
};

const TONE_BG: Record<StatTone, string> = {
  neutral: color.surfaceAlt,
  info: color.infoSoft,
  success: color.successSoft,
  danger: color.dangerSoft,
  warning: color.warningSoft,
};

const TONE_VALUE: Record<StatTone, keyof typeof color> = {
  neutral: 'text',
  info: 'primary',
  success: 'success',
  danger: 'danger',
  warning: 'warning',
};

export function StatStrip({ cells, style }: { cells: StatCell[]; style?: ViewStyle }) {
  return (
    <View style={[styles.row, style]}>
      {cells.map((cell, i) => {
        const tone = cell.tone ?? 'neutral';
        return (
          <View
            key={`${cell.label}-${i}`}
            style={[styles.cell, { backgroundColor: TONE_BG[tone] }]}
          >
            <Text variant="caption" color="textMuted" style={styles.label}>
              {cell.label.toUpperCase()}
            </Text>
            <Text variant="title" color={TONE_VALUE[tone]} tabular style={styles.value}>
              {cell.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.xs,
  },
  cell: {
    flex: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: 76,
    justifyContent: 'space-between',
  },
  label: {
    letterSpacing: 0.4,
  },
  value: {
    marginTop: space.xs,
  },
});
