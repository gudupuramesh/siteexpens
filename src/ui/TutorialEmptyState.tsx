/**
 * TutorialEmptyState — shown in place of (or above) the standard empty
 * state when the admin has configured a YouTube tutorial for that page.
 *
 * Usage:
 *   <TutorialEmptyState pageKey="transactions" fallback={<MyEmptyJSX />} />
 *
 * Behaviour:
 *   - If no tutorial is configured/enabled for `pageKey` → renders
 *     `fallback` unchanged (zero visual diff for unconfigured pages).
 *   - If a tutorial is configured → renders a clickable card with the
 *     YouTube thumbnail above `fallback`. Tapping opens YouTube via
 *     `Linking.openURL` (YouTube app or browser). No WebView needed.
 *
 * Thumbnail URL pattern: `https://img.youtube.com/vi/{videoId}/hqdefault.jpg`
 * Works for both `youtube.com/watch?v=ID` and `youtu.be/ID` URL forms.
 */
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTutorialVideo } from '@/src/features/tutorials/TutorialsContext';
import { color, space } from '@/src/theme';
import { Text } from '@/src/ui/Text';

// ── YouTube ID extraction ─────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Component ─────────────────────────────────────────────────────────

export type TutorialEmptyStateProps = {
  /** Page identifier — must match a key in `system/tutorialVideos`. */
  pageKey: string;
  /**
   * Rendered when no tutorial is configured/enabled for this page.
   * Also always rendered below the tutorial card so the user sees
   * both the video prompt AND the "no items yet" message.
   */
  fallback: React.ReactNode;
};

export function TutorialEmptyState({ pageKey, fallback }: TutorialEmptyStateProps) {
  const entry = useTutorialVideo(pageKey);

  // No tutorial configured — render the original empty state as-is.
  if (!entry) return <>{fallback}</>;

  const videoId = extractYouTubeId(entry.youtubeUrl);
  const thumbnailUri = videoId
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : null;

  const handleWatch = () => {
    Linking.openURL(entry.youtubeUrl).catch(() => undefined);
  };

  return (
    <View>
      {/* Tutorial card */}
      <Pressable
        onPress={handleWatch}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
        accessibilityRole="button"
        accessibilityLabel={`Watch tutorial: ${entry.title}`}
      >
        {/* Thumbnail */}
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

        {/* Meta row */}
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

      {/* Original empty state always shown below */}
      {fallback}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: space.md,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    // Android elevation
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
});
