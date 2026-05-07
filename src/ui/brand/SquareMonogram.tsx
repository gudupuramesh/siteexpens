/**
 * SquareMonogram — square rounded "iO" brand mark.
 *
 * Two modes:
 *   - **Static** (default): filled square + monogram letters.
 *   - **Animated** (`animated={true}`): adds an outer rounded-rect
 *     ring that draws in via SVG strokeDasharray. Used by the splash.
 *
 * Geometry:
 *   - corner radius = size * 0.29 (48 → ~14)
 *   - font size     = size * 0.42 (48 → 20)
 *   - ring inset    = 6pt from edge, same corner ratio
 */
import { useEffect } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { Text } from '@/src/ui/Text';
import { color } from '@/src/theme/tokens';

import { BRAND } from '@/src/features/brand/brand';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const SERIF_FAMILY = Platform.select({ ios: 'Iowan Old Style', default: 'serif' });

export type SquareMonogramProps = {
  size?: number;
  monogram?: string;
  animated?: boolean;
  ringDelay?: number;
  style?: ViewStyle;
};

function roundedRectPerimeter(w: number, h: number, r: number): number {
  return 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
}

export function SquareMonogram({
  size = 48,
  monogram = 'iO',
  animated = false,
  ringDelay = 120,
  style,
}: SquareMonogramProps) {
  const cornerRadius = size * 0.29;
  const fontSize = size * 0.42;

  const ringGap = 6;
  const ringSize = size + ringGap * 2;
  const ringCorner = cornerRadius + ringGap;
  const perimeter = roundedRectPerimeter(ringSize, ringSize, ringCorner);

  const ringOffset = useSharedValue(animated ? perimeter : 0);
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

  const outerSize = animated ? ringSize : size;

  return (
    <View
      style={[
        { width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      {animated ? (
        <Svg
          width={outerSize}
          height={outerSize}
          viewBox={`0 0 ${outerSize} ${outerSize}`}
          style={StyleSheet.absoluteFill}
        >
          <AnimatedRect
            x={1}
            y={1}
            width={outerSize - 2}
            height={outerSize - 2}
            rx={ringCorner}
            ry={ringCorner}
            fill="none"
            stroke={color.primary}
            strokeWidth={2}
            strokeDasharray={perimeter}
            strokeLinecap="round"
            animatedProps={ringProps}
          />
        </Svg>
      ) : null}
      <View
        style={[
          styles.inner,
          { width: size, height: size, borderRadius: cornerRadius },
        ]}
      >
        <Text
          style={{
            color: color.onPrimary,
            fontSize,
            fontWeight: '700',
            letterSpacing: -0.5,
            fontFamily: SERIF_FAMILY,
            transform: [{ translateY: -fontSize * 0.04 }],
          }}
        >
          {monogram}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inner: {
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
