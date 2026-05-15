/**
 * usePullToRefresh — drop-in `RefreshControl` props for any list that
 * already streams from Firestore.
 *
 * The Firestore `onSnapshot` listeners are already pushing fresh data
 * automatically — there's nothing for the user to "fetch". This hook
 * gives them the iOS rubber-band gesture + a haptic at trigger anyway,
 * because the affordance is what feels right, not the actual reload:
 *
 *   1. Drag down past the threshold
 *   2. Light haptic fires the moment we kick off
 *   3. Spinner spins for ~700 ms (long enough to feel like a real
 *      resync, short enough that it never looks stuck)
 *   4. Spinner retracts
 *
 * If you ever wire a real refetch (REST call, callable Cloud Function),
 * pass the awaitable to `runRefresh` and it'll spin for the duration
 * of that promise instead of the timeout.
 *
 * Usage:
 *   const refresh = usePullToRefresh();
 *   <ScrollView refreshControl={<RefreshControl {...refresh.props} />}>
 */
import { useCallback, useState } from 'react';

import { haptic } from '@/src/lib/haptics';
import { useThemeV2 } from '@/src/theme/v2';

const MIN_SPIN_MS = 700;

export type PullToRefreshHookResult = {
  /** Spread onto `<RefreshControl ... />`. */
  props: {
    refreshing: boolean;
    onRefresh: () => void;
    tintColor: string;
    colors: string[];
    progressBackgroundColor: string;
  };
  /** Manually run a refresh (e.g. after a mutation). Awaits the
   *  optional async function for at least MIN_SPIN_MS. */
  runRefresh: (extra?: () => Promise<unknown>) => Promise<void>;
};

export function usePullToRefresh(
  asyncRefetch?: () => Promise<unknown>,
): PullToRefreshHookResult {
  const t = useThemeV2();
  const [refreshing, setRefreshing] = useState(false);

  const runRefresh = useCallback(
    async (extra?: () => Promise<unknown>) => {
      setRefreshing(true);
      haptic.lightImpact();
      try {
        const work: Array<Promise<unknown>> = [
          new Promise((res) => setTimeout(res, MIN_SPIN_MS)),
        ];
        if (asyncRefetch) work.push(asyncRefetch().catch(() => undefined));
        if (extra) work.push(extra().catch(() => undefined));
        await Promise.all(work);
      } finally {
        setRefreshing(false);
      }
    },
    [asyncRefetch],
  );

  return {
    props: {
      refreshing,
      onRefresh: () => void runRefresh(),
      // iOS spinner color
      tintColor: t.palette.blue.base,
      // Android spinner palette
      colors: [t.palette.blue.base],
      progressBackgroundColor: t.colors.surface,
    },
    runRefresh,
  };
}
