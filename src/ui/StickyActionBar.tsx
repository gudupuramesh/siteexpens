/**
 * StickyActionBar: pinned to the bottom of a screen, above the safe
 * area, holds the primary action(s) for the current view.
 *
 * Supports any children — use with Button components. The parent is
 * responsible for providing the right button variants (primary / success
 * / danger) depending on the use case.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { color, shadow, space } from '@/src/theme';

export function StickyActionBar({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.bar, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    borderTopWidth: 1,
    borderTopColor: color.border,
    ...shadow.hairline,
  },
});
