/**
 * Live subscription to a project's R2 storage usage.
 *
 * Reads `projectStorage/{projectId}` — a doc maintained server-side
 * by the `recordStorageEvent` / `r2DeleteObject` Cloud Functions.
 * Returns running totals (bytes + file count) for the project.
 *
 * Falls back to zero when the doc doesn't exist yet (project hasn't
 * uploaded anything) so callers can render `0 KB · 0 files` without
 * any null-handling.
 */
import { useEffect, useState } from 'react';

import { db } from '@/src/lib/firebase';

export type ProjectStorageTotals = {
  totalBytes: number;
  fileCount: number;
  loading: boolean;
};

export function useProjectStorage(
  projectId: string | undefined,
): ProjectStorageTotals {
  const [totalBytes, setTotalBytes] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      setTotalBytes(0);
      setFileCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = db
      .collection('projectStorage')
      .doc(projectId)
      .onSnapshot(
        (snap) => {
          if (!snap.exists) {
            setTotalBytes(0);
            setFileCount(0);
          } else {
            const data = snap.data() as
              | { totalBytes?: number; fileCount?: number }
              | undefined;
            // Counters could in theory go slightly negative if
            // tracking drifts; clamp to 0 for display.
            setTotalBytes(Math.max(0, data?.totalBytes ?? 0));
            setFileCount(Math.max(0, data?.fileCount ?? 0));
          }
          setLoading(false);
        },
        (err) => {
          console.warn('[useProjectStorage] snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [projectId]);

  return { totalBytes, fileCount, loading };
}

/** Format a byte count for compact display: 412KB, 1.2MB, 4.7GB. */
export function prettyBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
