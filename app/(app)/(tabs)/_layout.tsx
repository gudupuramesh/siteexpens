/**
 * Bottom tab bar layout for the primary app navigation.
 *
 * 4 tabs: Projects (dashboard), Parties, CRM, Chats. Side drawer
 * (hamburger from Projects tab) holds org-level settings — not in
 * this layout.
 */
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, shadow } from '@/src/theme';

type IconKey = 'projects' | 'parties' | 'crm' | 'chats';

function TabGlyph({ k, active }: { k: IconKey; active: boolean }) {
  // Minimal glyphs drawn with text characters until we wire icons. Stays
  // outline-only per design system, primary when active, textMuted idle.
  const c = active ? color.primary : color.textFaint;
  const map: Record<IconKey, string> = {
    projects: '⌂',
    parties: '◉',
    crm: '✦',
    chats: '◯',
  };
  return (
    <View style={styles.iconWrap}>
      <Text variant="title" style={{ color: c, fontSize: 22, lineHeight: 24 }}>
        {map[k]}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
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
        }}
      />
      <Tabs.Screen
        name="parties"
        options={{
          title: 'Parties',
          tabBarIcon: ({ focused }) => <TabGlyph k="parties" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="crm"
        options={{
          title: 'CRM',
          tabBarIcon: ({ focused }) => <TabGlyph k="crm" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ focused }) => <TabGlyph k="chats" active={focused} />,
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
