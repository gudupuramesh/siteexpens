/**
 * MonogramDisc — the brand "iO" disc.
 *
 * Two modes:
 *   - **Static** (default): inner disc + monogram letters only.
 *     Auth screens use this so the disc reads as a brand mark, not
 *     a busy animation that fights the form.
 *   - **Animated** (`animated={true}`): adds the outer ring drawn
 *     in over 800 ms via SVG strokeDasharray. Splash uses this for
 *     first-impression flourish.
 *
 * Sized via the `size` prop in pts. The internal geometry scales
 * with size:
 *   - inner disc radius   = 0.28 * size
 *   - outer ring radius   = 0.38 * size
 *   - monogram font size  = 0.24 * size
 *
 * These ratios are tuned against the original splash sizing
 * (size=92 → disc r=26, ring r=35, font=22). Keep them; tweaking
 * one without the others throws the visual balance.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/src/ui/Text';
import { color, fontFamily } from '@/src/theme/tokens';

import { BRAND } from '@/src/features/brand/brand';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type MonogramDiscProps = {
  /** Disc bounding box edge in pts. Default 64 (auth-screen size).
   *  Splash passes 92. Footer rosters could go down to ~32. */
  size?: number;
  /** Override the displayed letters. Defaults to `BRAND.monogram`. */
  monogram?: string;
  /** When true, draws the outer ring in via strokeDasharray
   *  animation. When false (default), only the inner disc + letters
   *  render — instantly, no animation. */
  animated?: boolean;
  /** Delay in ms before the ring starts drawing (animated only).
   *  Lets callers stagger the disc behind a wordmark fade-in.
   *  Default 120 — matches splash. */
  ringDelay?: number;
  /** Style override on the wrapping View. */
  style?: ViewStyle;
};

export function MonogramDisc({
  size = 64,
  monogram = BRAND.monogram,
  animated = false,
  ringDelay = 120,
  style,
}: MonogramDiscProps) {
  // Geometry derived from `size` so all callers stay in proportion.
  const center = size / 2;
  const innerRadius = size * 0.28;
  const outerRadius = size * 0.38;
  const fontSize = size * 0.24;
  // Circumference of the outer ring — matters for the dash-offset
  // animation. circumference = 2πr, rounded up so the dash fully
  // hides the stroke at the start.
  const circumference = Math.ceil(2 * Math.PI * outerRadius);

  const ringOffset = useSharedValue(animated ? circumference : 0);
  useEffect(() => {
    if (!animated) return;
    ringOffset.value = withDelay(
      ringDelay,
      withTiming(0, {
        duration: 800,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      }),
    );
  }, [animated, ringDelay, ringOffset]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: ringOffset.value,
  }));

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer ring — only visible when animated; static mode skips
            it entirely so the disc reads as a clean filled circle. */}
        {animated ? (
          <AnimatedCircle
            cx={center}
            cy={center}
            r={outerRadius}
            fill="none"
            stroke={color.primary}
            strokeWidth={2}
            strokeDasharray={circumference}
            strokeLinecap="round"
            animatedProps={ringProps}
          />
        ) : null}
        {/* Inner solid disc — the canonical brand shape. */}
        <Circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill={color.primary}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: color.onPrimary,
              fontSize,
              fontWeight: '700',
              letterSpacing: -0.5,
              fontFamily: fontFamily.sans,
              // Optical centering — descenders / x-height drift the
              // visual centre slightly down; this nudges the letters
              // back to the geometric centre of the disc.
              transform: [{ translateY: -fontSize * 0.04 }],
            }}
          >
            {monogram}
          </Text>
        </View>
      </View>
    </View>
  );
}
