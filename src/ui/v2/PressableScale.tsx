/**
 * PressableScale — iOS-native "depress" feedback on touch.
 *
 * Wraps `Pressable` with a subtle scale-down (0.97 → 1.0) on press in,
 * spring back on press out. Optional opacity dim layered on top so the
 * surface still reads as "I'm being touched" against busy backgrounds.
 *
 * Why a wrapper instead of `Pressable`'s `({ pressed }) => ...` style:
 *   • `Pressable`'s pressed-style is a JS-thread re-render. Above ~16 ms
 *     of work it shows visible lag on the way down. The animated value
 *     here runs on the UI thread via reanimated, so the press ALWAYS
 *     follows the finger immediately, even if the JS thread is busy.
 *   • One opinionated motion across every tappable in the app — no two
 *     different "press feels" depending on the screen.
 *
 * Optional `haptic` prop fires a tactile cue at press-in (matches iOS
 * Mail/Notes/Settings — feedback at the start of the gesture, not on
 * release, so it feels responsive even on long-press).
 */
import { forwardRef, useCallback, type ReactNode, type Ref } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '@/src/lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressHapticKind = 'selection' | 'light' | 'medium' | 'heavy';

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  children?: ReactNode;
  /** Static style (or a function for `pressed`-aware extras). The
   *  scale animation is layered ON TOP of whatever style you pass. */
  style?: ViewStyle | ViewStyle[] | ((s: { pressed: boolean }) => ViewStyle | ViewStyle[]);
  /** Press-in scale target. Default 0.97 — visible without being
   *  cartoonish. Drop to 0.94 on big hero CTAs for extra weight. */
  scaleTo?: number;
  /** Layer a faint opacity dim on top of the scale. Default 0.92 (i.e.
   *  press fades to 92% opacity). Pass null to disable the dim. */
  pressOpacity?: number | null;
  /** Fire a tactile cue at press-in. Most useful on:
   *   • selection — chips, segmented control, row picked from list
   *   • light     — FAB, secondary action
   *   • medium    — primary CTA (Save / Continue)
   *   • heavy     — destructive confirm (Delete) */
  haptic?: PressHapticKind;
};

const SPRING_DOWN = {
  damping: 22,
  stiffness: 360,
  mass: 1,
} as const;

const SPRING_UP = {
  damping: 18,
  stiffness: 280,
  mass: 1,
} as const;

export const PressableScale = forwardRef(function PressableScale(
  {
    children,
    style,
    scaleTo = 0.97,
    pressOpacity = 0.92,
    haptic: hapticKind,
    onPressIn,
    onPressOut,
    disabled,
    ...rest
  }: PressableScaleProps,
  ref: Ref<View>,
) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(scaleTo, SPRING_DOWN);
      if (pressOpacity !== null) {
        opacity.value = withTiming(pressOpacity, { duration: 80 });
      }
      if (hapticKind) {
        if (hapticKind === 'selection') haptic.selection();
        else if (hapticKind === 'light') haptic.lightImpact();
        else if (hapticKind === 'medium') haptic.mediumImpact();
        else if (hapticKind === 'heavy') haptic.heavyImpact();
      }
      onPressIn?.(e);
    },
    [scaleTo, pressOpacity, hapticKind, onPressIn, scale, opacity],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(1, SPRING_UP);
      opacity.value = withTiming(1, { duration: 140 });
      onPressOut?.(e);
    },
    [onPressOut, scale, opacity],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // Pressable accepts a function for style; resolve to a flat array.
  const flatStyle = (typeof style === 'function'
    ? style({ pressed: false })
    : style) as ViewStyle | ViewStyle[] | undefined;

  return (
    <AnimatedPressable
      ref={ref}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        flatStyle as ViewStyle,
        animatedStyle,
        disabled && { opacity: 0.5 },
      ]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
