/**
 * Studio Finance hub — v2 design.
 *
 * Tabbed home for org-level money + people:
 *   Dashboard · Expenses · Staff · Payroll · Attendance
 *
 * Permission: gated behind `finance.read` (existing capability —
 * SuperAdmin / Admin / Accountant only). Direct URL hits without the
 * capability render a friendly access-denied state instead of the
 * tab pager.
 *
 * Layout:
 *   1. v2 header (transparent over AmbientBackground): back · "Finance" + "STUDIO HUB" caption
 *   2. v2 SubTabs strip (underline-style)
 *   3. Pager — `FlatList` with `pagingEnabled` for swipeable tab body
 *
 * Mirrors the per-project tabs at `app/(app)/projects/[id]/index.tsx`.
 */
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { usePermissions } from '@/src/features/org/usePermissions';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { SubTabs } from '@/src/ui/v2/SubTabs';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

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
  const t = useThemeV2();
  const { can } = usePermissions();
  const canRead = can('finance.read');

  const [tab, setTab] = useState<TabKey>('dashboard');
  const pagerRef = useRef<FlatList>(null);
  const isUserSwipe = useRef(true);

  const handleTabChange = useCallback((key: TabKey) => {
    setTab(key);
    const idx = TABS.findIndex((tt) => tt.key === key);
    if (idx >= 0) {
      isUserSwipe.current = false;
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, []);

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

  // Reset to true on programmatic scroll completion (matches the
  // pager pattern used in `projects/[id]/index.tsx`).
  useEffect(() => {
    const id = setTimeout(() => {
      isUserSwipe.current = true;
    }, 400);
    return () => clearTimeout(id);
  }, [tab]);

  // Hook MUST stay above the conditional return below — moving it past
  // the `!canRead` early return would change the hook count between
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
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />

        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: t.colors.fill3, borderRadius: 999 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="chevron-back" size={18} color={t.colors.label} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="headline" color="label">
              Finance
            </Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.deniedBody}>
          <View
            style={[
              styles.deniedIcon,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                borderRadius: t.radii.tile + 4,
              },
            ]}
          >
            <Ionicons
              name="lock-closed-outline"
              size={28}
              color={t.palette.orange.base}
            />
          </View>
          <Text
            variant="title3"
            color="label"
            style={{ marginTop: 14, fontWeight: '700' }}
          >
            Finance is restricted
          </Text>
          <Text
            variant="callout"
            color="secondary"
            style={{ marginTop: 6, textAlign: 'center', maxWidth: 320 }}
          >
            You don't have permission to view studio finances. Ask a Super
            Admin or Admin to grant you the Accountant role.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — transparent so the AmbientBackground flows through */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="label">
            Finance
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            STUDIO HUB
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {/* SubTabs */}
      <SubTabs
        items={TABS}
        selected={tab}
        onChange={handleTabChange}
      />

      {/* Pager */}
      <View style={{ flex: 1 }}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Access-denied state
  deniedBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  deniedIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
