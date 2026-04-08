/**
 * Hairline separator. 0.5pt on iOS / 1px on Android via
 * `StyleSheet.hairlineWidth`. Use `inset` to indent the line from the
 * left edge so it lines up with the row content (the standard iOS look).
 */
import { StyleSheet, View } from 'react-native';

import { color, screenInset } from '@/src/theme';

export type SeparatorProps = {
  /** Pixels to inset from the left edge. Default 16. Pass 0 for full-width. */
  inset?: number;
};

export function Separator({ inset = screenInset }: SeparatorProps) {
  return <View style={[styles.line, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },
});
