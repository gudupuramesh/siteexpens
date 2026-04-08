/**
 * LargeHeader: the top-of-screen header used on bottom-tab screens
 * (Projects, Parties, CRM, Chats). Shows a small uppercase org name
 * caption above a large-title heading on the left, with a circular
 * avatar-style button on the right.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { color, radius, screenInset, shadow, space } from '@/src/theme';

import { Text } from './Text';

export type LargeHeaderProps = {
  eyebrow?: string;
  title: string;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
  onTrailingPress?: () => void;
};

export function LargeHeader({
  eyebrow,
  title,
  trailing,
  leading,
  onTrailingPress,
}: LargeHeaderProps) {
  return (
    <View style={styles.row}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.titleBlock}>
        {eyebrow ? (
          <Text variant="caption" color="textMuted" style={styles.eyebrow}>
            {eyebrow.toUpperCase()}
          </Text>
        ) : null}
        <Text variant="largeTitle" color="text">
          {title}
        </Text>
      </View>
      {trailing ? (
        <Pressable
          onPress={onTrailingPress}
          hitSlop={8}
          style={({ pressed }) => [styles.trailing, pressed && { opacity: 0.85 }]}
        >
          {trailing}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  leading: {
    marginRight: space.xs,
  },
  titleBlock: {
    flex: 1,
  },
  eyebrow: {
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  trailing: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hairline,
  },
});
