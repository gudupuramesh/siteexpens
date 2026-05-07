/**
 * IsometricLoader — 3D house outline traced with stroke-dash animation.
 *
 * Brand-defining loader. Used at app cold start (splash → auth → first
 * tab) and other moments where the user is waiting on a meaningful
 * boot-time operation. The 3D-house silhouette signals "Interior OS"
 * identity at a glance.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { color } from '@/src/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  /** Bounding box. Default 64. */
  size?: number;
  /** Stroke colour. Defaults to color.text. */
  tint?: string;
};

const CYCLE_MS = 2000;
const PATH_LENGTH = 100;

export function IsometricLoader({ size = 64, tint = color.text }: Props) {
  const progress = useSharedValue(PATH_LENGTH);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(0, { duration: CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value,
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* Outer house silhouette — the animated stroke */}
        <AnimatedPath
          d="M12 2L2 7v10l10 5 10-5V7L12 2z"
          stroke={tint}
          strokeWidth="1"
          strokeDasharray={PATH_LENGTH}
          animatedProps={animatedProps}
        />
        {/* Interior structure lines — static at 50% opacity */}
        <Path
          d="M12 22V12M2 7l10 5 10-5"
          stroke={tint}
          strokeWidth="1"
          opacity={0.5}
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
