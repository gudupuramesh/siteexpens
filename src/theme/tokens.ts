/**
 * SiteExpens design tokens — InteriorOS visual language (default).
 *
 * Architectural, editorial, paper-like. Sharp 0–4px corners, hairline
 * dividers, blue accent on near-white canvas with slate ink. Inspired by
 * the InteriorOS prototype: ink/ink2/ink3 text scale, hairline / hairline2
 * borders, JetBrains-style mono for meta and tabular numerics for money.
 *
 * Tokens here are the *only* place magic numbers and hex values are
 * allowed in the codebase. Every screen should consume these via
 * `import { color, space, ... } from '@/src/theme'`.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const color = {
  // Canvas & surface — exact 1:1 match with the InteriorOS prototype
  // (`interior os/src/tokens.jsx`, light + blue accent). Canvas is pure
  // white; cards / sheets sit on a faint slate-50 tint; pressed = slate-100.
  bg: '#FFFFFF',           // legacy alias for bgGrouped
  bgGrouped: '#FFFFFF',    // screen canvas (white)
  surface: '#F8FAFC',      // cards / sheets (slate-50)
  surfaceAlt: '#F1F5F9',   // pressed / alt (slate-100)
  separator: '#EEF2F7',    // hairline divider (prototype `hairline`)
  border: '#EEF2F7',       // default border (prototype `hairline`)
  borderStrong: '#E2E8F0', // stronger border (prototype `hairline2`)

  // Text — slate ink (identical to prototype)
  text: '#0F172A',       // ink
  textMuted: '#475569',  // ink2
  textFaint: '#94A3B8',  // ink3

  // Brand — blue accent
  primary: '#2563EB',          // accent.base
  primaryPressed: '#1D4ED8',   // accent.ink
  primarySoft: '#E8EFFE',      // accent.soft
  onPrimary: '#FFFFFF',

  // Semantic
  success: '#0F9D58',
  successSoft: '#E3F5EB',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#E8EFFE',
} as const;

export type ColorToken = keyof typeof color;

/** Spacing scale (px). 4pt base. */
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

/**
 * Border radius — soft InteriorOS corners. Cards and inputs use the
 * `card` radius (10px) so they read as discrete rectangles on the slate
 * canvas; chips use `pill`; the FAB / avatars use `pill` (round).
 */
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 10, // standard — cards, inputs, buttons
  lg: 12,
  xl: 16,
  pill: 9999,
} as const;

export type RadiusToken = keyof typeof radius;

/** Font family helpers — system sans for body, mono for architectural meta. */
export const fontFamily = {
  // System sans, matches iOS SF Pro / Android Roboto
  sans: undefined as string | undefined,
  // JetBrains Mono for uppercase small-caps meta (status bars, badges,
  // tabular-num money). Falls back to platform mono when the JB Mono
  // family isn't loaded.
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
} as const;

/**
 * Type scale — single source of truth. Every `<Text variant="…">` in the
 * app maps to one of these. The scale is tuned so list cards (project,
 * lead, appointment) and detail / form screens read at the same sizes
 * and weights. If a screen needs to deviate, it uses raw `<RNText>` with
 * a one-off style — the variant table here stays canonical.
 *
 *   micro       9 / 600 / mono uppercase / ls 0.8     — tiny meta labels (e.g. ND, ₹)
 *   caption    10 / 600 / sans            / ls 0.1     — pill text (status, kind, priority)
 *   pill       10 / 600 / sans            / ls 0.1     — alias of caption
 *   meta       12 / 400 / sans / lh 14                  — sub line, secondary labels
 *   metaStrong 12 / 600 / sans / lh 14                  — emphasized sub
 *   body       14 / 400 / sans / lh 20                  — body copy, multiline notes
 *   bodyStrong 14 / 600 / sans / lh 18                  — emphasized body
 *   rowTitle   14 / 600 / sans / lh 18 / ls -0.2        — card title, list row title
 *   section    11 / 500 / sans / ls 0.8 / uppercased    — section / Group header
 *   title      18 / 700 / sans / lh 22 / ls -0.3        — page hero title
 *   largeTitle 26 / 700 / sans / lh 32 / ls -0.4        — top-of-tab title
 *   numeric    14 / 600 / mono / tabular                 — money / counts (tabular-nums)
 */
export const type = {
  micro: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
    letterSpacing: 0.8,
    fontFamily: fontFamily.mono,
    textTransform: 'uppercase',
  },
  caption: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
    letterSpacing: 0.1,
    fontFamily: fontFamily.sans,
  },
  meta: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 14,
    fontFamily: fontFamily.sans,
  },
  metaStrong: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 14,
    fontFamily: fontFamily.sans,
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    fontFamily: fontFamily.sans,
  },
  bodyStrong: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    fontFamily: fontFamily.sans,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    letterSpacing: -0.2,
    fontFamily: fontFamily.sans,
  },
  section: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: fontFamily.sans,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    letterSpacing: -0.3,
    fontFamily: fontFamily.sans,
  },
  largeTitle: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.4,
    fontFamily: fontFamily.sans,
  },
  /**
   * Monospaced numeric variant — for money, quantities, ledger totals.
   * Pair with numberOfLines={1} and textAlign="right" in tables.
   */
  numeric: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    fontFamily: fontFamily.mono,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/**
 * Elevation — paper-like, almost imperceptible. Hairlines do most of the
 * structural work; shadows are only for true floating elements.
 */
export const shadow = {
  none: {} as ViewStyle,
  hairline: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  } as ViewStyle,
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  } as ViewStyle,
  lg: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  } as ViewStyle,
  fab: {
    // Blue-accent-tinted FAB shadow
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  } as ViewStyle,
} as const;

export type ShadowToken = keyof typeof shadow;

/** Minimum touch target. */
export const minTouchTarget = 44;

/** Standard horizontal screen inset. */
export const screenInset = 20;

/** Hairline width helper. */
export const hairline = 0.5;
