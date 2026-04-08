/**
 * Native-style list row. Single horizontal flex:
 *
 *   [leading?] [title + subtitle, flex:1] [trailing?] [chevron?]
 *
 * Heights:
 *   - 48pt min                  (title only)
 *   - 56pt                      (title + subtitle)
 *   - 64pt                      (title + subtitle + trailing badge)
 *
 * The row honors a 44pt minimum hit area even when its visible content
 * is smaller. Press feedback is a brief background tint, not a scale —
 * scale on rows feels off in dense lists.
 *
 * The row does NOT draw its own separator. Render `<Separator />` between
 * rows yourself, or wrap the rows in a container that does.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { color, screenInset, space } from '@/src/theme';

import { Text } from './Text';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Element rendered on the left, sized 24pt. Typically an icon. */
  leading?: ReactNode;
  /** Element rendered on the right, before the chevron. Typically an amount or badge. */
  trailing?: ReactNode;
  /** Show a 12pt right chevron, indicating navigability. Default: true if onPress is set. */
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron,
  onPress,
  disabled,
  style,
}: ListRowProps) {
  const showChevron = chevron ?? Boolean(onPress);
  const minHeight = subtitle ? 56 : 48;

  const content = (
    <View style={[styles.row, { minHeight }, style]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text variant="rowTitle" color="text" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" color="textMuted" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {showChevron ? <Chevron /> : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

function Chevron() {
  return <Text variant="meta" color="textFaint" style={styles.chevron}>{'›'}</Text>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.md,
    backgroundColor: color.surface,
  },
  pressed: {
    backgroundColor: color.bgGrouped,
  },
  leading: {
    width: 24,
    height: 24,
    marginRight: space.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    marginTop: 2,
  },
  trailing: {
    marginLeft: space.base,
    alignItems: 'flex-end',
  },
  chevron: {
    marginLeft: space.md,
    fontSize: 22,
    lineHeight: 22,
  },
});
