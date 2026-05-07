/**
 * InteriorScene — full-bleed background illustration for the auth screens.
 *
 * Drawn against a 390×844 viewBox and scaled with
 * `preserveAspectRatio="xMidYMid slice"` so it fills any device.
 */
import { StyleSheet, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

export type InteriorSceneProps = {
  opacity?: number;
  style?: ViewStyle;
};

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
      <Defs>
        <LinearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.7} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* Pure white base */}
      <Rect width={390} height={844} fill="#FFFFFF" />

      {/* Floor */}
      <Rect x={0} y={580} width={390} height={264} fill="#E6DBC9" opacity={0.5} />
      <Line x1={0} y1={580} x2={390} y2={580} stroke="#BFC4D2" strokeWidth={0.7} opacity={0.4} />

      {/* Herringbone floor pattern */}
      <G opacity={0.14} stroke="#7C6E55" strokeWidth={0.6}>
        <Line x1={40} y1={600} x2={60} y2={620} />
        <Line x1={60} y1={620} x2={80} y2={600} />
        <Line x1={80} y1={600} x2={100} y2={620} />
        <Line x1={100} y1={620} x2={120} y2={600} />
        <Line x1={120} y1={600} x2={140} y2={620} />
        <Line x1={140} y1={620} x2={160} y2={600} />
        <Line x1={160} y1={600} x2={180} y2={620} />
        <Line x1={180} y1={620} x2={200} y2={600} />
        <Line x1={200} y1={600} x2={220} y2={620} />
        <Line x1={220} y1={620} x2={240} y2={600} />
        <Line x1={240} y1={600} x2={260} y2={620} />
        <Line x1={260} y1={620} x2={280} y2={600} />
        <Line x1={280} y1={600} x2={300} y2={620} />
        <Line x1={300} y1={620} x2={320} y2={600} />
        <Line x1={320} y1={600} x2={340} y2={620} />
        <Line x1={340} y1={620} x2={360} y2={600} />

        <Line x1={20} y1={630} x2={40} y2={650} />
        <Line x1={40} y1={650} x2={60} y2={630} />
        <Line x1={60} y1={630} x2={80} y2={650} />
        <Line x1={80} y1={650} x2={100} y2={630} />
        <Line x1={100} y1={630} x2={120} y2={650} />
        <Line x1={120} y1={650} x2={140} y2={630} />
        <Line x1={140} y1={630} x2={160} y2={650} />
        <Line x1={160} y1={650} x2={180} y2={630} />
        <Line x1={180} y1={630} x2={200} y2={650} />
        <Line x1={200} y1={650} x2={220} y2={630} />
        <Line x1={220} y1={630} x2={240} y2={650} />
        <Line x1={240} y1={650} x2={260} y2={630} />
        <Line x1={260} y1={630} x2={280} y2={650} />
        <Line x1={280} y1={650} x2={300} y2={630} />
        <Line x1={300} y1={630} x2={320} y2={650} />
        <Line x1={320} y1={650} x2={340} y2={630} />
        <Line x1={340} y1={630} x2={360} y2={650} />
        <Line x1={360} y1={650} x2={380} y2={630} />

        <Line x1={40} y1={660} x2={60} y2={680} />
        <Line x1={60} y1={680} x2={80} y2={660} />
        <Line x1={80} y1={660} x2={100} y2={680} />
        <Line x1={100} y1={680} x2={120} y2={660} />
        <Line x1={120} y1={660} x2={140} y2={680} />
        <Line x1={140} y1={680} x2={160} y2={660} />
        <Line x1={160} y1={660} x2={180} y2={680} />
        <Line x1={180} y1={680} x2={200} y2={660} />
        <Line x1={200} y1={660} x2={220} y2={680} />
        <Line x1={220} y1={680} x2={240} y2={660} />
        <Line x1={240} y1={660} x2={260} y2={680} />
        <Line x1={260} y1={680} x2={280} y2={660} />
        <Line x1={280} y1={660} x2={300} y2={680} />
        <Line x1={300} y1={680} x2={320} y2={660} />
        <Line x1={320} y1={660} x2={340} y2={680} />
        <Line x1={340} y1={680} x2={360} y2={660} />
      </G>

      {/* Arched doorway — right side */}
      <Path
        d="M 260 580 L 260 320 Q 260 240 325 240 Q 390 240 390 320 L 390 580 Z"
        fill="#D6D8EE"
        opacity={0.5}
      />
      <Path
        d="M 260 580 L 260 320 Q 260 240 325 240 Q 390 240 390 320 L 390 580"
        fill="none"
        stroke="#A6A8DC"
        strokeWidth={1.4}
        opacity={0.4}
      />
      <Path
        d="M 270 580 L 270 328 Q 270 255 325 255 Q 380 255 380 328 L 380 580 Z"
        fill="#E0E2F0"
        opacity={0.35}
      />
      {/* Window in the arch */}
      <Rect x={300} y={300} width={50} height={80} rx={4} fill="#D8E1F2" opacity={0.55} />
      <Line x1={325} y1={300} x2={325} y2={380} stroke="#9BA8C5" strokeWidth={0.9} opacity={0.45} />
      <Line x1={300} y1={340} x2={350} y2={340} stroke="#9BA8C5" strokeWidth={0.9} opacity={0.45} />

      {/* Pendant light */}
      <Line x1={120} y1={0} x2={120} y2={150} stroke="#9D8B6E" strokeWidth={1.2} opacity={0.35} />
      <Path
        d="M 100 150 Q 100 133 120 133 Q 140 133 140 150 L 134 178 Q 134 186 120 186 Q 106 186 106 178 Z"
        fill="#E6D7B5"
        opacity={0.5}
        stroke="#B8A77E"
        strokeWidth={1}
      />
      <Ellipse cx={120} cy={195} rx={50} ry={36} fill="#F5EBC8" opacity={0.22} />

      {/* Tall potted plant — left side */}
      <G opacity={0.4}>
        <Path d="M 30 580 L 35 520 L 65 520 L 70 580 Z" fill="#C49A6E" opacity={0.6} />
        <Rect x={32} y={515} width={36} height={8} rx={2} fill="#B5895E" opacity={0.6} />
        <Path d="M 50 515 Q 44 455 32 410" fill="none" stroke="#5C8A4E" strokeWidth={1.8} />
        <Path d="M 50 515 Q 56 445 68 400" fill="none" stroke="#5C8A4E" strokeWidth={1.8} />
        <Path d="M 50 515 Q 47 465 28 430" fill="none" stroke="#557F47" strokeWidth={1.3} />
        <Path d="M 50 515 Q 53 455 72 425" fill="none" stroke="#557F47" strokeWidth={1.3} />
        <Ellipse cx={29} cy={405} rx={20} ry={9} transform="rotate(-30 29 405)" fill="#6FA15A" opacity={0.6} />
        <Ellipse cx={71} cy={395} rx={20} ry={9} transform="rotate(25 71 395)" fill="#699D55" opacity={0.6} />
        <Ellipse cx={24} cy={428} rx={16} ry={7} transform="rotate(-50 24 428)" fill="#73A95F" opacity={0.55} />
        <Ellipse cx={75} cy={420} rx={16} ry={7} transform="rotate(45 75 420)" fill="#65985C" opacity={0.5} />
        <Ellipse cx={50} cy={385} rx={16} ry={8} transform="rotate(-10 50 385)" fill="#65985C" opacity={0.5} />
        <Ellipse cx={38} cy={370} rx={14} ry={7} transform="rotate(-20 38 370)" fill="#6FA15A" opacity={0.45} />
      </G>

      {/* Side table with cross brace + vase */}
      <G opacity={0.3}>
        <Rect x={195} y={530} width={55} height={4} rx={2} fill="#7A6B50" />
        <Rect x={200} y={534} width={2} height={46} fill="#7A6B50" />
        <Rect x={245} y={534} width={2} height={46} fill="#7A6B50" />
        <Line x1={202} y1={545} x2={245} y2={568} stroke="#8A7B60" strokeWidth={0.8} />
        <Line x1={245} y1={545} x2={202} y2={568} stroke="#8A7B60" strokeWidth={0.8} />
        <Path
          d="M 215 530 Q 213 515 217 505 Q 222 498 228 498 Q 234 498 238 505 Q 242 515 240 530 Z"
          fill="#A6A8DC"
          opacity={0.7}
        />
        <Line x1={228} y1={498} x2={226} y2={472} stroke="#5C8A4E" strokeWidth={1.2} />
        <Ellipse cx={222} cy={468} rx={12} ry={6} transform="rotate(-15 222 468)" fill="#6FA15A" opacity={0.5} />
        <Ellipse cx={232} cy={475} rx={10} ry={5} transform="rotate(20 232 475)" fill="#5C8A4E" opacity={0.45} />
      </G>

      {/* Wall shelf with books — upper right */}
      <G opacity={0.25}>
        <Rect x={300} y={160} width={70} height={3} rx={1} fill="#7A6B50" />
        <Path d="M 310 163 L 310 175 L 315 175" fill="none" stroke="#7A6B50" strokeWidth={1} />
        <Path d="M 360 163 L 360 175 L 355 175" fill="none" stroke="#7A6B50" strokeWidth={1} />
        <Rect x={305} y={135} width={8} height={25} rx={1} fill="#3B6BC9" opacity={0.6} />
        <Rect x={314} y={138} width={6} height={22} rx={1} fill="#C87840" opacity={0.5} />
        <Rect x={321} y={133} width={9} height={27} rx={1} fill="#4A7A4E" opacity={0.5} />
        <Rect x={331} y={140} width={6} height={20} rx={1} fill="#8A8DC0" opacity={0.5} />
        <Rect x={338} y={136} width={8} height={24} rx={1} fill="#9D7A45" opacity={0.5} />
        <Circle cx={356} cy={148} r={6} fill="#5C8A4E" opacity={0.4} />
        <Rect x={353} y={153} width={6} height={7} rx={1} fill="#9D7A45" opacity={0.5} />
      </G>

      {/* Wainscoting */}
      <G opacity={0.1} stroke="#8A8FA4" strokeWidth={0.6}>
        <Line x1={0} y1={450} x2={260} y2={450} />
        <Line x1={0} y1={452} x2={260} y2={452} />
      </G>

      {/* Top fade */}
      <Rect x={0} y={0} width={390} height={160} fill="url(#topFade)" />
    </Svg>
  );
}
