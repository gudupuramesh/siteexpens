/**
 * FeedbackPromptCard — small in-app card that nudges the user to
 * submit feedback / report an issue / request a feature.
 *
 * Shown once per day on the home tab (the parent decides via
 * `feedbackPromptStorage.hasShownPromptToday()`). Self-contained
 * after that:
 *   • Tap the card body  → routes to `/(app)/feedback` and dismisses
 *   • Tap the × button   → dismisses
 *   • Auto-dismisses after 2 minutes via setTimeout (cleared on
 *     unmount so it doesn't fire stale)
 *
 * Visual: surface card matching the v2 KpiCard vocab — soft-blue
 * icon tile on the left, two lines of copy, × on the right.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AppearOnMount } from './AppearOnMount';
import { Text } from './Text';
import { useThemeV2 } from '@/src/theme/v2';

/** Auto-dismiss after this many milliseconds. */
const AUTO_DISMISS_MS = 2 * 60 * 1000;

/** Route the card navigates to when tapped. Surfaced in the card body
 *  during testing so QA can confirm the destination at a glance. */
const FEEDBACK_ROUTE = '/(app)/feedback';

export type FeedbackPromptCardProps = {
  /** Called when the user taps × OR when the auto-dismiss timer
   *  fires OR after they tap the card body (we dismiss before the
   *  navigation so it doesn't pop back into view on return). */
  onDismiss: () => void;
};

export function FeedbackPromptCard({ onDismiss }: FeedbackPromptCardProps) {
  const t = useThemeV2();

  // Auto-dismiss after 2 minutes. Cleanup on unmount so we don't
  // fire `onDismiss` against a stale parent.
  useEffect(() => {
    const id = setTimeout(() => onDismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [onDismiss]);

  const goToFeedback = () => {
    onDismiss();
    router.push(FEEDBACK_ROUTE as never);
  };

  return (
    <AppearOnMount rise={8}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: t.colors.surface,
            borderRadius: t.radii.card,
            borderColor:
              t.mode === 'dark'
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(0,0,0,0.04)',
            borderWidth: t.hairline,
          },
        ]}
      >
        <Pressable
          onPress={goToFeedback}
          hitSlop={2}
          style={({ pressed }) => [
            styles.body,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Send feedback or report an issue"
        >
          <View
            style={[
              styles.iconTile,
              {
                backgroundColor:
                  t.mode === 'dark'
                    ? t.palette.blue.softDark
                    : t.palette.blue.soft,
                borderRadius: t.radii.tile,
              },
            ]}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={t.palette.blue.base}
            />
          </View>

          <View style={styles.copy}>
            <Text
              variant="callout"
              color="label"
              style={{ fontWeight: '600' }}
              numberOfLines={1}
            >
              We're improving every day
            </Text>
            <Text
              variant="caption1"
              color="secondary"
              style={{ marginTop: 1 }}
              numberOfLines={2}
            >
              We're working continuously to make Interior OS better. Your feedback is very important to us — tap to share.
            </Text>
            {/* Square info chip — tells the user where to find this
                page again later (Account tab → Send feedback). */}
            <View
              style={[
                styles.routeChip,
                {
                  backgroundColor:
                    t.mode === 'dark'
                      ? t.palette.blue.softDark
                      : t.palette.blue.soft,
                  borderRadius: 6,
                },
              ]}
            >
              <Ionicons
                name="person-circle-outline"
                size={12}
                color={t.palette.blue.base}
              />
              <Text
                variant="caption2"
                style={{
                  color: t.palette.blue.base,
                  fontWeight: '600',
                }}
                numberOfLines={1}
              >
                Account → Send feedback
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Close button — separate Pressable so its tap doesn't
            bubble through to `goToFeedback`. */}
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Dismiss feedback prompt"
        >
          <Ionicons name="close" size={16} color={t.colors.tertiary} />
        </Pressable>
      </View>
    </AppearOnMount>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconTile: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // TEMP — remove with the route-chip block above.
  routeChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
});
