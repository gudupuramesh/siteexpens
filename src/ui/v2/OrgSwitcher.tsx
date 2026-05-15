/**
 * v2 OrgSwitcher — universal studio-switcher chip for the top NavRow.
 *
 * Compact pill: small studio logo + studio name + up/down picker arrows
 * on the right. Tap → routes to the existing select-company picker.
 *
 * Visual:
 *   • 22×22 rounded-square logo on the left:
 *       - When `org.logoUrl` is set, renders the actual uploaded logo.
 *       - Otherwise renders a neutral fill3 chip with the studio's
 *         first letter (matches the LeadCard avatar pattern — no
 *         colour, so the colour discipline holds in the header).
 *   • Studio name (footnote weight 600), capped to ~14 chars
 *   • `chevron-expand-outline` glyph on the right — the iOS-standard
 *     "tap to pick another option" affordance (two chevrons pointing
 *     up and down, sharing a baseline)
 *   • Soft surface background, hairline border, full radius
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useThemeV2 } from '@/src/theme/v2';

import { Text } from './Text';

export type OrgSwitcherProps = {
  style?: ViewStyle;
};

export function OrgSwitcher({ style }: OrgSwitcherProps) {
  const t = useThemeV2();
  const { data: org } = useCurrentOrganization();
  const name = org?.name ?? '';
  const logoUrl = org?.logoUrl ?? null;

  // Shorten long names so the chip never pushes off-screen
  const display = name.length > 14 ? `${name.slice(0, 13)}…` : name || 'Studio';
  const initial = (name[0] ?? 'S').toUpperCase();

  return (
    <Pressable
      onPress={() => router.push('/(app)/select-company' as never)}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.pill,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.06)',
          borderWidth: t.hairline,
        },
        t.shadows.resting,
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={[styles.logo, { backgroundColor: t.colors.fill3 }]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.logo, { backgroundColor: t.colors.fill3 }]}>
          <Text
            style={{
              color: t.colors.secondary,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.2,
            }}
          >
            {initial}
          </Text>
        </View>
      )}

      <Text
        variant="footnote"
        color="label"
        style={{ fontWeight: '600', marginLeft: 6 }}
        numberOfLines={1}
      >
        {display}
      </Text>

      <Ionicons
        name="chevron-expand-outline"
        size={14}
        color={t.colors.tertiary}
        style={{ marginLeft: 6 }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    minHeight: 32,
    alignSelf: 'flex-start',
  },
  logo: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
