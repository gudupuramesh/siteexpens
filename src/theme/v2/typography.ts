/**
 * v2 typography ramp — DESIGN.md §2.2.
 *
 * SF Pro Text (body) + SF Pro Display (≥20px) — both are the iOS system
 * font (just leave `fontFamily` unset on iOS). On Android we fall back
 * to 'System' which resolves to Roboto.
 *
 * Hero numeric variants auto-apply tabular figures via the v2 <Text>
 * wrapper (see `src/ui/v2/Text.tsx`).
 */
import type { TextStyle } from 'react-native';

export type TypeVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption1'
  | 'caption2'
  | 'hero'; // 36–56 / 700 / -2.2 — DESIGN.md §2.2 hero numbers

export const typeRamp: Record<TypeVariant, TextStyle> = {
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.36, lineHeight: 41 },
  title1:     { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, lineHeight: 34 },
  title2:     { fontSize: 22, fontWeight: '700', letterSpacing: -0.35, lineHeight: 28 },
  title3:     { fontSize: 20, fontWeight: '600', letterSpacing: -0.3, lineHeight: 25 },
  headline:   { fontSize: 17, fontWeight: '600', letterSpacing: -0.43, lineHeight: 22 },
  body:       { fontSize: 17, fontWeight: '400', letterSpacing: -0.43, lineHeight: 22 },
  callout:    { fontSize: 15, fontWeight: '400', letterSpacing: -0.23, lineHeight: 20 },
  subhead:    { fontSize: 15, fontWeight: '500', letterSpacing: -0.22, lineHeight: 20 },
  footnote:   { fontSize: 13, fontWeight: '500', letterSpacing: -0.08, lineHeight: 18 },
  caption1:   { fontSize: 12, fontWeight: '500', letterSpacing: 0,    lineHeight: 16 },
  caption2:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.5,  lineHeight: 14 },
  hero:       { fontSize: 36, fontWeight: '700', letterSpacing: -1.2, lineHeight: 42 },
};

/** Variants that should ALWAYS use tabular-nums (numerics align in tables). */
export const tabularVariants = new Set<TypeVariant>([
  'largeTitle',
  'title1',
  'title2',
  'title3',
  'headline',
  'hero',
]);
