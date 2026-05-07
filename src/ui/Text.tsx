/**
 * Typed Text primitive. Every text in the app goes through this — never
 * use React Native's `<Text>` directly. The variant prop maps to the
 * design-system type scale; the color prop maps to color tokens.
 *
 * Defaults: variant="body", color="text". `numberOfLines` is forwarded so
 * dense list rows can truncate cleanly.
 */
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { color as colorTokens, type, type ColorToken, type TypeVariant } from '@/src/theme';

export type TextProps = Omit<RNTextProps, 'style'> & {
  variant?: TypeVariant;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
  /** Use tabular numerals — for amounts/dates that should align in columns. */
  tabular?: boolean;
  /** Standard React Native style prop — accepts arrays, falsy values
   *  (`false | null | undefined`), and nesting. Matches the pattern
   *  used by `Pressable`/`View` in the rest of the app so call-sites
   *  can use `[styles.foo, active && styles.bar]` without TS noise. */
  style?: StyleProp<TextStyle>;
};

export function Text({
  variant = 'body',
  color = 'text',
  align,
  tabular,
  style,
  children,
  ...rest
}: TextProps) {
  const variantStyle = type[variant] as TextStyle;
  const composed: TextStyle = {
    ...variantStyle,
    color: colorTokens[color],
    ...(align ? { textAlign: align } : null),
    ...(tabular ? { fontVariant: ['tabular-nums'] } : null),
  };

  return (
    <RNText style={[composed, style]} allowFontScaling {...rest}>
      {children}
    </RNText>
  );
}
