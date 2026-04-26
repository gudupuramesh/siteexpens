/**
 * InteriorSplash — first-paint loading screen.
 *
 * Pixel-port of `interior os/src/screens-auth.jsx::SplashScreen`:
 *   • soft radial accent backdrop
 *   • faint architectural grid
 *   • monogram disc with an outer ring that draws in
 *   • wordmark + tagline that fade-up sequentially
 *   • bottom progress bar that scales from 0 → 100% width
 *   • locality stamp in mono
 *
 * Auto-dismisses after `duration` ms (default 1400) by calling onDone.
 * Keep this on screen for first app launch, AND for any screen waiting
 * on a long async load — we'll opt-in via the `<SplashOverlay/>` host.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Pattern, Path, Rect } from 'react-native-svg';

import { color, fontFamily } from '@/src/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type InteriorSplashProps = {
  duration?: number;
  onDone?: () => void;
  /** Brand monogram inside the disc. Defaults to "iO" from the prototype. */
  monogram?: string;
  /** Wordmark — defaults to "InteriorOS". */
  wordmark?: string;
  /** Tagline below wordmark. */
  tagline?: string;
  /** Footer stamp (uppercase mono). */
  stamp?: string;
};

export function InteriorSplash({
  duration = 1400,
  onDone,
  monogram = 'iO',
  wordmark = 'InteriorOS',
  tagline = 'Studio · Projects · Ledger',
  stamp = 'HYDERABAD · 2026',
}: InteriorSplashProps) {
  // Auto-dismiss
  useEffect(() => {
    const id = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(id);
  }, [duration, onDone]);

  // Logo entrance: scale 0.92 → 1.02 → 1, fade 0 → 1
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.92);

  // Ring draw: dashOffset 220 → 0 over 800ms with 120ms delay
  const ringOffset = useSharedValue(220);

  // Wordmark + tagline fade-up
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

    ringOffset.value = withDelay(
      120,
      withTiming(0, {
        duration: 800,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      }),
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
  }, [logoOpacity, logoScale, ringOffset, wordOpacity, wordTranslate, tagOpacity, tagTranslate, barScale]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: ringOffset.value,
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
      {/* faint architectural grid */}
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        opacity={0.18}
      >
        <Defs>
          <Pattern id="splashgrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <Path d="M 32 0 L 0 0 0 32" fill="none" stroke={color.borderStrong} strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#splashgrid)" />
      </Svg>

      {/* Logo */}
      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Svg width="92" height="92" viewBox="0 0 92 92">
          {/* outer ring (drawn) */}
          <AnimatedCircle
            cx="46"
            cy="46"
            r="35"
            fill="none"
            stroke={color.primary}
            strokeWidth="2"
            strokeDasharray="220"
            strokeLinecap="round"
            animatedProps={ringProps}
          />
          {/* inner solid disc */}
          <Circle cx="46" cy="46" r="26" fill={color.primary} />
        </Svg>
        {/* monogram (text overlaid via absolute positioning) */}
        <View style={styles.monogramWrap} pointerEvents="none">
          <Text style={styles.monogram}>{monogram}</Text>
        </View>
      </Animated.View>

      {/* Wordmark */}
      <Animated.Text style={[styles.wordmark, wordStyle]}>{wordmark}</Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, tagStyle]}>{tagline}</Animated.Text>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, barFillStyle]} />
      </View>

      {/* Footer stamp */}
      <Text style={styles.stamp}>{stamp}</Text>
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
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogram: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
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

  stamp: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textFaint,
    letterSpacing: 1.2,
    fontWeight: '600',
  },
});
