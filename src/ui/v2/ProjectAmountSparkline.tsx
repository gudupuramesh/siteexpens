/**
 * ProjectAmountSparkline — tiny axis-less bar chart of per-project
 * amounts, sitting next to the NET BALANCE hero number on the home
 * tab Summary card.
 *
 * Visual rules:
 *   - One bar per project, ordered by descending absolute balance
 *     (most-active projects on the left).
 *   - Bar HEIGHT scales to |balance| / max|balance|. The single
 *     biggest project sets the ceiling; smaller projects render
 *     proportionally.
 *   - Bar COLOR encodes sign:
 *       positive balance → green
 *       negative balance → red
 *       dummy / placeholder → grey (fill3)
 *   - When the studio has fewer than `targetCount` real bars, the
 *     remaining slots render as DUMMY grey bars in a fixed varied
 *     pattern. This gives the chart a visible "shape" on day-one
 *     studios with one project, and gradually fills with real bars
 *     as the user adds projects + revenue.
 *
 * Entrance animation:
 *   - On first mount, every bar grows from h=0 to its target h with
 *     a small left-to-right stagger (~30 ms per bar). Easing is
 *     `Easing.out(Easing.cubic)` — quick start, soft landing — so
 *     the whole strip "settles" into place over ~600 ms.
 *   - Animation fires only ONCE per mount. Subsequent re-renders
 *     (data changes, theme flip) update bar heights without
 *     replaying the entrance.
 *
 * Implementation: pure RN <View>s wrapped in `Animated.View` from
 * Reanimated. SVG would be overkill — flexbox renders the strip just
 * as cheaply and keeps the bundle leaner.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useThemeV2 } from '@/src/theme/v2';

/** Single bar input. `value` drives both height (via |value|) and
 *  color (via sign). Pass `isDummy: true` to force grey rendering
 *  with a deterministic pattern height, ignoring `value`. */
export type SparkBar = { value: number; isDummy?: boolean };

/** Fraction-of-height pattern used for dummy bars. Picked to look
 *  like a varied "real" chart at a glance — one tall, one short,
 *  one medium — rather than a flat skeleton stripe. The component
 *  cycles through these by index so the same indexes always get the
 *  same heights → the chart doesn't reshuffle on re-render. */
const DUMMY_HEIGHT_PATTERN = [0.6, 0.35, 0.78, 0.45, 0.55, 0.3, 0.7, 0.4];

/** Total entrance animation budget (ms). Each bar starts at index *
 *  STAGGER_MS and runs for BAR_DURATION_MS. Tune both together so
 *  the last bar's animation finishes before the user notices. */
const STAGGER_MS = 35;
const BAR_DURATION_MS = 360;

export type ProjectAmountSparklineProps = {
  /** Bars in display order, left → right. Real bars first; dummies
   *  pad the tail when the caller has fewer than its target count. */
  bars: SparkBar[];
  /** Total chart width in px. Bar width is computed by dividing by
   *  bar count (minus inter-bar gaps). */
  width: number;
  /** Total chart height in px. Bars fill bottom→top up to this. */
  height: number;
  /** Tap handler. Typically routes to the Finance tab. */
  onPress?: () => void;
};

export function ProjectAmountSparkline({
  bars,
  width,
  height,
  onPress,
}: ProjectAmountSparklineProps) {
  const t = useThemeV2();

  // Compute the magnitude scale across REAL bars only — dummies use
  // the fixed pattern fractions and shouldn't influence the scale.
  const maxAbs = useMemo(() => {
    let m = 0;
    for (const b of bars) {
      if (b.isDummy) continue;
      const a = Math.abs(b.value);
      if (a > m) m = a;
    }
    return m;
  }, [bars]);

  const gap = 2;
  const barWidth = Math.max(
    2,
    (width - gap * Math.max(0, bars.length - 1)) / Math.max(1, bars.length),
  );
  // Reserve a tiny floor so even a near-zero real bar still shows up
  // (so the user doesn't think a project is missing).
  const minRealHeight = 4;

  const greenBg =
    t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft;
  const redBg = t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft;
  const dummyBg = t.colors.fill3;

  // Per-bar geometry resolved up-front; the animated component just
  // tweens height from 0 → targetHeight on mount.
  const resolved = useMemo(() => {
    return bars.map((b, i) => {
      let targetHeight: number;
      let bg: string;
      if (b.isDummy || maxAbs === 0) {
        const frac =
          DUMMY_HEIGHT_PATTERN[i % DUMMY_HEIGHT_PATTERN.length];
        targetHeight = Math.max(minRealHeight, frac * height);
        bg = dummyBg;
      } else {
        const a = Math.abs(b.value);
        const frac = a / maxAbs; // 0…1
        targetHeight = Math.max(minRealHeight, frac * height);
        bg = b.value >= 0 ? greenBg : redBg;
      }
      return { targetHeight, bg };
    });
  }, [bars, maxAbs, height, dummyBg, greenBg, redBg]);

  const Inner = (
    <View
      style={[
        styles.row,
        {
          width,
          height,
          borderRadius: 4,
        },
      ]}
    >
      {resolved.map((r, i) => (
        <AnimatedBar
          key={i}
          index={i}
          width={barWidth}
          targetHeight={r.targetHeight}
          color={r.bg}
          marginRight={i === resolved.length - 1 ? 0 : gap}
        />
      ))}
    </View>
  );

  if (!onPress) return Inner;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel="Per-project amount chart — open finance"
    >
      {Inner}
    </Pressable>
  );
}

// ── AnimatedBar ─────────────────────────────────────────────────────
// One <Animated.View> per slot. Height SharedValue starts at 0, then
// `withDelay(index * STAGGER_MS, withTiming(targetHeight))` rises into
// place. The animation fires ONCE on mount (the empty `[]` dep). Later
// data changes update `targetHeight` directly via a separate effect so
// the chart breathes when totals shift without replaying the entrance.

function AnimatedBar({
  index,
  width,
  targetHeight,
  color,
  marginRight,
}: {
  index: number;
  width: number;
  targetHeight: number;
  color: string;
  marginRight: number;
}) {
  const h = useSharedValue(0);
  // Track the most recent target so the post-mount data-change effect
  // animates against a fresh value (closures capture once).
  const targetRef = useRef(targetHeight);
  targetRef.current = targetHeight;

  useEffect(() => {
    // Entrance — fires once.
    h.value = withDelay(
      index * STAGGER_MS,
      withTiming(targetHeight, {
        duration: BAR_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Data-driven re-flow (e.g. a new transaction lands) — short
    // tween, no stagger, so the bar simply morphs.
    if (h.value !== targetHeight) {
      h.value = withTiming(targetHeight, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: h.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          backgroundColor: color,
          marginRight,
          borderTopLeftRadius: 1.5,
          borderTopRightRadius: 1.5,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    overflow: 'hidden',
  },
});
