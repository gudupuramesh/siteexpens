/**
 * Public surface of the design system. Always import tokens from here:
 *
 *   import { color, space, radius, type, shadow } from '@/src/theme';
 *
 * Never reach into ./tokens directly from feature code.
 */
export {
  color,
  space,
  radius,
  type,
  shadow,
  fontFamily,
  minTouchTarget,
  screenInset,
  hairline,
} from './tokens';

export type {
  ColorToken,
  SpaceToken,
  RadiusToken,
  TypeVariant,
  ShadowToken,
} from './tokens';
