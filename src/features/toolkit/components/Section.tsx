/**
 * v2 Section — uppercase header above a column of children.
 *
 * Mirrors the FormGroup header rhythm but does NOT wrap children in a
 * surface card — calculator inputs/results are themselves card-shaped
 * (NumberField, ResultRow), so wrapping them in a card would double up
 * on borders. The Section just stamps a header + a 10-pt vertical gap.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/v2/Text';

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Text
        variant="caption2"
        color="secondary"
        style={styles.header}
      >
        {title.toUpperCase()}
      </Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  header: {
    letterSpacing: 0.5,
    paddingHorizontal: 32,
  },
  body: {
    paddingHorizontal: 16,
    gap: 10,
  },
});
