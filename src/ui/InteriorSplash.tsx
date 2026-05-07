/**
 * InteriorSplash — first-paint loading screen.
 *
 * Pixel-port of `interior os/src/screens-auth.jsx::SplashScreen`:
 *   • soft radial accent backdrop
 *   • faint architectural grid (via `<HatchGrid/>`)
 *   • monogram disc with an outer ring that draws in (via `<MonogramDisc animated/>`)
 *   • wordmark + tagline that fade-up sequentially
 *   • bottom progress bar that scales from 0 → 100% width
 *   • locality stamp in mono (via `<Stamp/>`)
 *
 * Refactored to share primitives + brand strings with the auth
 * screens — `src/ui/brand/HatchGrid`, `MonogramDisc`, `Wordmark`,
 * `Stamp`, and `src/features/brand/brand.ts`. The wordmark + tagline
 * are rendered inline (not via `<Wordmark/>`) because they need
 * staggered animations specific to the splash; everywhere else
 * uses the static `<Wordmark/>` component.
 *
 * Dismissal model — three knobs:
 *   • `minDuration` (default 1400 ms) — animation MUST play for at
 *     least this long. Prevents an ugly flash if auth resolves in
 *     50 ms from a cached session.
 *   • `ready` (optional, default `true`) — once min has passed AND
 *     ready is true, dismiss. Lets the host couple dismissal to a
 *     real readiness signal (auth bootstrap done, first paint of
 *     the next screen ready, etc.) so the user never sees a dead
 *     spinner BEHIND the splash.
 *   • `maxDuration` (default 2400 ms) — hard ceiling. Even if `ready`
 *     never flips (network stuck, callable wedged), dismiss anyway
 *     so the user gets to interact with whatever state the app has.
 *
 * Practical effect for cold start of a returning user:
 *   - AuthProvider does its ~300 ms userDoc read in parallel with
 *     the splash animation
 *   - At 1400 ms (min), auth is already ready → dismiss
 *   - User lands on the dashboard with no extra spinner gap
 * For a slow first-sign-in / invited user:
 *   - AuthProvider's blocking chain takes 2–3 s
 *   - At 1400 ms the splash holds (min reached but ready=false)
 *   - When auth flips ready or 2400 ms elapses (whichever first),
 *     splash dismisses — no centered-ActivityIndicator gap visible
 */
import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { color, fontFamily } from '@/src/theme/tokens';
import { BRAND } from '@/src/features/brand/brand';

import { HatchGrid } from './brand/HatchGrid';
import { Stamp } from './brand/Stamp';

// Resolved at module-load time so RN's bundler picks it up.
const APP_ICON = require('../../assets/images/icon.png');

export type InteriorSplashProps = {
  /** Minimum on-screen time. Animation will not dismiss before this. */
  minDuration?: number;
  /** Hard ceiling. Splash dismisses at this point regardless of `ready`. */
  maxDuration?: number;
  /** Backwards-compat alias for `minDuration`. */
  duration?: number;
  /** Host signals readiness of whatever the splash is covering for.
   *  Splash dismisses at `max(minDuration elapsed, ready=true)`. Default
   *  `true` so callers that don't pass this get the original behaviour. */
  ready?: boolean;
  onDone?: () => void;
  /** Brand monogram inside the disc. Defaults to `BRAND.monogram`. */
  monogram?: string;
  /** Wordmark — defaults to `BRAND.wordmark`. */
  wordmark?: string;
  /** Tagline below wordmark. Defaults to `BRAND.tagline`. */
  tagline?: string;
  /** Footer stamp. Defaults to `BRAND.stamp`. */
  stamp?: string;
};

export function InteriorSplash({
  minDuration,
  maxDuration = 2400,
  duration,
  ready = true,
  onDone,
  // monogram prop is deprecated — splash now uses the launcher PNG.
  // Kept on the type signature for backwards compatibility with old callers.
  monogram: _monogram,
  wordmark = BRAND.wordmark,
  tagline = BRAND.tagline,
  stamp = BRAND.stamp,
}: InteriorSplashProps) {
  // Resolve effective min duration. Older callers pass `duration`; new
  // callers pass `minDuration`. Default 1400 matches the original
  // single-knob behaviour.
  const effectiveMin = minDuration ?? duration ?? 1400;

  // Wall-clock mount time + dismissed flag persist across re-renders.
  // `ready` flipping mid-flight re-runs the effect, but elapsed time
  // and dismissed state must NOT reset — using refs keeps them stable.
  const mountedAtRef = useRef<number | null>(null);
  if (mountedAtRef.current === null) mountedAtRef.current = Date.now();
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (dismissedRef.current) return;
    const mountedAt = mountedAtRef.current ?? Date.now();
    const elapsed = Date.now() - mountedAt;
    const minRemaining = Math.max(0, effectiveMin - elapsed);
    const maxRemaining = Math.max(minRemaining, maxDuration - elapsed);

    const dismiss = () => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      onDone?.();
    };

    if (minRemaining <= 0 && ready) {
      dismiss();
      return;
    }

    const minTimer = setTimeout(() => {
      if (ready) dismiss();
    }, minRemaining);
    const maxTimer = setTimeout(() => {
      dismiss();
    }, maxRemaining);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, [effectiveMin, maxDuration, ready, onDone]);

  // Logo entrance: scale 0.92 → 1.02 → 1, fade 0 → 1
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.92);

  // Wordmark + tagline fade-up. Inline (not via <Wordmark/>) so we
  // can stagger the two with different delays.
  const wordOpacity = useSharedValue(0);
  const wordTranslate = useSharedValue(8);
  const tagOpacity = useSharedValue(0);
  const tagTranslate = useSharedValue(8);

  // Progress bar: scaleX 0 → 1 over 1100ms with 200ms delay
  const barScale = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, {
      duration: 520,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    });
    logoScale.value = withSequence(
      withTiming(1.02, { duration: 312, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
      withTiming(1, { duration: 208, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
    );

    wordOpacity.value = withDelay(360, withTiming(1, { duration: 480 }));
    wordTranslate.value = withDelay(
      360,
      withTiming(0, { duration: 480, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
    );
    tagOpacity.value = withDelay(460, withTiming(1, { duration: 480 }));
    tagTranslate.value = withDelay(
      460,
      withTiming(0, { duration: 480, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }),
    );

    barScale.value = withDelay(
      200,
      withTiming(1, { duration: 1100, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
    );
  }, [logoOpacity, logoScale, wordOpacity, wordTranslate, tagOpacity, tagTranslate, barScale]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateY: wordTranslate.value }],
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: tagOpacity.value,
    transform: [{ translateY: tagTranslate.value }],
  }));

  const barFillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: barScale.value }],
  }));

  return (
    <View style={styles.root}>
      {/* Faint architectural grid — slightly stronger here (0.18)
          than the auth screens (0.08) for first-impression weight. */}
      <HatchGrid opacity={0.18} />

      {/* App icon — uses the actual launcher PNG so the splash matches
          what the user sees on their home screen. The previous
          SquareMonogram (rounded-rect "iO" letterform) clipped on
          taller iOS layouts; the rasterised icon scales cleanly. */}
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Image
          source={APP_ICON}
          style={styles.logoImage}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>

      {/* Wordmark — inline so the staggered animation can drive its
          opacity/translateY independently of the tagline. */}
      <Animated.Text style={[styles.wordmark, wordStyle]}>{wordmark}</Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, tagStyle]}>{tagline}</Animated.Text>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, barFillStyle]} />
      </View>

      {/* Footer stamp */}
      <View style={styles.stampWrap}>
        <Stamp text={stamp} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.bgGrouped,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  logoWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 96,
    height: 96,
    // Match the iOS app-icon corner radius so the splash visually
    // continues from the launcher icon's rounded-square silhouette.
    borderRadius: 22,
  },

  wordmark: {
    marginTop: 22,
    fontFamily: fontFamily.sans,
    fontSize: 24,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.6,
  },
  tagline: {
    marginTop: 6,
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.textMuted,
    letterSpacing: 0.2,
  },

  barTrack: {
    position: 'absolute',
    bottom: 76,
    width: 120,
    height: 3,
    backgroundColor: color.borderStrong,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    height: '100%',
    backgroundColor: color.primary,
    transformOrigin: 'left center',
  },

  stampWrap: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
