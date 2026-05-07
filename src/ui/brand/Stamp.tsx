/**
 * Stamp — small monospace footer mark, e.g. "HYDERABAD · 2026".
 *
 * Reads as an architectural drawing's signature block — fits the
 * studio-software brand tone. Sits at the very bottom of the splash
 * and the auth screens.
 *
 * Visual rule: 11px max, mono font, uppercase, faint slate, tight
 * letter-spacing. Anything bolder competes with the form / hero.
 */
import { Text } from '@/src/ui/Text';
import { color, fontFamily } from '@/src/theme/tokens';
import type { TextStyle } from 'react-native';

import { BRAND } from '@/src/features/brand/brand';

export type StampProps = {
  /** Override the displayed text. Defaults to `BRAND.stamp`. */
  text?: string;
  /** Style override on the Text. The internal `<Text/>` accepts a
   *  single TextStyle (not a `StyleProp<TextStyle>`); pass merged
   *  styles if you need multiple. */
  style?: TextStyle;
};

const baseStyle: TextStyle = {
  color: color.textFaint,
  fontSize: 11,
  fontWeight: '600',
  letterSpacing: 1.2,
  fontFamily: fontFamily.mono,
  // Monospace doesn't have proper smallcaps; we uppercase the source
  // text instead and rely on letter-spacing for optical breathing room.
  textTransform: 'uppercase',
};

export function Stamp({ text = BRAND.stamp, style }: StampProps) {
  // Merge base + override into a single TextStyle (our Text wrapper
  // accepts a single TextStyle, not StyleProp).
  const merged: TextStyle = style ? { ...baseStyle, ...style } : baseStyle;
  return <Text style={merged}>{text}</Text>;
}
