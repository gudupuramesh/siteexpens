/**
 * Form section wrapper — eyebrow header + a child column with consistent
 * gap. Keeps every calculator screen's vertical rhythm aligned.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, space } from '@/src/theme';

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  title: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  body: { gap: space.sm },
});
