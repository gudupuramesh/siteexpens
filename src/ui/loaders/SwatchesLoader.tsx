/**
 * SwatchesLoader — three vertical bars bouncing.
 *
 * Default fallback loader across the app — replaces ActivityIndicator
 * everywhere. Smallest footprint, most universal. Recolored from the
 * web prototype's neutral-800 to brand blue (color.primary) so it
 * carries Interior OS identity.
 *
 * Sized for inline use (e.g. inside row items, list-loading states).
 * For full-screen overlays use LoaderOverlay (TBD) with a larger scale.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { color } from '@/src/theme';

type Props = {
  /** Bar height at peak. Default 32. Scale linearly for larger contexts. */
  size?: number;
  /** Override colour. Defaults to brand primary. */
  tint?: string;
};

const BOUNCE_DURATION = 600;

export function SwatchesLoader({ size = 32, tint = color.primary }: Props) {
  const barHeight = size;
  const barWidth = Math.max(4, Math.round(size / 6));
  const gap = Math.max(2, Math.round(size / 12));

  return (
    <View style={[styles.row, { gap }]}>
      <Bar width={barWidth} height={barHeight} tint={tint} delay={0} />
      <Bar width={barWidth} height={barHeight} tint={tint} delay={120} />
      <Bar width={barWidth} height={barHeight} tint={tint} delay={240} />
    </View>
  );
}

function Bar({
  width,
  height,
  tint,
  delay,
}: {
  width: number;
  height: number;
  tint: string;
  delay: number;
}) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-height / 2, { duration: BOUNCE_DURATION, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: BOUNCE_DURATION, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [offset, delay, height]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <Animated.View
      style={[
        { width, height, backgroundColor: tint, borderRadius: 1 },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
});
