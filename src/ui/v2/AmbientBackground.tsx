/**
 * v2 AmbientBackground — DISABLED.
 *
 * Originally rendered two soft radial glows (orange + blue in light mode,
 * blue + purple in dark mode) behind every screen so the glass nav could
 * blur into them. Per the user's 90/10 colour discipline, those glows
 * added decorative colour everywhere and undermined the white/blue/gray
 * aesthetic the rest of the app now follows.
 *
 * The component is kept (mounted as `<AmbientBackground />` on ~59
 * screens) but renders a flat solid fill of `t.colors.bg` instead of the
 * SVG radial gradients. To restore the glows later, revert this file to
 * its previous version (the radial-gradient implementation lives in
 * git history).
 */
import { StyleSheet, View } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';

export function AmbientBackground() {
  const t = useThemeV2();
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.bg }]}
    />
  );
}
