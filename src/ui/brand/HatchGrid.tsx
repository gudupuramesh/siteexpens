/**
 * HatchGrid — faint architectural grid background, the InteriorOS
 * signature backdrop motif.
 *
 * Lifted out of `InteriorSplash` so the auth screens (sign-in,
 * OTP verify) can share the same atmosphere. Renders a single
 * SVG `<Pattern>` of perpendicular hairlines tiled to fill its
 * parent's layout bounds.
 *
 * Visual rule of thumb: opacity 0.06–0.10 on a near-white canvas
 * reads as "atmospheric grid, not noise". Above 0.18 it becomes
 * busy and competes with foreground content.
 *
 * Drop this absolute-positioned behind your screen content:
 *
 *   <View style={{ flex: 1 }}>
 *     <HatchGrid />
 *     <YourContent />
 *   </View>
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import { color } from '@/src/theme';

export type HatchGridProps = {
  /** Edge length of one grid square in pts. Default 32. Smaller =
   *  denser grid; larger = more breathing room. */
  cellSize?: number;
  /** Stroke colour of the grid lines. Defaults to `color.borderStrong`
   *  (slate-200). Pass `color.primary` for a tinted accent variant. */
  strokeColor?: string;
  /** Layer opacity. Default 0.10 (subtle). Splash uses 0.18 — bump
   *  it up there for first-impression emphasis; keep auth at 0.08
   *  so the form is clearly the focus. */
  opacity?: number;
  /** Stroke width in pts. Default 1 — keep at 1 unless you need a
   *  bolder look. */
  strokeWidth?: number;
  /** Style override on the wrapping View, in case you want to crop
   *  the grid to a specific region instead of full-bleed. By default
   *  fills the parent. */
  style?: ViewStyle;
};

export function HatchGrid({
  cellSize = 32,
  strokeColor = color.borderStrong,
  opacity = 0.1,
  strokeWidth = 1,
  style,
}: HatchGridProps) {
  // Each Pattern cell draws an L (top edge + left edge of the cell).
  // Tiled, the L's chain together into a continuous orthogonal grid
  // — same trick used in CSS background patterns.
  const path = `M ${cellSize} 0 L 0 0 0 ${cellSize}`;
  // SVG Pattern needs a unique id PER instance — we synthesize one
  // from cellSize+stroke+opacity so two HatchGrids in the same view
  // don't collide. (`Math.random` would also work but is unstable
  // across renders and would fight reanimated's diffing.)
  const patternId = `hatchgrid-${cellSize}-${opacity}`;

  return (
    <Svg
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
      width="100%"
      height="100%"
      opacity={opacity}
    >
      <Defs>
        <Pattern
          id={patternId}
          width={cellSize}
          height={cellSize}
          patternUnits="userSpaceOnUse"
        >
          <Path
            d={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </Svg>
  );
}
