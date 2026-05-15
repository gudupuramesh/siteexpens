/**
 * v2 Text — DESIGN.md §3.1.
 *
 * Wraps RN `Text` with a `variant` prop that maps to the type ramp.
 * Auto-applies tabular figures for numeric variants (largeTitle, title*,
 * headline, hero) so columns of numbers align across rows.
 *
 * Default color = `colors.label`; pass `color="secondary" | "tertiary" |
 * "label" | "{custom hex}"` to override.
 */
import { forwardRef } from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { useThemeV2, type TypeVariant } from '@/src/theme/v2';

export type TextV2Color =
  | 'label'
  | 'secondary'
  | 'tertiary'
  | 'inverse'
  | string;

export type TextV2Props = Omit<RNTextProps, 'style'> & {
  variant?: TypeVariant;
  color?: TextV2Color;
  /** Accepts a single style, an array, or a falsy entry inside an array
   *  (so call-sites can use the React Native idiom `[a, active && b]`
   *  without TypeScript noise). */
  style?: StyleProp<TextStyle>;
};

export const Text = forwardRef<RNText, TextV2Props>(function TextV2(
  { variant = 'body', color = 'label', style, children, ...rest },
  ref,
) {
  const t = useThemeV2();

  const base = t.type[variant];
  const tabular = t.tabularVariants.has(variant);

  // Resolve color token → actual hex/rgba. If `color` is one of the
  // semantic keys, look it up on `t.colors`; otherwise treat it as a
  // raw color string.
  const resolved =
    color === 'label'
      ? t.colors.label
      : color === 'secondary'
        ? t.colors.secondary
        : color === 'tertiary'
          ? t.colors.tertiary
          : color === 'inverse'
            ? t.mode === 'dark'
              ? '#000000'
              : '#FFFFFF'
            : color;

  const composed: TextStyle = {
    ...base,
    color: resolved,
    ...(tabular ? { fontVariant: ['tabular-nums'] } : null),
  };

  return (
    <RNText ref={ref} style={[composed, style] as StyleProp<TextStyle>} {...rest}>
      {children}
    </RNText>
  );
});
