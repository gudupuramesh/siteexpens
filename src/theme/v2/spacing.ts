/**
 * v2 spacing tokens — DESIGN.md §2.3.
 * 4-pt base. Common steps: 2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 32.
 */

export const space = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  '3xl': 16,
  '4xl': 20,
  '5xl': 24,
  '6xl': 32,
} as const;

/**
 * Region-specific spacing shorthand — for screens to read more naturally
 * than raw `space.*` lookups.
 */
export const region = {
  /** Screen horizontal padding for cards (16) and titles (20). */
  screenH: 16,
  titleH: 20,

  /** Card / form-group inner padding. */
  cardV: 14,
  cardH: 16,

  /** Row min height. 48 for forms, 44 for compact list rows. */
  rowMinForm: 48,
  rowMinList: 44,

  /** Vertical gap between cards. */
  cardGap: 10,

  /** Vertical gap between form groups. */
  formGroupGap: 24,

  /** Bottom safe-area buffer for the floating tab bar (34 home indicator + 96 tabbar). */
  tabBarBuffer: 130,
} as const;
