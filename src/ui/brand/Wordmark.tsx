/**
 * Wordmark — "InteriorOS" + optional tagline stack.
 *
 * Three sizes match the three places it appears:
 *   - `lg` — splash hero (24px wordmark / 12px tagline)
 *   - `md` — auth screen hero (22px / 12px) — slightly smaller
 *     so it doesn't crowd the form below
 *   - `sm` — header/inline (14px / 10px) — for places that need
 *     to assert brand identity in a compact slot
 *
 * Letter-spacing is tightened (negative) on the wordmark at every
 * size — gives the geometric sans the architectural feel.
 *
 * Reads strings from `BRAND` so renaming the studio later means
 * editing one file, not chasing every callsite.
 */
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily } from '@/src/theme/tokens';

import { BRAND } from '@/src/features/brand/brand';

/** Built-in iOS serif (no font load required), with system serif
 *  fallback on Android. Used by the auth-screen wordmark and the
 *  OTP "Verify OTP" header for an editorial, paper-like feel. */
const SERIF_FAMILY = Platform.select({ ios: 'Iowan Old Style', default: 'serif' });

export type WordmarkProps = {
  /** Visual scale. Default `md` (auth-screen hero). */
  size?: 'sm' | 'md' | 'lg';
  /** Show the tagline under the wordmark. Default true.
   *  Set false on the OTP-verify screen — brand was already
   *  introduced on sign-in, no need to repeat the tagline. */
  showTagline?: boolean;
  /** Wordmark typeface. `'sans'` (default) keeps the geometric
   *  system sans; `'serif'` switches to iOS-native Iowan Old Style
   *  (Android falls back to its system serif) for the editorial
   *  InteriorOS auth aesthetic. Tagline always stays sans. */
  font?: 'sans' | 'serif';
  /** Wordmark text alignment. Default `'center'`. Auth screens
   *  pass `'left'` so the brand block hangs in the upper-left
   *  third like a magazine masthead. */
  align?: 'left' | 'center';
  /** Override the brand wordmark / tagline (rare; useful for
   *  white-label deployments where BRAND can't be edited). */
  wordmark?: string;
  tagline?: string;
  style?: ViewStyle;
};

const SIZES = {
  sm: { wordmark: 14, tagline: 10, gap: 2 },
  md: { wordmark: 22, tagline: 12, gap: 4 },
  lg: { wordmark: 24, tagline: 12, gap: 6 },
} as const;

export function Wordmark({
  size = 'md',
  showTagline = true,
  font = 'sans',
  align = 'center',
  wordmark = BRAND.wordmark,
  tagline = BRAND.tagline,
  style,
}: WordmarkProps) {
  const dim = SIZES[size];
  const isSerif = font === 'serif';

  return (
    <View style={[styles.root, align === 'left' && styles.alignLeft, style]}>
      <Text
        style={{
          color: color.text,
          fontSize: isSerif ? dim.wordmark + 2 : dim.wordmark,
          lineHeight: isSerif ? (dim.wordmark + 2) * 1.3 : undefined,
          fontWeight: '700',
          letterSpacing: isSerif ? -0.3 : -0.6,
          fontFamily: isSerif ? SERIF_FAMILY : fontFamily.sans,
        }}
      >
        {wordmark}
      </Text>
      {showTagline ? (
        <Text
          style={{
            marginTop: dim.gap,
            color: color.textMuted,
            fontSize: dim.tagline,
            fontWeight: '400',
            // Tagline always stays sans + uppercase-like tracking
            // when paired with serif wordmark — adds the editorial
            // small-caps feel without needing a real small-caps font.
            letterSpacing: isSerif ? 1.2 : 0.2,
            textTransform: isSerif ? 'uppercase' : 'none',
            fontFamily: fontFamily.sans,
          }}
        >
          {tagline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  alignLeft: {
    alignItems: 'flex-start',
  },
});
