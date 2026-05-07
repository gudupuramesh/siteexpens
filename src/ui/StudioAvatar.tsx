/**
 * StudioAvatar — square tile that represents an organization.
 *
 * Resolution order:
 *   1. If `logoUrl` is provided AND non-empty → render the uploaded
 *      logo as an Image (cover crop, rounded corners).
 *   2. Otherwise → render a neutral building icon on a soft tint.
 *
 * Why no random colour palette:
 *   The previous implementation hashed the org name into a 10-colour
 *   palette (purple, orange, magenta, teal, etc.). Two issues:
 *     - On a Select Company list, the strong hue grid felt loud and
 *       didn't match Interior OS's restrained palette.
 *     - The colour carried no information — same org could look
 *       jarring against the active card's primary tint.
 *   Keeping a single tinted background (primarySoft) lets the LOGO
 *   carry the studio's identity, with a clean neutral fallback.
 *
 * Sizes: `sm` (36) for inline rows, `md` (48) for Select Company
 * cards, `lg` (64) for hero cards.
 */
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { color, radius } from '@/src/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type StudioAvatarSize = 'sm' | 'md' | 'lg';

export type StudioAvatarProps = {
  /** Direct URL to the studio logo. If null/empty, the icon
   *  fallback renders. */
  logoUrl?: string | null;
  /** Size token. */
  size?: StudioAvatarSize;
  /** Override the fallback icon. Defaults to `business-outline` —
   *  reads as "studio" without competing with the tier badge that
   *  may sit beside it. */
  fallbackIcon?: IoniconName;
  /** Style override (margin, alignment) applied to the outer tile. */
  style?: import('react-native').ViewStyle;
};

const SIZE: Record<StudioAvatarSize, number> = {
  sm: 36,
  md: 48,
  lg: 64,
};

const RADIUS: Record<StudioAvatarSize, number> = {
  sm: radius.md,
  md: radius.lg,
  lg: radius.lg2,
};

const ICON_SIZE: Record<StudioAvatarSize, number> = {
  sm: 18,
  md: 22,
  lg: 28,
};

export function StudioAvatar({
  logoUrl,
  size = 'md',
  fallbackIcon = 'business-outline',
  style,
}: StudioAvatarProps) {
  const dim = SIZE[size];
  const r = RADIUS[size];
  const iconSize = ICON_SIZE[size];

  const tileStyle = [
    styles.tile,
    {
      width: dim,
      height: dim,
      borderRadius: r,
    },
    style,
  ];

  if (logoUrl) {
    return (
      <View style={tileStyle}>
        <Image
          source={{ uri: logoUrl }}
          style={[styles.image, { borderRadius: r }]}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={tileStyle}>
      <Ionicons name={fallbackIcon} size={iconSize} color={color.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
