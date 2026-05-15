/**
 * v2 color tokens — DESIGN.md §2.1.
 * Mirrors iOS 26 system palette. Light + dark, status semantic colors,
 * ambient gradient stops. Theme switching via React Native's
 * `useColorScheme()` in `useThemeV2()`.
 *
 * Coexists with the existing `src/theme/tokens.ts` (v1) — does NOT
 * replace it. The Account tab and the v2 component set in `src/ui/v2/`
 * read from this file; v1 tokens still drive every other screen.
 */

export const palette = {
  blue: {
    base: '#0A84FF',
    soft: 'rgba(10,132,255,0.14)',
    softDark: 'rgba(10,132,255,0.22)',
  },
  green: {
    base: '#34C759',
    dark: '#30D158',
    soft: 'rgba(52,199,89,0.16)',
    softDark: 'rgba(48,209,88,0.22)',
  },
  orange: {
    base: '#FF9500',
    dark: '#FF9F0A',
    soft: 'rgba(255,149,0,0.16)',
    softDark: 'rgba(255,159,10,0.22)',
  },
  yellow: {
    base: '#E8B400',
    dark: '#FFD60A',
    soft: 'rgba(232,180,0,0.18)',
    softDark: 'rgba(255,214,10,0.22)',
  },
  red: {
    base: '#FF3B30',
    dark: '#FF453A',
    soft: 'rgba(255,59,48,0.14)',
    softDark: 'rgba(255,69,58,0.22)',
  },
  purple: { base: '#AF52DE', dark: '#BF5AF2' },
  cyan: { base: '#32ADE6', dark: '#64D2FF' },
  indigo: { base: '#5E5CE6' },
} as const;

/**
 * Surface palette per mode. `light` and `dark` both satisfy this shape
 * — declared as a type rather than `as const` so the `useThemeV2()`
 * return is a single branch (otherwise TS treats the two object
 * literals as unrelated branded types).
 */
export type V2Colors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  label: string;
  secondary: string;
  tertiary: string;
  separator: string;
  fill: string;
  fill2: string;
  fill3: string;
};

export const light: V2Colors = {
  bg: '#F2F2F7', // systemGroupedBackground
  surface: '#FFFFFF',
  surfaceAlt: '#F2F2F7',
  label: 'rgba(0,0,0,0.92)',
  secondary: 'rgba(60,60,67,0.6)',
  tertiary: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.18)',
  fill: 'rgba(120,120,128,0.16)',
  fill2: 'rgba(118,118,128,0.12)',
  fill3: 'rgba(118,118,128,0.08)',
};

export const dark: V2Colors = {
  bg: '#000000',
  surface: '#1C1C1E',
  surfaceAlt: '#2C2C2E',
  label: '#FFFFFF',
  secondary: 'rgba(235,235,245,0.6)',
  tertiary: 'rgba(235,235,245,0.3)',
  separator: 'rgba(84,84,88,0.55)',
  fill: 'rgba(120,120,128,0.32)',
  fill2: 'rgba(120,120,128,0.24)',
  fill3: 'rgba(118,118,128,0.18)',
};

/**
 * Semantic statuses — single source of truth for StatusPill, ProjectRow,
 * MetricTile dot colors, and any place "status" maps to a hue.
 *
 * Keep this list in lock-step with `<StatusPill>`'s status union.
 */
export type StatusKey =
  | 'active'
  | 'planning'
  | 'hold'
  | 'done'
  | 'overdue';

export type StatusTone = { fg: string; bg: string };
export type StatusToneSet = Record<StatusKey, StatusTone>;

export const statusColors: { light: StatusToneSet; dark: StatusToneSet } = {
  light: {
    active: { fg: palette.blue.base, bg: palette.blue.soft },
    planning: { fg: palette.orange.base, bg: palette.orange.soft },
    hold: { fg: palette.yellow.base, bg: palette.yellow.soft },
    done: { fg: palette.green.base, bg: palette.green.soft },
    overdue: { fg: palette.red.base, bg: palette.red.soft },
  },
  dark: {
    active: { fg: palette.blue.base, bg: palette.blue.softDark },
    planning: { fg: palette.orange.dark, bg: palette.orange.softDark },
    hold: { fg: palette.yellow.dark, bg: palette.yellow.softDark },
    done: { fg: palette.green.dark, bg: palette.green.softDark },
    overdue: { fg: palette.red.dark, bg: palette.red.softDark },
  },
};

/**
 * Ambient background gradient stops — DESIGN.md §2.1.
 * The screen layers two soft radial gradients behind content for the
 * glass nav to blur into. RN doesn't have CSS radial-gradient; we
 * approximate with two `<LinearGradient>` overlays in
 * `<AmbientBackground>`.
 */
export type AmbientStop = { color: string; anchor: 'topLeft' | 'topRight' };
export type AmbientSet = { primary: AmbientStop; secondary: AmbientStop };

export const ambient: { light: AmbientSet; dark: AmbientSet } = {
  light: {
    primary: { color: 'rgba(255,159,10,0.18)', anchor: 'topLeft' },
    secondary: { color: 'rgba(10,132,255,0.14)', anchor: 'topRight' },
  },
  dark: {
    primary: { color: 'rgba(10,132,255,0.22)', anchor: 'topLeft' },
    secondary: { color: 'rgba(191,90,242,0.16)', anchor: 'topRight' },
  },
};
