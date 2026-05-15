/**
 * Tutorials — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Tutorials" · count caption
 *   2. Sectioned list — one section per category, each containing video
 *      cards with thumbnail · play overlay · title · "Watch tutorial →"
 *   3. v2 empty state when no enabled videos exist
 *
 * Videos come from `system/tutorialVideos` via TutorialsContext (mounted
 * in the authenticated layout) so this screen does no extra Firestore
 * reads. YouTube URLs open in the system browser via `Linking.openURL`.
 */
import { router, Stack } from 'expo-router';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTutorialsContext } from '@/src/features/tutorials/TutorialsContext';
import type { TutorialVideoEntry } from '@/src/features/tutorials/types';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function VideoCard({ entry }: { entry: TutorialVideoEntry }) {
  const t = useThemeV2();
  const videoId = extractYouTubeId(entry.youtubeUrl);
  const thumbnailUri = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null;
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <Pressable
      onPress={() => Linking.openURL(entry.youtubeUrl).catch(() => undefined)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: cardBg,
          borderRadius: t.radii.card,
          borderColor: cardBorder,
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Watch tutorial: ${entry.title}`}
    >
      {/* Thumbnail */}
      <View style={styles.thumbWrap}>
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={styles.thumbnail}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={[
              styles.thumbnailPlaceholder,
              { backgroundColor: t.colors.fill3 },
            ]}
          >
            <Ionicons
              name="videocam-outline"
              size={32}
              color={t.colors.tertiary}
            />
          </View>
        )}
        {/* Play overlay */}
        <View pointerEvents="none" style={styles.playOverlay}>
          <View
            style={[
              styles.playBtn,
              { backgroundColor: t.palette.red.base },
            ]}
          >
            <Ionicons name="play" size={18} color="#fff" />
          </View>
        </View>
      </View>

      {/* Meta */}
      <View style={styles.meta}>
        <Text
          variant="body"
          color="label"
         
          numberOfLines={2}
        >
          {entry.title}
        </Text>
        <View style={styles.metaFooter}>
          <Ionicons
            name="logo-youtube"
            size={13}
            color={t.palette.red.base}
          />
          <Text
            variant="caption1"
            style={{
              color: t.palette.blue.base,
              marginLeft: 6,
              fontWeight: '600',
            }}
          >
            Watch on YouTube →
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function TutorialsScreen() {
  const t = useThemeV2();
  const { videos } = useTutorialsContext();

  const grouped: { category: string; entries: TutorialVideoEntry[] }[] = (() => {
    if (!videos) return [];
    const map = new Map<string, TutorialVideoEntry[]>();
    for (const entry of Object.values(videos)) {
      if (!entry.enabled) continue;
      const cat = entry.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(entry);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, entries]) => ({
        category,
        entries: entries.sort((a, b) => a.title.localeCompare(b.title)),
      }));
  })();

  const totalVideos = grouped.reduce((sum, g) => sum + g.entries.length, 0);
  const hasVideos = grouped.length > 0;

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
            Tutorials
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            {hasVideos
              ? `${totalVideos} ${totalVideos === 1 ? 'VIDEO' : 'VIDEOS'} · ${grouped.length} ${grouped.length === 1 ? 'CATEGORY' : 'CATEGORIES'}`
              : 'LEARN'}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {hasVideos ? (
          grouped.map(({ category, entries }) => (
            <View key={category} style={{ marginTop: 24 }}>
              <View style={styles.sectionHeader}>
                <Text
                  variant="caption2"
                  color="secondary"
                  style={{ letterSpacing: 0.4 }}
                >
                  {category.toUpperCase()}
                </Text>
                <Text variant="caption2" color="tertiary">
                  {entries.length}
                </Text>
              </View>
              <View style={styles.cardList}>
                {entries.map((entry) => (
                  <VideoCard key={entry.youtubeUrl} entry={entry} />
                ))}
              </View>
            </View>
          ))
        ) : (
          <View style={{ paddingVertical: 64, paddingHorizontal: 32, alignItems: 'center' }}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                  borderRadius: t.radii.tile + 4,
                },
              ]}
            >
              <Ionicons
                name="play-circle-outline"
                size={32}
                color={t.palette.red.base}
              />
            </View>
            <Text
              variant="headline"
              color="label"
              style={{ marginTop: 12, fontWeight: '600' }}
            >
              No tutorials yet
            </Text>
            <Text
              variant="footnote"
              color="secondary"
              style={{ marginTop: 6, textAlign: 'center', maxWidth: 320 }}
            >
              Your studio admin will publish video walkthroughs here to help
              your team get started with each feature.
            </Text>
          </View>
        )}
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

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 8,
  },
  cardList: {
    paddingHorizontal: 16,
    gap: 12,
  },

  // Video card
  card: {
    overflow: 'hidden',
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3, // optical center the play triangle
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  meta: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },

  // Empty
  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
