/**
 * TabPagerContext — lets a child tab temporarily disable the parent's
 * horizontal swipe pager. Used by tabs that contain their own horizontal
 * scrollables (e.g. the AttendanceTab date strip), where a swipe inside
 * the inner scroller would otherwise be intercepted as a tab change.
 *
 * Usage:
 *   <TabPagerProvider>
 *     <FlatList ... scrollEnabled={swipeEnabled} />
 *   </TabPagerProvider>
 *
 *   const { setSwipeEnabled } = useTabPager();
 *   <ScrollView
 *     onTouchStart={() => setSwipeEnabled(false)}
 *     onTouchEnd={() => setSwipeEnabled(true)}
 *     onTouchCancel={() => setSwipeEnabled(true)}
 *   />
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type TabPagerCtx = {
  swipeEnabled: boolean;
  setSwipeEnabled: (enabled: boolean) => void;
};

const Ctx = createContext<TabPagerCtx>({
  swipeEnabled: true,
  setSwipeEnabled: () => {},
});

export function TabPagerProvider({ children }: { children: ReactNode }) {
  const [swipeEnabled, setSwipeEnabledState] = useState(true);
  const setSwipeEnabled = useCallback((enabled: boolean) => {
    setSwipeEnabledState(enabled);
  }, []);
  const value = useMemo(
    () => ({ swipeEnabled, setSwipeEnabled }),
    [swipeEnabled, setSwipeEnabled],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTabPager(): TabPagerCtx {
  return useContext(Ctx);
}
