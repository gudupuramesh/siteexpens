/**
 * SiteExpens design tokens.
 *
 * The visual language is "native-dense": iOS/Android conventions, system
 * fonts, tight spacing, list-first layouts. Tokens here are the *only*
 * place magic numbers and hex values are allowed in the codebase. Every
 * screen should consume these via `import { color, space, ... } from '@/src/theme'`.
 *
 * See the design system section in the plan for the rationale behind
 * each value.
 */
import type { TextStyle, ViewStyle } from 'react-native';

export const color = {
  bg: '#FFFFFF', // primary surface
  bgGrouped: '#F7F8FA', // iOS "grouped" list backdrop
  surface: '#FFFFFF',
  separator: '#ECEEF2', // hairline dividers
  text: '#0B1020', // primary text
  textMuted: '#6B7280', // secondary / metadata
  textFaint: '#9AA0A6', // tertiary / placeholders
  primary: '#4F7CFF',
  primaryPressed: '#3D5FCC',
  primarySoft: '#EEF2FF', // tinted background for selected/active states
  onPrimary: '#FFFFFF',
  success: '#22A06B',
  warning: '#F59E0B',
  danger: '#E5484D',
  successSoft: '#E6F6EE',
  warningSoft: '#FEF3E2',
  dangerSoft: '#FDECEC',
} as const;

export type ColorToken = keyof typeof color;

/** Spacing scale (px). Tighter than the reference: 2/4/6/8/12/16/20/24. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  base: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export type SpaceToken = keyof typeof space;

/** Border radius. Most rows are square-ish; only buttons/sheets round. */
export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Type scale, modeled after iOS Human Interface Guidelines.
 * Each variant produces a fully-typed React Native TextStyle.
 */
export const type = {
  caption: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
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
    lineHeight: 20,
  },
  bodyStrong: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  section: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  largeTitle: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Elevation. Used sparingly: only on FAB and bottom sheets. */
export const shadow = {
  none: {} as ViewStyle,
  hairline: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  } as ViewStyle,
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as ViewStyle,
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  } as ViewStyle,
} as const;

export type ShadowToken = keyof typeof shadow;

/** Minimum touch target. Hit areas extend at least this far. */
export const minTouchTarget = 44;

/** Standard horizontal screen inset. Lists run edge-to-edge below this. */
export const screenInset = 16;

/** Hairline width helper — 0.5pt on iOS, 1px on Android by convention.
 *  RN's StyleSheet.hairlineWidth handles this for us; this constant exists
 *  so we can use it without importing StyleSheet in every consumer. */
export const hairline = 0.5;
