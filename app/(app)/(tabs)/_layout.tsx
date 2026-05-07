/**
 * Bottom tab bar layout for the primary app navigation.
 *
 * 5 tab routes (Projects, Overview, CRM, Toolkit, More) — but the
 * VISIBLE set is per-role. `useVisibleBottomTabs()` returns the keys
 * the current role can see, derived from the matrix in
 * `docs/roles-and-permissions.md`. Each `<Tabs.Screen>` stays
 * mounted (so deep-link routes still resolve), but the tab bar
 * item is hidden via `tabBarItemStyle.display: 'none'` for any
 * route the role can't see.
 *
 * Why hide-via-display instead of removing the `<Tabs.Screen>`
 * entirely: Expo Router infers route names from the file system
 * AND the Tabs.Screen list — removing one mid-render confuses the
 * router and triggers a "Couldn't navigate" warning if a
 * navigation event fires for that route. `display: none` is the
 * Expo Router-recommended idiom for role/feature-flag tab hiding.
 */
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useVisibleBottomTabs, type BottomTabKey } from '@/src/features/org/useVisibleTabs';
import { Text } from '@/src/ui/Text';
import { color, shadow } from '@/src/theme';

type IconKey = 'projects' | 'overview' | 'crm' | 'toolkit' | 'chats';

function TabGlyph({ k, active }: { k: IconKey; active: boolean }) {
  const c = active ? color.primary : color.textFaint;
  const map: Record<IconKey, string> = {
    projects: '⌂',
    overview: '▤',
    crm: '✦',
    toolkit: '⚙',
    chats: '⋯',
  };
  return (
    <View style={styles.iconWrap}>
      <Text variant="title" style={{ color: c, fontSize: 22, lineHeight: 24 }}>
        {map[k]}
      </Text>
    </View>
  );
}

/** Build a per-tab style override that collapses the tab item when
 *  the role can't see it. */
function hideIfNotIn(visible: ReadonlySet<BottomTabKey>, key: BottomTabKey) {
  return visible.has(key) ? undefined : { display: 'none' as const };
}

export default function TabsLayout() {
  const visible = useVisibleBottomTabs();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // `fade` cross-dissolve. The light-grey ghost rectangles that
        // used to appear behind Overview's cards on Projects→Overview
        // weren't caused by this animation — they were the Android
        // `elevation` shadow on those cards painting one frame before
        // the white card body filled in over it (Android-only; iOS
        // doesn't render elevation). Fix landed in overview.tsx by
        // removing the elevation; animation can stay smooth.
        animation: 'fade',
        tabBarActiveTintColor: color.primary,
        tabBarInactiveTintColor: color.textFaint,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Projects',
          tabBarIcon: ({ focused }) => <TabGlyph k="projects" active={focused} />,
          tabBarItemStyle: hideIfNotIn(visible, 'index') ?? styles.item,
        }}
      />
      <Tabs.Screen
        name="overview"
        options={{
          title: 'Overview',
          tabBarIcon: ({ focused }) => <TabGlyph k="overview" active={focused} />,
          tabBarItemStyle: hideIfNotIn(visible, 'overview') ?? styles.item,
        }}
      />
      <Tabs.Screen
        name="crm"
        options={{
          title: 'CRM',
          tabBarIcon: ({ focused }) => <TabGlyph k="crm" active={focused} />,
          tabBarItemStyle: hideIfNotIn(visible, 'crm') ?? styles.item,
        }}
      />
      <Tabs.Screen
        name="toolkit"
        options={{
          title: 'Toolkit',
          tabBarIcon: ({ focused }) => <TabGlyph k="toolkit" active={focused} />,
          tabBarItemStyle: hideIfNotIn(visible, 'toolkit') ?? styles.item,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'More',
          tabBarIcon: ({ focused }) => <TabGlyph k="chats" active={focused} />,
          tabBarItemStyle: hideIfNotIn(visible, 'chats') ?? styles.item,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.surface,
    borderTopColor: color.border,
    borderTopWidth: 1,
    height: 72,
    paddingTop: 8,
    paddingBottom: 8,
    ...shadow.hairline,
  },
  item: {
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  iconWrap: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
