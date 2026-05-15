/**
 * Bottom tab bar layout for the primary app navigation.
 *
 * 5 tab routes (Projects, Overview, CRM, Toolkit, Account) — but the
 * VISIBLE set is per-role. `useVisibleBottomTabs()` returns the keys
 * the current role can see, and the v2 `<AppTabBar>` honours that set
 * when rendering the bottom capsule.
 *
 * Each `<Tabs.Screen>` stays mounted (so deep-link routes still
 * resolve) — the visible-set filtering happens in the tab bar VIEW,
 * not in the navigator. This is the Expo Router-recommended idiom for
 * role/feature-flag tab hiding.
 *
 * The system tab bar is hidden via `tabBarStyle: { display: 'none' }`;
 * `<AppTabBar>` (a v2 floating-glass capsule) is rendered instead via
 * the `tabBar` prop.
 */
import { Tabs } from 'expo-router';

import { AppTabBar } from '@/src/ui/v2/AppTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Projects' }} />
      <Tabs.Screen name="overview" options={{ title: 'Finance' }} />
      <Tabs.Screen name="crm"      options={{ title: 'CRM' }} />
      <Tabs.Screen name="toolkit"  options={{ title: 'Toolkit' }} />
      <Tabs.Screen name="account"  options={{ title: 'Account' }} />
    </Tabs>
  );
}
