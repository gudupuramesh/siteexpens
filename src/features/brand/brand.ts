/**
 * Single source of truth for the InteriorOS brand strings.
 *
 * Used by:
 *   - `src/ui/InteriorSplash.tsx` (cold-start splash)
 *   - `src/ui/brand/Wordmark.tsx` (wordmark + tagline stack)
 *   - `src/ui/brand/MonogramDisc.tsx` (monogram default)
 *   - `src/ui/brand/Stamp.tsx` (footer stamp)
 *   - `app/(auth)/sign-in.tsx` + `app/(auth)/verify.tsx` (auth chrome)
 *
 * The strings are deliberately not localised — the brand identity
 * stays the same in every locale. If we ever add a locale that
 * requires translating "Studio · Projects · Ledger" we'd swap the
 * tagline only, leaving wordmark + monogram + stamp intact.
 *
 * Renaming the studio (e.g. for white-label deployments) means
 * editing one file. That's the whole point of pulling these out.
 */

export const BRAND = {
  /** The product name. Renders as `largeTitle` weight in the
   *  wordmark stack. */
  wordmark: 'InteriorOS',
  /** One-line value-prop. Sits under the wordmark on splash + sign-in.
   *  `·` chosen as the separator (cleaner than dashes for the small
   *  type sizes we use it at). */
  tagline: 'Studio · Projects · Ledger',
  /** Two-character monogram for the disc avatar. Kept short so it
   *  reads cleanly at the splash size (96px) AND the auth size (56-64px). */
  monogram: 'iO',
  /** Footer trust line shown on the cold-start splash. Matches the
   *  trust-badge tagline on the sign-in screen so first impression is
   *  consistent end-to-end. */
  stamp: '#1 APP FOR INTERIOR DESIGNERS',
} as const;

export type Brand = typeof BRAND;
