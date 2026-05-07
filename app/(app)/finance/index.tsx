/**
 * Studio Finance hub — tabbed home for org-level money + people:
 *   Dashboard · Expenses · Staff   (Phase 1)
 *   Payroll · Attendance           (Phase 2 — coming next)
 *
 * Permission: gated behind `finance.read` (existing capability —
 * SuperAdmin / Admin / Accountant only). Direct URL hits without
 * the capability render a friendly access-denied state instead of
 * the tab pager.
 *
 * Pattern: mirrors `app/(app)/projects/[id]/index.tsx` — horizontally
 * scrollable hairline tab strip + a `FlatList` pager underneath.
 */
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { usePermissions } from '@/src/features/org/usePermissions';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, fontFamily } from '@/src/theme/tokens';

import { DashboardTab } from '@/src/features/finance/tabs/DashboardTab';
import { ExpensesTab } from '@/src/features/finance/tabs/ExpensesTab';
import { StaffTab } from '@/src/features/finance/tabs/StaffTab';
import { PayrollTab } from '@/src/features/finance/tabs/PayrollTab';
import { AttendanceTab } from '@/src/features/finance/tabs/AttendanceTab';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabKey = 'dashboard' | 'expenses' | 'staff' | 'payroll' | 'attendance';
type Tab = { key: TabKey; label: string };

const TABS: Tab[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'staff', label: 'Staff' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'attendance', label: 'Attendance' },
];

function TabContent({ tab }: { tab: TabKey }) {
  switch (tab) {
    case 'dashboard':
      return <DashboardTab />;
    case 'expenses':
      return <ExpensesTab />;
    case 'staff':
      return <StaffTab />;
    case 'payroll':
      return <PayrollTab />;
    case 'attendance':
      return <AttendanceTab />;
  }
}

export default function FinanceScreen() {
  const { can } = usePermissions();
  const canRead = can('finance.read');

  const [tab, setTab] = useState<TabKey>('dashboard');
  const pagerRef = useRef<FlatList>(null);
  const tabBarRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Partial<Record<TabKey, { x: number; width: number }>>>({});
  const tabBarWidth = useRef(0);
  const isUserSwipe = useRef(true);

  const onTabBarLayout = useCallback((e: LayoutChangeEvent) => {
    tabBarWidth.current = e.nativeEvent.layout.width;
  }, []);

  const onTabLayout = useCallback((key: TabKey, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[key] = { x, width };
  }, []);

  const syncTabBarToActive = useCallback((key: TabKey, animated = true) => {
    const layout = tabLayouts.current[key];
    if (!layout || !tabBarRef.current) return;
    const targetX = Math.max(0, layout.x - (tabBarWidth.current - layout.width) / 2);
    tabBarRef.current.scrollTo({ x: targetX, animated });
  }, []);

  const handleTabChange = useCallback(
    (key: TabKey) => {
      setTab(key);
      syncTabBarToActive(key, true);
      const idx = TABS.findIndex((t) => t.key === key);
      if (idx >= 0) {
        isUserSwipe.current = false;
        pagerRef.current?.scrollToIndex({ index: idx, animated: true });
      }
    },
    [syncTabBarToActive],
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && isUserSwipe.current) {
        const key = viewableItems[0].item.key as TabKey;
        setTab(key);
      }
    },
  ).current;

  const onScrollBeginDrag = useCallback(() => {
    isUserSwipe.current = true;
  }, []);
  const onMomentumScrollEnd = useCallback(() => {
    isUserSwipe.current = true;
  }, []);

  useEffect(() => {
    syncTabBarToActive(tab, true);
  }, [tab, syncTabBarToActive]);

  // Hook MUST be defined before any conditional return below — moving it
  // past the `!canRead` early return would change the hook count between
  // renders (the classic "Rendered more hooks than during the previous
  // render" crash).
  const renderTabPage = useCallback(
    ({ item }: { item: Tab }) => (
      <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
        <TabContent tab={item.key} />
      </View>
    ),
    [],
  );

  if (!canRead) {
    return (
      <Screen bg="grouped" padded>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.deniedHeader}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="arrow-back" size={22} color={color.text} />
          </Pressable>
        </View>
        <Text variant="title" color="text" style={{ marginTop: 24 }}>
          Finance
        </Text>
        <Text variant="body" color="textMuted" style={{ marginTop: 8 }}>
          You don't have permission to view studio finances. Ask a Super Admin
          or Admin to grant you the Accountant role.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.navBackBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={color.textMuted} />
        </Pressable>
        <View style={styles.navTitleWrap}>
          <Text style={styles.navTitle}>Finance</Text>
          <Text style={styles.navSub}>STUDIO HUB</Text>
        </View>
      </View>

      {/* Tab strip */}
      <ScrollView
        ref={tabBarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        onLayout={onTabBarLayout}
      >
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleTabChange(item.key)}
              style={styles.tabBtn}
              onLayout={(e) => onTabLayout(item.key, e)}
            >
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: active ? color.text : color.textMuted,
                    fontWeight: active ? '600' : '500',
                  },
                ]}
              >
                {item.label}
              </Text>
              <View
                style={[
                  styles.tabUnderline,
                  active && { backgroundColor: color.primary },
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Pager */}
      <View style={styles.pagerWrap}>
        <FlatList
          ref={pagerRef}
          data={TABS}
          keyExtractor={(item) => item.key}
          renderItem={renderTabPage}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          initialScrollIndex={0}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  deniedHeader: {
    flexDirection: 'row',
    paddingTop: 4,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 10,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    gap: 10,
  },
  navBackBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleWrap: { flex: 1, minWidth: 0 },
  navTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 17,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.3,
  },
  navSub: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textFaint,
    letterSpacing: 1.2,
    marginTop: 1,
  },
  tabBar: {
    flexGrow: 0,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  tabBarContent: { paddingHorizontal: 16 },
  tabBtn: { paddingHorizontal: 12, paddingTop: 10 },
  tabLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    paddingBottom: 8,
  },
  tabUnderline: {
    height: 2,
    backgroundColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },
  pagerWrap: {
    flex: 1,
    backgroundColor: color.bgGrouped,
  },
});
