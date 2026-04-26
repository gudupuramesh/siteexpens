/**
 * CRM — Leads & Appointments (org-scoped).
 *
 * Layout mirrors the project detail screen: a horizontally scrollable
 * underline tab strip flush at the top (Leads | Appointments) feeding a
 * swipeable pager. No big "CRM" hero header — the screen begins with
 * the tabs, exactly like Overview · Transaction · Site · … on a project.
 */
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';

import { AppointmentsTab } from '@/src/features/crm/tabs/AppointmentsTab';
import { LeadsTab } from '@/src/features/crm/tabs/LeadsTab';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { Screen } from '@/src/ui/Screen';
import { color } from '@/src/theme';
import { fontFamily } from '@/src/theme/tokens';

const CRM_SEGMENTS = [
  { key: 'leads' as const, label: 'Leads' },
  { key: 'appointments' as const, label: 'Appointments' },
];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CrmTabScreen() {
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const [segment, setSegment] = useState<'leads' | 'appointments'>('leads');
  const pagerRef = useRef<FlatList<(typeof CRM_SEGMENTS)[number]> | null>(null);
  const tabBarRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const tabBarWidth = useRef(0);
  const isUserSwipe = useRef(true);

  const onTabBarLayout = useCallback((e: LayoutChangeEvent) => {
    tabBarWidth.current = e.nativeEvent.layout.width;
  }, []);

  const onTabLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[key] = { x, width };
  }, []);

  const syncTabBarToActive = useCallback((key: 'leads' | 'appointments', animated = true) => {
    const layout = tabLayouts.current[key];
    if (!layout || !tabBarRef.current) return;
    const targetX = Math.max(0, layout.x - (tabBarWidth.current - layout.width) / 2);
    tabBarRef.current.scrollTo({ x: targetX, animated });
  }, []);

  const handleSegmentChange = useCallback((next: 'leads' | 'appointments') => {
    setSegment(next);
    syncTabBarToActive(next, true);
    const idx = CRM_SEGMENTS.findIndex((s) => s.key === next);
    if (idx >= 0) {
      isUserSwipe.current = false;
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, [syncTabBarToActive]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!isUserSwipe.current || viewableItems.length === 0) return;
    const key = viewableItems[0].item.key as 'leads' | 'appointments';
    setSegment(key);
  }).current;

  const onScrollBeginDrag = useCallback(() => {
    isUserSwipe.current = true;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    isUserSwipe.current = true;
  }, []);

  useEffect(() => {
    syncTabBarToActive(segment, true);
  }, [segment, syncTabBarToActive]);

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Page title */}
      <View style={styles.pageHeader}>
        <RNText style={styles.pageTitle}>CRM</RNText>
      </View>

      <ScrollView
        ref={tabBarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        onLayout={onTabBarLayout}
      >
        {CRM_SEGMENTS.map((item) => {
          const active = segment === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleSegmentChange(item.key)}
              style={styles.tabBtn}
              onLayout={(e) => onTabLayout(item.key, e)}
            >
              <RNText
                style={[
                  styles.tabLabel,
                  { color: active ? color.text : color.textMuted, fontWeight: active ? '600' : '500' },
                ]}
              >
                {item.label}
              </RNText>
              <View style={[styles.tabUnderline, active && { backgroundColor: color.primary }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.body}>
        <FlatList
          ref={pagerRef}
          data={CRM_SEGMENTS}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.page}>
              {item.key === 'leads' ? (
                <LeadsTab orgId={orgId} />
              ) : (
                <AppointmentsTab orgId={orgId} />
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
  },
  pageTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.4,
  },
  tabBar: {
    flexGrow: 0,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  tabBarContent: {
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
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
  body: { flex: 1 },
  page: { width: SCREEN_WIDTH, flex: 1 },
});
