/**
 * BlueprintLoader — rectangle perimeter + center crosshair drawn with
 * stroke-dash animation. Architectural / drafting feel — used on the
 * Projects tab loading state.
 *
 * Recolored from the web prototype's neutral-800 to color.text on
 * color.surface canvas.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';

import { color } from '@/src/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedLine = Animated.createAnimatedComponent(Line);

type Props = {
  /** Bounding box. Default 56. */
  size?: number;
  /** Stroke colour. Defaults to color.text. */
  tint?: string;
};

const CYCLE_MS = 1500;
const RECT_PERIMETER = 80; // 4 * 20 (rect side length)
const LINE_LENGTH = 20;

export function BlueprintLoader({ size = 56, tint = color.text }: Props) {
  const rectProgress = useSharedValue(RECT_PERIMETER);
  const horizProgress = useSharedValue(LINE_LENGTH);
  const vertProgress = useSharedValue(LINE_LENGTH);

  useEffect(() => {
    rectProgress.value = withRepeat(
      withTiming(0, { duration: CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    horizProgress.value = withDelay(
      200,
      withRepeat(
        withTiming(0, { duration: CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    vertProgress.value = withDelay(
      400,
      withRepeat(
        withTiming(0, { duration: CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [rectProgress, horizProgress, vertProgress]);

  const rectProps = useAnimatedProps(() => ({
    strokeDashoffset: rectProgress.value,
  }));
  const horizProps = useAnimatedProps(() => ({
    strokeDashoffset: horizProgress.value,
  }));
  const vertProps = useAnimatedProps(() => ({
    strokeDashoffset: vertProgress.value,
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <AnimatedRect
          x="2"
          y="2"
          width="20"
          height="20"
          stroke={tint}
          strokeWidth="1"
          strokeDasharray={RECT_PERIMETER}
          animatedProps={rectProps}
        />
        <AnimatedLine
          x1="2"
          y1="12"
          x2="22"
          y2="12"
          stroke={tint}
          strokeWidth="1"
          strokeDasharray={LINE_LENGTH}
          animatedProps={horizProps}
        />
        <AnimatedLine
          x1="12"
          y1="2"
          x2="12"
          y2="22"
          stroke={tint}
          strokeWidth="1"
          strokeDasharray={LINE_LENGTH}
          animatedProps={vertProps}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
