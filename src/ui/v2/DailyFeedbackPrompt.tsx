/**
 * DailyFeedbackPrompt — global app-level orchestrator that floats the
 * <FeedbackPromptCard> over WHATEVER screen the user happens to be on.
 *
 * UX rules:
 *   1. Don't show on cold open. Wait until the user has been actively
 *      using the app for 90 seconds (1.5 min) — long enough that
 *      they've engaged with something, short enough that the prompt
 *      arrives during the same session.
 *   2. Once per calendar day. If we already showed the prompt today
 *      (per `feedbackPromptStorage`), skip — no timer, no render.
 *   3. After it appears, the card auto-dismisses after 2 minutes
 *      (timer lives inside `FeedbackPromptCard`).
 *   4. The card floats at the top of the screen, below the safe-area
 *      inset. Pointer events on the outer wrap pass through so it
 *      doesn't block taps on whatever's underneath.
 *
 * Mounted as a sibling of `<Stack />` in `app/(app)/_layout.tsx`,
 * so it persists across screen pushes / tab switches.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  hasShownPromptToday,
  markPromptShownToday,
} from '@/src/lib/feedbackPromptStorage';

import { FeedbackPromptCard } from './FeedbackPromptCard';

/** Wait this long after the layout mounts before surfacing the card. */
const TRIGGER_DELAY_MS = 90 * 1000;

export function DailyFeedbackPrompt() {
  const [show, setShow] = useState(false);
  /** Hold the timer id so we can cancel cleanly on unmount or once-per-day. */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Skip the timer entirely if we already nudged the user today.
      const alreadyShown = await hasShownPromptToday();
      if (alreadyShown || cancelled) return;

      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        setShow(true);
        void markPromptShownToday();
      }, TRIGGER_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  if (!show) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={{ width: '100%', paddingHorizontal: 16 }}>
        <FeedbackPromptCard onDismiss={() => setShow(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // `pointerEvents="box-none"` on the outer wrap means taps fall
    // through to the screen underneath EXCEPT where the card itself
    // renders. The card has its own Pressable so it captures taps.
  },
});
