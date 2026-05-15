/**
 * More section placeholder — v2 design.
 *
 * Catch-all for sections wired into the Account tab but not yet
 * implemented (ABS Section, Studio dashboard, Integrations, More
 * libraries). Renders a v2 header + a "Coming soon" hero card so the
 * user gets a polished placeholder instead of a half-styled stub.
 *
 * Routed via `router.push({ pathname: '/(app)/more/<slug>', params:
 * { title: 'Section name' } })` from `(tabs)/account.tsx`.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

/** Map known slugs → emoji-equivalent SF Symbol so the placeholder
 *  hero feels less generic. Falls back to a folder icon for unknown
 *  slugs. */
const SLUG_ICON: Record<string, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  abs: 'shield-checkmark-outline',
  'studio-dashboard': 'business-outline',
  integrations: 'construct-outline',
  libraries: 'folder-open-outline',
};

const SLUG_TONE: Record<string, 'blue' | 'green' | 'orange' | 'red' | 'yellow'> = {
  abs: 'red',
  'studio-dashboard': 'blue',
  integrations: 'orange',
  libraries: 'green',
};

export default function MoreSectionPlaceholderScreen() {
  const t = useThemeV2();
  const { slug, title } = useLocalSearchParams<{ slug: string; title?: string }>();
  const slugKey = Array.isArray(slug) ? slug[0] : slug;
  const resolvedTitle = title || 'Section';
  const icon = SLUG_ICON[slugKey ?? ''] ?? 'folder-open-outline';
  const toneKey = SLUG_TONE[slugKey ?? ''] ?? 'blue';
  const tone = t.palette[toneKey];

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — transparent so the AmbientBackground flows through */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="label">
            {resolvedTitle}
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            COMING SOON
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero placeholder card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.card,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            <View
              style={[
                styles.heroIcon,
                {
                  backgroundColor:
                    t.mode === 'dark' ? tone.softDark : tone.soft,
                  borderRadius: t.radii.tile + 4,
                },
              ]}
            >
              <Ionicons name={icon} size={32} color={tone.base} />
            </View>
            <Text
              variant="title3"
              color="label"
              style={{ marginTop: 14, fontWeight: '700' }}
            >
              {resolvedTitle}
            </Text>
            <Text
              variant="callout"
              color="secondary"
              style={{ marginTop: 6, textAlign: 'center', maxWidth: 320 }}
            >
              This section is being built. The structure is in place — full
              workflow lands in the next update.
            </Text>

            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    t.mode === 'dark' ? tone.softDark : tone.soft,
                  borderRadius: 999,
                  marginTop: 14,
                },
              ]}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: tone.base,
                  marginRight: 6,
                }}
              />
              <Text
                variant="caption2"
                style={{
                  color: tone.base,
                  fontWeight: '700',
                  letterSpacing: 0.5,
                }}
              >
                IN PROGRESS
              </Text>
            </View>
          </View>
        </View>

        {/* Helper hint */}
        <Text
          variant="caption1"
          color="tertiary"
          style={{
            paddingHorizontal: 32,
            paddingTop: 18,
            textAlign: 'center',
            letterSpacing: 0.2,
          }}
        >
          You'll see new options here as we ship them. Existing studio data
          continues to flow through the rest of the app uninterrupted.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero
  heroCard: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  heroIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
