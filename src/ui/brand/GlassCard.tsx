/**
 * GlassCard — frosted-glass container used by the auth screens.
 *
 * Wraps `expo-blur`'s `BlurView` with a translucent white overlay,
 * a hairline border, and a soft 20px corner radius. The blur picks
 * up the `InteriorScene` rendering behind it so the card reads as
 * etched glass over a real scene, not a flat slab.
 *
 * Defaults match the InteriorOS auth mockup. Padding is configurable
 * because the OTP card wants slightly more vertical breathing room
 * than the sign-in card.
 */
import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { color } from '@/src/theme/tokens';

export type GlassCardProps = {
  children: React.ReactNode;
  /** BlurView intensity (0–100). Default 24 — atmospheric, not
   *  opaque. Push to 40 if the scene behind is too busy. */
  intensity?: number;
  /** `light` (default) gives the warm milky-white glass feel that
   *  matches the mockup. `default` adapts to dark mode. */
  tint?: 'light' | 'default' | 'dark';
  /** Inner padding shorthand. Default 24 horizontal, 28 vertical. */
  padding?: { vertical?: number; horizontal?: number };
  style?: ViewStyle;
};

export function GlassCard({
  children,
  intensity = 24,
  tint = 'light',
  padding,
  style,
}: GlassCardProps) {
  const py = padding?.vertical ?? 28;
  const px = padding?.horizontal ?? 24;

  return (
    <View style={[styles.shell, style]}>
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
      {/* Translucent white overlay on top of the blur — the blur
          alone is too cool/blue; the overlay warms it back to the
          milky paper white the mockup uses. */}
      <View style={styles.overlay} pointerEvents="none" />
      <View style={[styles.body, { paddingVertical: py, paddingHorizontal: px }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: 'transparent',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  body: {
    position: 'relative',
  },
});
