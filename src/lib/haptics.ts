/**
 * haptics — thin wrapper over `expo-haptics` so the whole app speaks the
 * same vocabulary.
 *
 * Why a wrapper instead of importing `expo-haptics` directly:
 *   • One opinionated naming (selection / lightImpact / success / warning /
 *     error / heavyImpact) rather than each call site reaching for raw
 *     `Haptics.NotificationFeedbackType.Success` etc.
 *   • A single place to respect Reduce Motion / Reduce Haptics in the
 *     future, or to disable globally for tests / Expo Go.
 *   • All calls swallow errors — `expo-haptics` throws on the JS-only Web
 *     bundle (we don't ship web yet, but if someone ever runs it the app
 *     shouldn't crash).
 *
 * iOS gets the full taptic engine. Android gets the closest available
 * vibration pattern via `Haptics`'s built-in fallback.
 */
import * as Haptics from 'expo-haptics';

function safe(fn: () => Promise<unknown> | unknown) {
  try {
    void fn();
  } catch {
    // expo-haptics throws on web / unsupported devices — never let a
    // tactile cue break a real interaction.
  }
}

export const haptic = {
  /** Soft tick — segmented control / chip change / row picked from a list.
   *  iOS: UISelectionFeedbackGenerator. */
  selection: () => safe(() => Haptics.selectionAsync()),

  /** Light tap — FAB tap, subtle "I heard you" feedback.
   *  iOS: UIImpactFeedbackGenerator(.light). */
  lightImpact: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),

  /** Medium tap — confirming a small commit (toggle, save sub-flow).
   *  iOS: UIImpactFeedbackGenerator(.medium). */
  mediumImpact: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),

  /** Heavy thump — destructive confirm tap (Delete).
   *  iOS: UIImpactFeedbackGenerator(.heavy). */
  heavyImpact: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),

  /** Two-tap up-tick — successful save / submission landed.
   *  iOS: UINotificationFeedbackGenerator(.success). */
  success: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),

  /** Two-tap mid pulse — non-destructive caution (validation needed).
   *  iOS: UINotificationFeedbackGenerator(.warning). */
  warning: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),

  /** Three-tap descending — operation failed (network error, save error).
   *  iOS: UINotificationFeedbackGenerator(.error). */
  error: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
