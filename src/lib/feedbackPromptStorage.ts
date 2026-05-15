/**
 * feedbackPromptStorage — once-per-day gate for the home-tab Feedback
 * prompt card.
 *
 * Stores a single key in AsyncStorage with today's `Date.toDateString()`
 * (e.g. `"Fri Mar 15 2026"`). Comparing the stored string against
 * today's avoids any timestamp / timezone / DST trickery: the value
 * naturally rolls over at local midnight.
 *
 * Both helpers fail closed on storage errors — we'd rather skip the
 * prompt on a broken device than show it on every open.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// Versioned key so a stale stamp from an earlier iteration of this
// feature doesn't keep the prompt suppressed for the rest of the day.
// Bump the suffix any time the trigger logic changes meaningfully.
const KEY = 'feedbackPrompt:lastShownDate:v2';

/** True if the prompt has already been surfaced today. */
export async function hasShownPromptToday(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return stored === new Date().toDateString();
  } catch {
    // Read failure → assume yes (fail-closed; we'd rather skip the
    // prompt than show it forever on a broken device).
    return true;
  }
}

/** Stamp today's date so the prompt won't show again until tomorrow. */
export async function markPromptShownToday(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, new Date().toDateString());
  } catch {
    // Best-effort. If the write fails we'll just show the prompt on
    // the next open too — annoying but not destructive.
  }
}
