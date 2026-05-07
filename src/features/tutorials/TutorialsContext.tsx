/**
 * TutorialsContext — single Firestore subscription for tutorial video config.
 *
 * Mounted once in app/(app)/_layout.tsx so every authenticated screen
 * can call `useTutorialVideo(pageKey)` without triggering separate reads.
 *
 * Data lives at `system/tutorialVideos` — one doc, map of pageKey →
 * TutorialVideoEntry. The doc is admin-managed from the web portal;
 * clients are read-only.
 *
 * If the doc doesn't exist yet (no videos configured), `videos` stays
 * `null` and `useTutorialVideo` returns `null` for every key, so every
 * page falls through to its original empty state. Zero-config default.
 */
import { createContext, useContext, useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';
import type { TutorialVideoEntry, TutorialVideosDoc } from './types';

// ── Context ───────────────────────────────────────────────────────────

type TutorialsContextValue = {
  /** Full doc contents, or null if not yet loaded / doc missing. */
  videos: TutorialVideosDoc | null;
};

const TutorialsContext = createContext<TutorialsContextValue>({ videos: null });

// ── Provider ─────────────────────────────────────────────────────────

export function TutorialsProvider({ children }: { children: React.ReactNode }) {
  const [videos, setVideos] = useState<TutorialVideosDoc | null>(null);

  useEffect(() => {
    // onSnapshot returns the unsubscribe function — returned directly
    // so React cleans up on unmount (e.g. sign-out).
    return db.doc('system/tutorialVideos').onSnapshot(
      (snap) => {
        if (!snap.exists) {
          setVideos(null);
          return;
        }
        setVideos((snap.data() ?? null) as TutorialVideosDoc | null);
      },
      (err) => {
        // Non-fatal: if the doc is missing or rules deny (e.g. not
        // signed in yet), just leave videos as null so empty states
        // render their original fallback content.
        console.warn('[TutorialsContext] snapshot error:', err);
      },
    );
  }, []);

  return (
    <TutorialsContext.Provider value={{ videos }}>
      {children}
    </TutorialsContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────

/** Raw context access. Prefer `useTutorialVideo` for typical usage. */
export function useTutorialsContext(): TutorialsContextValue {
  return useContext(TutorialsContext);
}

/**
 * Returns the tutorial video entry for a given page key, or `null` if:
 *   - no doc exists yet (admin hasn't configured any videos)
 *   - no entry for this page key
 *   - the entry exists but `enabled` is false
 *
 * Callers render the tutorial card when non-null, otherwise render
 * their original empty state as-is.
 */
export function useTutorialVideo(pageKey: string): TutorialVideoEntry | null {
  const { videos } = useTutorialsContext();
  if (!videos) return null;
  const entry = videos[pageKey];
  if (!entry || !entry.enabled) return null;
  return entry;
}
