/**
 * Spinner — InteriorOS-styled loading indicator.
 *
 * Rotating dashed ring. Mirrors the prototype's `spinnerRot` keyframe
 * (`@keyframes spinnerRot { to { transform: rotate(360deg) } }`). Built
 * on react-native-reanimated for 60fps.
 *
 *   <Spinner />              // default 28px, accent color
 *   <Spinner size={20} />
 *   <Spinner color="#fff" />
 */
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { color } from '@/src/theme/tokens';

export type SpinnerProps = {
  size?: number;
  color?: string;
  style?: ViewStyle;
};

export function Spinner({ size = 28, color: tint = color.primary, style }: SpinnerProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const stroke = Math.max(2, Math.round(size * 0.1));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={tint}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c * 0.25} ${c * 0.75}`}
            opacity={0.9}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={tint}
            strokeWidth={stroke}
            fill="none"
            opacity={0.12}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
