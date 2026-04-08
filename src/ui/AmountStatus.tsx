/**
 * AmountStatus: right-aligned money value with a tiny status label
 * underneath. Used in party rows, transaction rows, and anywhere money
 * needs a semantic color + a status word (never color alone).
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from './Text';
import type { ColorToken } from '@/src/theme';

export type AmountStatusTone = 'success' | 'danger' | 'neutral' | 'primary';

const TONE_COLOR: Record<AmountStatusTone, ColorToken> = {
  success: 'success',
  danger: 'danger',
  neutral: 'text',
  primary: 'primary',
};

export function AmountStatus({
  amount,
  status,
  tone = 'neutral',
  style,
}: {
  amount: string;
  status?: string;
  tone?: AmountStatusTone;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <Text variant="rowTitle" color={TONE_COLOR[tone]} tabular align="right">
        {amount}
      </Text>
      {status ? (
        <Text variant="caption" color="textMuted" align="right">
          {status}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
  },
});
