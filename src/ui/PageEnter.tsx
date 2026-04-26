/**
 * PageEnter — InteriorOS page-transition wrapper.
 *
 * Mirrors the prototype's `pageEnter` keyframe:
 *   from { opacity: 0; transform: translateY(6px) }
 *   to   { opacity: 1; transform: translateY(0) }
 *   180ms cubic-bezier(.2, .8, .2, 1)
 *
 * Drop this around any screen body that should ease in on mount or when
 * its `viewKey` changes (e.g. tab switch, navigation push). Children
 * remount when `viewKey` changes so the animation re-fires.
 *
 *   <PageEnter viewKey={tab}>...</PageEnter>
 */
import { useEffect } from 'react';
import { type ReactNode } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type PageEnterProps = {
  children: ReactNode;
  viewKey?: string | number;
  /** Duration in ms (default 180). */
  duration?: number;
  /** Distance in px to translate up from (default 6). */
  distance?: number;
};

export function PageEnter({
  children,
  viewKey,
  duration = 180,
  distance = 6,
}: PageEnterProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(distance);

  useEffect(() => {
    opacity.value = 0;
    translateY.value = distance;
    opacity.value = withTiming(1, {
      duration,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    });
    translateY.value = withTiming(0, {
      duration,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    });
  }, [viewKey, duration, distance, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
