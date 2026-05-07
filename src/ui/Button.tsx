/**
 * Button primitive. Three variants:
 *   - "primary"  : full-width, 48pt, #4F7CFF bg, white text
 *   - "secondary": full-width, 48pt, transparent bg, primary border + text
 *   - "text"     : inline text-only button (e.g. "Resend code", "Change")
 *
 * All variants honor `loading` (shows a spinner, blocks taps) and
 * `disabled` (greys out). Press feedback is a 0.96 scale on the primary
 * and secondary variants — no animation library required.
 */
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { color, radius, space, minTouchTarget } from '@/src/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'text';

export type ButtonProps = {
  variant?: ButtonVariant;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Make the button hug its content instead of stretching to full width. */
  inline?: boolean;
  style?: ViewStyle;
};

export function Button({
  variant = 'primary',
  label,
  onPress,
  disabled = false,
  loading = false,
  inline = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  if (variant === 'text') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        hitSlop={8}
        style={({ pressed }) => [styles.textBtn, { opacity: isDisabled ? 0.4 : pressed ? 0.6 : 1 }, style]}
      >
        <Text variant="metaStrong" color="primary">
          {label}
        </Text>
      </Pressable>
    );
  }

  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        inline && styles.inline,
        isDisabled && styles.disabled,
        pressed && !isDisabled && { transform: [{ scale: 0.96 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? color.onPrimary : color.primary} />
      ) : (
        <Text
          variant="rowTitle"
          color={isPrimary ? 'onPrimary' : 'primary'}
          align="center"
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: minTouchTarget + 4, // 48pt
    borderRadius: radius.lg2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    width: '100%',
  },
  primary: {
    backgroundColor: color.primary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: color.primary,
  },
  inline: {
    width: undefined,
    alignSelf: 'flex-start',
  },
  disabled: {
    opacity: 0.4,
  },
  textBtn: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
  },
});
