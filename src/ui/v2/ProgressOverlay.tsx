/**
 * ProgressOverlay — full-screen blocking spinner card.
 *
 * Used during longer in-app transitions where the user has tapped a
 * CTA but the result isn't instant — e.g. switching the active
 * organisation (claim refresh + Firestore wait + tab redirect) or
 * sending a team invite (callable round-trip + claim refresh).
 *
 * Visual:
 *   • Dim backdrop (rgba black 0.35) catches all touches so the user
 *     can't tap into the underlying UI mid-flight and double-fire.
 *   • Centered surface card with a spinner + bold title + optional
 *     subtitle. Same surface vocab as the other v2 cards.
 *   • Soft entrance via `<AppearOnMount>` so the overlay doesn't pop
 *     in jarringly — feels like a sheet sliding into place.
 *
 * Accessibility:
 *   • The whole card is `accessibilityViewIsModal` on iOS so VoiceOver
 *     focus traps inside it until the work completes.
 *   • Title doubles as the accessibility label.
 *
 * Driven by a single boolean (`visible`); parent owns when to show /
 * hide. There's no built-in timer — the spinner runs indefinitely
 * because the underlying network work is what defines "done".
 */
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';

import { AppearOnMount } from './AppearOnMount';
import { Text } from './Text';
import { useThemeV2 } from '@/src/theme/v2';

export type ProgressOverlayProps = {
  /** When true, mounts the modal + dims the screen. */
  visible: boolean;
  /** Bold one-liner above the spinner — typically a verb phrase
   *  ("Switching studio…", "Sending invite…"). */
  title: string;
  /** Optional secondary line for context (e.g. the studio name or
   *  invitee phone). Kept short — single line, ellipsised. */
  subtitle?: string;
};

export function ProgressOverlay({
  visible,
  title,
  subtitle,
}: ProgressOverlayProps) {
  const t = useThemeV2();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      // No close action — taps on the backdrop must NOT dismiss; the
      // whole point is to block input while async work runs.
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View style={styles.backdrop} pointerEvents="auto">
        <AppearOnMount rise={6} fromScale={0.96}>
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
              t.shadows.resting,
            ]}
            accessibilityViewIsModal
            accessibilityLabel={
              subtitle ? `${title}. ${subtitle}` : title
            }
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={t.palette.blue.base} size="small" />
            <Text
              variant="callout"
              color="label"
              style={{ fontWeight: '600', marginTop: 12, textAlign: 'center' }}
              numberOfLines={2}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                variant="caption1"
                color="secondary"
                style={{ marginTop: 4, textAlign: 'center' }}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
        </AppearOnMount>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    minWidth: 220,
    maxWidth: 320,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: 'center',
  },
});
