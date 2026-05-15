/**
 * Finance tab — v2 design.
 *
 * Layout:
 *   1. Header — "Finance" title + OrgSwitcher chip + notifications icon
 *   2. SubTabs (Finance / Expenses / Staff / Payroll / Attendance)
 *   3. Horizontal pager wrapping the 5 finance sub-tab screens
 *
 * Permission-gated by `finance.read`. Roles without the cap see a locked
 * empty state.
 *
 * The route file is still named `overview.tsx` so existing deep links
 * (`/(app)/(tabs)/overview`) keep resolving — only the visible label
 * changed to "Finance". Bottom-bar icon + every visible label everywhere
 * follows suit.
 *
 * Previously this screen also rendered a long "Overview body" (hero
 * balance card, critical-projects alert, quick-action grid, pending
 * approvals rail, today's appointments rail, leads pipeline rail,
 * today's tasks list and recent ledger list). That body migrated to the
 * hero card on the Projects list page, so the sub-tab + every supporting
 * data hook / helper / component / style was removed in this rewrite —
 * not commented out, not left behind. The previously orphaned files
 * (`useCriticalProjects`) get deleted in the same change set.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardTab as FinanceDashboardTab } from '@/src/features/finance/tabs/DashboardTab';
import { ExpensesTab as FinanceExpensesTab } from '@/src/features/finance/tabs/ExpensesTab';
import { StaffTab as FinanceStaffTab } from '@/src/features/finance/tabs/StaffTab';
import { PayrollTab as FinancePayrollTab } from '@/src/features/finance/tabs/PayrollTab';
import { AttendanceTab as FinanceAttendanceTab } from '@/src/features/finance/tabs/AttendanceTab';

import { usePermissions } from '@/src/features/org/usePermissions';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { OrgSwitcher } from '@/src/ui/v2/OrgSwitcher';
import { SubTabs } from '@/src/ui/v2/SubTabs';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SegmentKey =
  | 'finance'
  | 'expenses'
  | 'staff'
  | 'payroll'
  | 'attendance';

const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'finance',    label: 'Finance' },
  { key: 'expenses',   label: 'Expenses' },
  { key: 'staff',      label: 'Staff' },
  { key: 'payroll',    label: 'Payroll' },
  { key: 'attendance', label: 'Attendance' },
];

export default function FinanceTabScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { can } = usePermissions();

  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const initialTabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialSegment: SegmentKey =
    initialTabParam === 'expenses'
    || initialTabParam === 'staff'
    || initialTabParam === 'payroll'
    || initialTabParam === 'attendance'
      ? (initialTabParam as SegmentKey)
      : 'finance';

  const [segment, setSegment] = useState<SegmentKey>(initialSegment);
  const canFinanceRead = can('finance.read');
  const pagerRef = useRef<FlatList<(typeof SEGMENTS)[number]> | null>(null);
  const isUserSwipe = useRef(true);

  const handleSegmentChange = useCallback((next: SegmentKey) => {
    setSegment(next);
    const idx = SEGMENTS.findIndex((s) => s.key === next);
    if (idx >= 0) {
      isUserSwipe.current = false;
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, []);
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!isUserSwipe.current || viewableItems.length === 0) return;
      const key = viewableItems[0].item.key as SegmentKey;
      setSegment(key);
    },
  ).current;
  const onScrollBeginDrag = useCallback(() => {
    isUserSwipe.current = true;
  }, []);
  const onMomentumScrollEnd = useCallback(() => {
    isUserSwipe.current = true;
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — title + OrgSwitcher + notifications */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text variant="title2" color="label" style={{ fontWeight: '700' }}>
          Finance
        </Text>
        <View style={{ flex: 1 }} />
        <OrgSwitcher />
        <Pressable
          onPress={() => router.push('/(app)/notifications' as never)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: t.colors.surface,
              borderRadius: 999,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.06)',
              borderWidth: t.hairline,
            },
            t.shadows.resting,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Notifications"
        >
          <Ionicons
            name="notifications-outline"
            size={16}
            color={t.colors.label}
          />
        </Pressable>
      </View>

      {canFinanceRead ? (
        <>
          {/* SubTabs — Finance / Expenses / Staff / Payroll / Attendance */}
          <SubTabs
            items={SEGMENTS}
            selected={segment}
            onChange={(k) => handleSegmentChange(k as SegmentKey)}
          />

          {/* Horizontal pager */}
          <FlatList
            ref={pagerRef}
            data={SEGMENTS}
            keyExtractor={(item) => item.key}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
                {item.key === 'finance' ? (
                  <FinanceDashboardTab />
                ) : item.key === 'expenses' ? (
                  <FinanceExpensesTab />
                ) : item.key === 'staff' ? (
                  <FinanceStaffTab />
                ) : item.key === 'payroll' ? (
                  <FinancePayrollTab />
                ) : (
                  <FinanceAttendanceTab />
                )}
              </View>
            )}
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
        </>
      ) : (
        <View style={styles.empty}>
          <Ionicons
            name="lock-closed-outline"
            size={32}
            color={t.colors.tertiary}
          />
          <Text
            variant="callout"
            color="label"
            style={{ marginTop: 12, fontWeight: '600' }}
          >
            Finance is locked for your role
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{
              marginTop: 4,
              textAlign: 'center',
              paddingHorizontal: 32,
            }}
          >
            Ask the workspace admin to grant the Finance permission.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 80,
  },
});
