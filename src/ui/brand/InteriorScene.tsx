/**
 * InteriorScene — minimalist line-art interior on a clean white field.
 *
 * Drawn against a 390×844 viewBox and scaled with
 * `preserveAspectRatio="xMidYMid slice"` so it fills any device.
 *
 * Composition (bottom-anchored so the form sits on a clean white area):
 *   • Wood-floor perspective lines fanning to a vanishing point above
 *     the sofa — gives the scene depth without clutter
 *   • Centered sofa with two cushions, tufting buttons, and small legs
 *   • Tall potted plant on the left with sword-like leaves; two leaves
 *     pick up a brand-red accent
 *   • Arching floor lamp on the right with a dome shade and a single
 *     red bulb glowing inside — the visual focal point
 *
 * Stroke is thin and quiet (#CAD0DA at ~1px) so the illustration
 * recedes behind the form. Red accents are kept tiny — exactly two
 * leaves and the lamp bulb — so they read as "carefully considered"
 * rather than decorative noise.
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Ellipse,
  G,
  Line,
  Path,
  Rect,
} from 'react-native-svg';

export type InteriorSceneProps = {
  opacity?: number;
  style?: ViewStyle;
};

const STROKE = '#CAD0DA';
const ACCENT = '#E63946';
const STROKE_W = 1.1;

export function InteriorScene({ opacity = 1, style }: InteriorSceneProps) {
  return (
    <Svg
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
      width="100%"
      height="100%"
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMid slice"
      opacity={opacity}
    >
      {/* Pure white field */}
      <Rect width={390} height={844} fill="#FFFFFF" />

      {/* Wood-floor perspective — lines fan from VP at (195, 540) down
          to the bottom edge. Only the bottom band of the canvas is
          inked, so the upper white area stays clear for the form. */}
      <G stroke="#DEE2EA" strokeWidth={0.7} fill="none">
        <Line x1={-60} y1={780} x2={195} y2={540} />
        <Line x1={-10} y1={780} x2={195} y2={540} />
        <Line x1={45} y1={780} x2={195} y2={540} />
        <Line x1={100} y1={780} x2={195} y2={540} />
        <Line x1={150} y1={780} x2={195} y2={540} />
        <Line x1={195} y1={780} x2={195} y2={540} />
        <Line x1={240} y1={780} x2={195} y2={540} />
        <Line x1={290} y1={780} x2={195} y2={540} />
        <Line x1={345} y1={780} x2={195} y2={540} />
        <Line x1={400} y1={780} x2={195} y2={540} />
        <Line x1={450} y1={780} x2={195} y2={540} />
        {/* Faint horizontal "floor edge" where wall meets floor */}
        <Line x1={0} y1={715} x2={390} y2={715} stroke="#D1D6DE" strokeWidth={0.6} />
      </G>

      {/* Plant — tall vase with sword-like leaves on the left */}
      <G stroke={STROKE} strokeWidth={STROKE_W} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Vase: narrow neck, gently flared body */}
        <Path d="M 58 632 L 60 700 Q 63 712 75 712 L 92 712 Q 104 712 107 700 L 109 632 Z" />
        <Line x1={60} y1={645} x2={107} y2={645} />
        {/* Grey leaves pointing up (slight variation in angle/length) */}
        <Path d="M 80 632 Q 76 580 70 530" />
        <Path d="M 84 632 Q 86 575 90 525" />
        <Path d="M 88 632 Q 96 580 108 540" />
        <Path d="M 76 632 Q 68 585 56 545" />
        <Path d="M 72 632 Q 60 590 46 565" />
      </G>
      {/* Brand-red accent leaves — only two, kept restrained */}
      <G stroke={ACCENT} strokeWidth={STROKE_W} fill="none" strokeLinecap="round">
        <Path d="M 78 632 Q 73 575 64 530" />
        <Path d="M 86 632 Q 92 580 102 538" />
      </G>

      {/* Sofa — centered on the floor, two cushions, tufted buttons */}
      <G stroke={STROKE} strokeWidth={STROKE_W + 0.15} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Outline: arms + back */}
        <Path d="M 110 705 L 110 615 Q 110 600 125 600 L 265 600 Q 280 600 280 615 L 280 705" />
        {/* Seat top */}
        <Path d="M 110 660 Q 110 655 116 655 L 274 655 Q 280 655 280 660" />
        {/* Cushion divider */}
        <Line x1={195} y1={600} x2={195} y2={655} />
        {/* Tufting buttons — tiny, like the reference */}
        <Circle cx={140} cy={622} r={1.6} />
        <Circle cx={170} cy={622} r={1.6} />
        <Circle cx={220} cy={622} r={1.6} />
        <Circle cx={250} cy={622} r={1.6} />
        {/* Front edge of seat (gives the cushion depth) */}
        <Line x1={120} y1={695} x2={270} y2={695} />
        {/* Legs */}
        <Line x1={122} y1={705} x2={117} y2={720} />
        <Line x1={268} y1={705} x2={273} y2={720} />
      </G>

      {/* Floor lamp — base, arching pole, dome shade, red bulb.
          Lamp head is positioned so the dome opening + bulb sit just
          below where the Send OTP button lands on screen — the button
          reads as "exactly at the end of the light". */}
      <G stroke={STROKE} strokeWidth={STROKE_W} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Disc base */}
        <Ellipse cx={335} cy={705} rx={22} ry={5} />
        <Line x1={335} y1={700} x2={335} y2={710} />
        {/* Pole rises, then arcs left toward the shade. Whole head
            is shifted ~114 units upward to track the now-higher CTA. */}
        <Path d="M 335 700 L 335 491 Q 335 414 285 414 L 268 414" />
        {/* Dome shade */}
        <Path d="M 248 414 L 244 446 Q 260 456 286 456 Q 296 456 296 446 L 290 414 Z" />
        {/* Filament suggestion line */}
        <Line x1={258} y1={429} x2={282} y2={429} />
      </G>
      {/* Single red bulb — the warm focal point of the scene */}
      <Circle cx={272} cy={449} r={5} fill={ACCENT} />
      <Circle cx={272} cy={449} r={5} stroke="#B7232E" strokeWidth={0.6} fill="none" />
    </Svg>
  );
}
