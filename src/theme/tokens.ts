/**
 * SiteExpens design tokens — aligned with design-system.json v2.0.0.
 *
 * The visual language is "clean periwinkle": one vivid brand accent
 * (#5B6CF5) on a near-white canvas, soft shadows, pill buttons, 18pt
 * rounded cards. Never dense tables, never dark headers, never neon.
 *
 * Tokens here are the *only* place magic numbers and hex values are
 * allowed in the codebase. Every screen should consume these via
 * `import { color, space, ... } from '@/src/theme'`.
 */
import type { TextStyle, ViewStyle } from 'react-native';

export const color = {
  // Canvas & surface
  bg: '#F5F6F8', // legacy alias for bgGrouped
  bgGrouped: '#F5F6F8', // screen canvas
  surface: '#FFFFFF',
  surfaceAlt: '#FAFAFB',
  separator: '#ECEDF1',
  border: '#ECEDF1',
  borderStrong: '#D9DBE3',

  // Text
  text: '#14151A',
  textMuted: '#5C5F6B',
  textFaint: '#9A9DAA',

  // Brand
  primary: '#5B6CF5',
  primaryPressed: '#4A5AE8',
  primarySoft: '#EEF0FE',
  onPrimary: '#FFFFFF',

  // Semantic
  success: '#15A366',
  successSoft: '#E6F6EE',
  warning: '#F59E0B',
  warningSoft: '#FEF4E4',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  info: '#3B82F6',
  infoSoft: '#EAF2FE',
} as const;

export type ColorToken = keyof typeof color;

/** Spacing scale (px). 4pt base, aligned with design-system.json. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
  // Legacy aliases (kept so existing screens still compile)
  base: 12,
} as const;

export type SpaceToken = keyof typeof space;

/** Border radius. */
export const radius = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Type scale, aligned with design-system.json v2. Named to match the
 * Text component variants already used across the codebase.
 */
export const type = {
  micro: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    letterSpacing: 0.4,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  meta: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  metaStrong: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodyStrong: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  section: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  largeTitle: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -0.4,
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Elevation — soft, almost imperceptible. */
export const shadow = {
  none: {} as ViewStyle,
  hairline: {
    shadowColor: '#14151A',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  } as ViewStyle,
  card: {
    shadowColor: '#14151A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as ViewStyle,
  lg: {
    shadowColor: '#14151A',
    shadowOpacity: 0.08,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  } as ViewStyle,
  fab: {
    shadowColor: '#5B6CF5',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  } as ViewStyle,
} as const;

export type ShadowToken = keyof typeof shadow;

/** Minimum touch target. */
export const minTouchTarget = 44;

/** Standard horizontal screen inset — 20pt per design system. */
export const screenInset = 20;

/** Hairline width helper. */
export const hairline = 0.5;
