/**
 * v2 AppTabBar — bridge between Expo Router's `<Tabs>` navigator and the
 * v2 `<FloatingTabBar>` visual.
 *
 * Pluggable into a `<Tabs>` element via the `tabBar` prop:
 *
 *   <Tabs
 *     tabBar={(props) => <AppTabBar {...props} />}
 *     screenOptions={{ tabBarStyle: { display: 'none' } }}
 *   >...</Tabs>
 *
 * Responsibilities:
 *   • Read the active route name from Expo Router's tab state
 *   • Pass the per-role visible set from `useVisibleBottomTabs()`
 *   • Wire tap → navigation.navigate(routeName)
 *
 * The visual (capsule, blur, icons, labels, soft active pill) lives in
 * `<FloatingTabBar>` and stays purely presentational.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { useVisibleBottomTabs } from '@/src/features/org/useVisibleTabs';

import { FloatingTabBar, type TabKey } from './FloatingTabBar';

export function AppTabBar(props: BottomTabBarProps) {
  const { state, navigation } = props;
  const visible = useVisibleBottomTabs();

  // The route key Expo Router uses for "the active tab" is the screen
  // file name (e.g. 'index', 'overview', 'crm', 'toolkit', 'account').
  // Cast safe — `_layout.tsx` declares exactly these names.
  const active = state.routes[state.index]?.name as TabKey;

  const onChange = (key: TabKey) => {
    // Find the route by name and emit a tabPress event so any
    // listeners (e.g. scroll-to-top on double-tap) still fire, then
    // navigate. Mirrors Expo Router's default tabBar behavior.
    const route = state.routes.find((r) => r.name === key);
    if (!route) return;

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  return (
    <FloatingTabBar
      active={active}
      visible={visible as ReadonlySet<TabKey>}
      onChange={onChange}
    />
  );
}
