/**
 * Screen primitive. Wraps children in a SafeAreaView with the right
 * background, hooks up the status bar style, and optionally pads the
 * horizontal screen inset (16pt) so content doesn't kiss the edges.
 *
 * Usage:
 *   <Screen>...</Screen>                        // padded, white bg
 *   <Screen bg="grouped">...</Screen>           // grouped-list backdrop
 *   <Screen padded={false}>...</Screen>         // edge-to-edge content (lists)
 */
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { color, screenInset } from '@/src/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Background variant. "grouped" uses #F7F8FA so white islands stand out. */
  bg?: 'plain' | 'grouped';
  /** Apply horizontal screen inset (16pt). Default true. */
  padded?: boolean;
  /** Status bar text style. Auto-derived from bg if omitted. */
  statusBar?: 'dark' | 'light' | 'auto';
  /** Which safe-area edges to inset. Default: top/left/right (no bottom — tab bar handles it). */
  edges?: ReadonlyArray<Edge>;
  style?: ViewStyle;
};

export function Screen({
  children,
  bg = 'plain',
  padded = true,
  statusBar = 'dark',
  edges = ['top', 'left', 'right'],
  style,
}: ScreenProps) {
  const backgroundColor = bg === 'grouped' ? color.bgGrouped : color.bg;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor }, style]} edges={edges}>
      <StatusBar style={statusBar} />
      <View style={[styles.content, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: screenInset,
  },
});
