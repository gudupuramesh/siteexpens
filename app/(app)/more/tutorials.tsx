/**
 * Tutorials — all enabled tutorial videos grouped by category.
 *
 * Shown in the More tab under LEARN → Tutorials. Videos are fetched
 * from `system/tutorialVideos` via TutorialsContext (mounted in the
 * authenticated layout, so no extra Firestore read here).
 *
 * Layout:
 *   Header + back nav
 *   Per category: section label → list of video cards (same card style
 *   as TutorialEmptyState — thumbnail + title + "Watch tutorial →")
 *   Empty state if no videos are enabled yet
 */
import { router, Stack } from 'expo-router';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTutorialsContext } from '@/src/features/tutorials/TutorialsContext';
import type { TutorialVideoEntry } from '@/src/features/tutorials/types';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, screenInset, space } from '@/src/theme';

// ── YouTube helpers ───────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Video card ────────────────────────────────────────────────────────

function VideoCard({ entry }: { entry: TutorialVideoEntry }) {
  const videoId = extractYouTubeId(entry.youtubeUrl);
  const thumbnailUri = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null;

  const handleWatch = () => {
    Linking.openURL(entry.youtubeUrl).catch(() => undefined);
  };

  return (
    <Pressable
      onPress={handleWatch}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
      accessibilityRole="button"
      accessibilityLabel={`Watch tutorial: ${entry.title}`}
    >
      {thumbnailUri ? (
        <Image
          source={{ uri: thumbnailUri }}
          style={styles.thumbnail}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.thumbnailPlaceholder}>
          <Ionicons name="play-circle-outline" size={44} color={color.textFaint} />
        </View>
      )}
      <View style={styles.meta}>
        <View style={styles.titleRow}>
          <Ionicons name="play-circle" size={15} color={color.primary} />
          <Text
            variant="bodyStrong"
            color="text"
            style={styles.titleText}
            numberOfLines={2}
          >
            {entry.title}
          </Text>
        </View>
        <Text variant="metaStrong" color="primary" style={styles.watchLabel}>
          Watch tutorial →
        </Text>
      </View>
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────

export default function TutorialsScreen() {
  const { videos } = useTutorialsContext();

  // Build a sorted map of category → entries (enabled only)
  const grouped: { category: string; entries: TutorialVideoEntry[] }[] = (() => {
    if (!videos) return [];

    const map = new Map<string, TutorialVideoEntry[]>();
    for (const entry of Object.values(videos)) {
      if (!entry.enabled) continue;
      const cat = entry.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(entry);
    }

    // Sort categories alphabetically; entries within each category by title
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, entries]) => ({
        category,
        entries: entries.sort((a, b) => a.title.localeCompare(b.title)),
      }));
  })();

  const hasVideos = grouped.length > 0;

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav bar */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navTitle}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>LEARN</Text>
          <Text variant="title" color="text" style={styles.navTitleText}>Tutorials</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {hasVideos ? (
          grouped.map(({ category, entries }) => (
            <View key={category} style={styles.section}>
              <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
                {category.toUpperCase()}
              </Text>
              {entries.map((entry) => (
                <VideoCard key={entry.youtubeUrl} entry={entry} />
              ))}
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Ionicons name="play-circle-outline" size={36} color={color.textFaint} />
            <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
              No tutorials yet
            </Text>
            <Text variant="meta" color="textMuted" align="center" style={styles.emptySub}>
              Your admin will add tutorial videos here to help you get started with each feature.
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 8,
    backgroundColor: color.bgGrouped,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { flex: 1 },
  navEyebrow: { letterSpacing: 1.8, fontSize: 10, marginBottom: 1 },
  navTitleText: { fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },

  scroll: {
    paddingHorizontal: screenInset,
    paddingBottom: 40,
    gap: space.lg,
  },

  section: {
    gap: space.sm,
  },
  sectionLabel: {
    letterSpacing: 0.4,
    marginBottom: 2,
  },

  // Video card — mirrors TutorialEmptyState card styles
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: color.surfaceAlt,
  },
  thumbnailPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  titleText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  watchLabel: {
    marginTop: 2,
    letterSpacing: 0.1,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: space.sm,
  },
  emptyTitle: {
    marginTop: 4,
    textAlign: 'center',
  },
  emptySub: {
    textAlign: 'center',
    maxWidth: 280,
  },
});
