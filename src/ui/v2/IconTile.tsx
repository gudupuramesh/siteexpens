/**
 * v2 IconTile — DESIGN.md §3.8.
 *
 * 28 × 28 rounded-square (radius 8) with a colored fill and a white
 * Ionicon glyph centered inside. Used as `Row` leading and as the dot
 * in metric tiles.
 *
 * The design spec calls for SF Symbols via `expo-symbols`, but Ionicons
 * is what the rest of the codebase uses and provides a consistent
 * Android fallback for free.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radii } from '@/src/theme/v2';

export type IconTileProps = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Background fill color (typically a `palette.*.base` color). */
  color: string;
  /** Tile size. Default 28 — matches DESIGN.md §3.8. */
  size?: 24 | 28 | 32 | 36;
  /** Glyph color. Defaults to white. */
  glyphColor?: string;
  style?: ViewStyle;
};

export function IconTile({
  icon,
  color,
  size = 28,
  glyphColor = '#FFFFFF',
  style,
}: IconTileProps) {
  const glyph = Math.round(size * 0.6);
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radii.tile,
          backgroundColor: color,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={glyph} color={glyphColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
