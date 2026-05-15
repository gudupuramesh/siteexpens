/**
 * AppearOnMount — iOS-native entrance animation wrapper.
 *
 * Wraps any view in a fade + slide + tiny scale animation that fires
 * once on mount. Used to give the auth screens (sign-in / verify) the
 * polished, hand-tuned feel iOS users expect from first-launch flows
 * — content settles into place rather than blinking onto the screen.
 *
 * iOS-style under the hood:
 *   • Spring physics (`withSpring`), not a bezier timing curve. iOS
 *     UIView animations and SwiftUI `.animation(.spring())` use mass-
 *     spring systems where things ease in, slightly overshoot, and
 *     settle. A bezier curve always lands on its target dead-on which
 *     reads as "computed" rather than "physical". The defaults below
 *     are tuned to match Apple's `.spring(response: 0.5, damping: 0.86)`
 *     — quick to reach, no visible bounce.
 *   • Subtle scale (0.97 → 1.0) joins the fade + slide so the surface
 *     reads as "settling forward into place" the way iOS sheets and
 *     popovers do.
 *
 * Reanimated is already a hard dep (used by SquareMonogram), so this
 * is zero new bundle weight.
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export type AppearOnMountProps = {
  children: ReactNode;
  /** Delay in ms before the animation starts. Default 0. */
  delay?: number;
  /** Vertical translation in pixels (positive = starts below).
   *  Default 14. Pass 0 for a pure fade. */
  rise?: number;
  /** Starting scale (1 = no scale-up). Default 0.97 — matches the
   *  iOS spring "settle into place" feel without being noticeable. */
  fromScale?: number;
  /** Optional starting opacity (default 0 → 1). */
  fromOpacity?: number;
  style?: ViewStyle | ViewStyle[];
};

/** iOS-style spring config — tuned to mirror SwiftUI
 *  `.spring(response: 0.5, damping: 0.86)`. Reaches target in ~500 ms
 *  with no visible bounce. */
const IOS_SPRING = {
  damping: 18,
  stiffness: 220,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
} as const;

/** Opacity uses a slightly faster spring so the fade-in finishes
 *  before the slide settles — the eye reads opacity faster than
 *  motion, so this keeps the two perceptually in sync. */
const IOS_SPRING_FAST = {
  damping: 22,
  stiffness: 260,
  mass: 1,
} as const;

export function AppearOnMount({
  children,
  delay = 0,
  rise = 14,
  fromScale = 0.97,
  fromOpacity = 0,
  style,
}: AppearOnMountProps) {
  const opacity = useSharedValue(fromOpacity);
  const translateY = useSharedValue(rise);
  const scale = useSharedValue(fromScale);

  useEffect(() => {
    // Opacity rides a quick timing curve — springs on opacity look
    // floaty because there's no physical referent for "bouncy
    // transparency". Material + SwiftUI both linearize alpha.
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
    );
    // Position + scale ride iOS spring physics so they settle the
    // way a real surface would.
    translateY.value = withDelay(delay, withSpring(0, IOS_SPRING));
    scale.value = withDelay(delay, withSpring(1, IOS_SPRING_FAST));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
