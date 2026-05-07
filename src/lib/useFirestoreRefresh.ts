/**
 * useFirestoreRefresh — pull-to-refresh wiring for Firestore-snapshot hooks.
 *
 * The data hooks in this app use `onSnapshot` for live updates, so most of
 * the time pull-to-refresh is purely visual reassurance — the listener is
 * already pushing updates as Firestore commits them. But pull-to-refresh
 * is table-stakes UX: users expect to be able to manually trigger a re-fetch
 * if they sense something is stale (slow network, offline cache miss, etc.).
 *
 * Pattern this hook supports:
 *
 *   const { refreshing, refresh, refreshKey } = useFirestoreRefresh();
 *   useEffect(() => {
 *     const unsub = db.collection(...).onSnapshot(...);
 *     return unsub;
 *   }, [..., refreshKey]); // ← refreshKey as a dep forces resubscribe
 *
 *   <FlatList
 *     refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
 *     ...
 *   />
 *
 * When the user pulls down:
 *   1. `refresh()` is called — bumps refreshKey + sets refreshing=true
 *   2. The list hook's useEffect re-runs (because refreshKey changed) →
 *      old listener is unsubscribed, new one subscribes → fresh read
 *   3. After SPIN_DURATION_MS, refreshing auto-clears so the spinner hides
 *
 * The 800ms spin window is intentional: most snapshots return in <100ms but
 * the spinner needs to be visible long enough that the user feels the
 * pull-down was acknowledged. Anything under ~500ms feels jumpy.
 */
import { useCallback, useRef, useState } from 'react';

const SPIN_DURATION_MS = 800;

export type FirestoreRefreshState = {
  /** Pass to <RefreshControl refreshing={...} />. True for ~800ms after refresh. */
  refreshing: boolean;
  /** Pass to <RefreshControl onRefresh={...} />. Pull-to-refresh handler. */
  refresh: () => void;
  /** Add as a dep to your snapshot useEffect so it re-runs on refresh. */
  refreshKey: number;
};

export function useFirestoreRefresh(): FirestoreRefreshState {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    timeoutRef.current = setTimeout(() => {
      setRefreshing(false);
      timeoutRef.current = null;
    }, SPIN_DURATION_MS);
  }, []);

  return { refreshing, refresh, refreshKey };
}
