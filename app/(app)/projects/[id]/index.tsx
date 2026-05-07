/**
 * Project detail screen — InteriorOS-styled wrapper.
 *
 * Layout:
 *   1. Compact nav (back · 28px thumb · name + uppercase mono address · ⋯)
 *   2. InteriorOS Segmented tab bar (top + bottom hairline, 2px accent
 *      underline on active tab, horizontally scrollable)
 *   3. Tab content fills remaining screen — swipeable pager
 *   4. ⋯ button pushes to the Project Overview screen (was a tab; moved
 *      out so the swipe pager focuses on the workstreams the user is
 *      actively in)
 *
 * Tabs (default: Transaction):
 *   Transaction · Site · Timeline · Attendance · Material · Party ·
 *   Whiteboard · Laminate · Files
 */
import { useFocusEffect } from '@react-navigation/native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useProject } from '@/src/features/projects/useProject';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { useLaminates } from '@/src/features/laminates/useLaminates';
import { generateLaminateReport } from '@/src/features/laminates/laminateReport';
import { PageEnter } from '@/src/ui/PageEnter';
import { Screen } from '@/src/ui/Screen';
import { Spinner } from '@/src/ui/Spinner';
import { color, fontFamily } from '@/src/theme/tokens';

import { PartyTab } from '@/src/features/projects/tabs/PartyTab';
import { TransactionTab } from '@/src/features/projects/tabs/TransactionTab';
import { SiteTab } from '@/src/features/projects/tabs/SiteTab';
import { TaskTab } from '@/src/features/projects/tabs/TaskTab';
import { AttendanceTab } from '@/src/features/projects/tabs/AttendanceTab';
import { MaterialTab } from '@/src/features/projects/tabs/MaterialTab';
import { DesignTab } from '@/src/features/projects/tabs/DesignTab';
import { LaminateTab } from '@/src/features/projects/tabs/LaminateTab';
import { WhiteboardTab } from '@/src/features/projects/tabs/WhiteboardTab';
import { ProjectTabRefreshProvider } from '@/src/features/projects/ProjectTabRefreshContext';
import { TabPagerProvider, useTabPager } from '@/src/features/projects/TabPagerContext';
import { useVisibleProjectTabs } from '@/src/features/org/useVisibleTabs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabKey =
  | 'transaction'
  | 'site'
  | 'task'
  | 'attendance'
  | 'material'
  | 'party'
  | 'whiteboard'
  | 'laminate'
  | 'files';

type Tab = { key: TabKey; label: string };

// "Overview" was the first tab; it's now a separate screen behind the
// ⋯ button (see app/(app)/projects/[id]/overview.tsx). The remaining
// tabs are the workstreams the user actively edits.
const TABS: Tab[] = [
  { key: 'transaction', label: 'Transaction' },
  { key: 'site',        label: 'Site' },
  { key: 'task',        label: 'Timeline' },
  { key: 'attendance',  label: 'Attendance' },
  { key: 'material',    label: 'Material' },
  { key: 'party',       label: 'Party' },
  { key: 'whiteboard',  label: 'Whiteboard' },
  { key: 'laminate',    label: 'Laminate' },
  { key: 'files',       label: 'Files' },
];

function TabContent({ tab }: { tab: TabKey }) {
  switch (tab) {
    case 'party':       return <PartyTab />;
    case 'transaction': return <TransactionTab />;
    case 'site':        return <SiteTab />;
    case 'task':        return <TaskTab />;
    case 'attendance':  return <AttendanceTab />;
    case 'material':    return <MaterialTab />;
    case 'whiteboard':  return <WhiteboardTab />;
    case 'laminate':    return <LaminateTab />;
    // Files tab — DesignTab component, renamed user-facing to "Files".
    case 'files':       return <DesignTab />;
  }
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading, error } = useProject(id);
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: parties } = useParties(orgId);
  const { rooms: lamRooms, data: lamData } = useLaminates(id);

  // Filter the static TABS array down to what the active role can
  // see. The set is derived from the role matrix in
  // `useVisibleProjectTabs` and matches `docs/roles-and-permissions.md`.
  // While permissions are still loading the hook returns the full
  // set so the user doesn't briefly see fewer tabs than they're
  // allowed.
  const visibleTabs = useVisibleProjectTabs();
  const visibleTABS = useMemo(
    () => TABS.filter((t) => visibleTabs.has(t.key)),
    [visibleTabs],
  );

  const [tab, setTab] = useState<TabKey>(() => visibleTABS[0]?.key ?? 'transaction');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [tabDataRefreshKey, setTabDataRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setTabDataRefreshKey((k) => k + 1);
    }, []),
  );

  // If the active tab is no longer visible (role changed mid-session,
  // e.g. demotion), snap to the first available one.
  useEffect(() => {
    if (visibleTABS.length === 0) return;
    if (!visibleTABS.some((t) => t.key === tab)) {
      setTab(visibleTABS[0].key);
    }
  }, [visibleTABS, tab]);
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

  const handleTabChange = useCallback((key: TabKey) => {
    setTab(key);
    syncTabBarToActive(key, true);
    const idx = visibleTABS.findIndex((t) => t.key === key);
    if (idx >= 0) {
      isUserSwipe.current = false;
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, [syncTabBarToActive, visibleTABS]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && isUserSwipe.current) {
      const key = viewableItems[0].item.key as TabKey;
      setTab(key);
    }
  }).current;

  const onScrollBeginDrag = useCallback(() => {
    isUserSwipe.current = true;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    isUserSwipe.current = true;
  }, []);

  useEffect(() => {
    // Keep top tab strip synced when tab changes via swipe.
    syncTabBarToActive(tab, true);
  }, [tab, syncTabBarToActive]);

  const handleGeneratePdf = useCallback(async () => {
    if (!project || lamData.length === 0) return;
    setGeneratingPdf(true);
    try {
      await generateLaminateReport({ project, rooms: lamRooms, parties });
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setGeneratingPdf(false);
    }
  }, [project, lamRooms, lamData, parties]);

  const renderTabPage = useCallback(({ item }: { item: Tab }) => (
    <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
      <PageEnter viewKey={item.key}>
        <TabContent tab={item.key} />
      </PageEnter>
    </View>
  ), []);

  if (loading) {
    return (
      <Screen bg="grouped">
        <Stack.Screen options={{ headerShown: false }} />
        <PageEnter viewKey="loading">
          <View style={styles.loading}>
            <Spinner size={32} />
          </View>
        </PageEnter>
      </Screen>
    );
  }

  if (!project) {
    return (
      <Screen bg="grouped">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <RNText style={styles.loadingText}>
            {error ? `Couldn't load project:\n${error}` : 'Project not found.'}
          </RNText>
        </View>
      </Screen>
    );
  }

  const initials = project.name.slice(0, 2).toUpperCase();

  return (
    <TabPagerProvider>
    <ProjectTabRefreshProvider refreshKey={tabDataRefreshKey}>
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Compact nav header — back · thumb · name + meta · ⋯ */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.navBackBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={18} color={color.textMuted} />
        </Pressable>

        <View style={styles.navThumb}>
          {project.photoUri ? (
            <Image source={{ uri: project.photoUri }} style={styles.navThumbImg} />
          ) : (
            <RNText style={styles.navThumbText}>{initials}</RNText>
          )}
        </View>

        <View style={styles.navTitleWrap}>
          <RNText style={styles.navTitle} numberOfLines={1}>
            {project.name}
          </RNText>
          {project.siteAddress ? (
            <RNText style={styles.navSub} numberOfLines={1}>
              {(project.location || project.siteAddress).toUpperCase()}
            </RNText>
          ) : null}
        </View>

        {tab === 'laminate' && lamData.length > 0 ? (
          <Pressable
            onPress={handleGeneratePdf}
            disabled={generatingPdf}
            hitSlop={12}
            style={({ pressed }) => [
              styles.navIconBtn,
              pressed && { opacity: 0.6 },
              generatingPdf && { opacity: 0.4 },
              { marginRight: 6 },
            ]}
            accessibilityLabel="Generate laminate PDF"
          >
            <Ionicons
              name="document-text-outline"
              size={16}
              color={color.primary}
            />
          </Pressable>
        ) : null}

        {tab === 'transaction' ? (
          <Pressable
            onPress={() => router.push(`/(app)/projects/${id}/transaction-report` as never)}
            hitSlop={12}
            style={({ pressed }) => [
              styles.navIconBtn,
              pressed && { opacity: 0.6 },
              { marginRight: 6 },
            ]}
            accessibilityLabel="Payment report"
          >
            <Ionicons
              name="document-text-outline"
              size={16}
              color={color.primary}
            />
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => router.push(`/(app)/projects/${id}/overview` as never)}
          hitSlop={12}
          style={({ pressed }) => [styles.navIconBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Project overview"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={16}
            color={color.text}
          />
        </Pressable>
      </View>

      {/* ── Tab bar — InteriorOS Segmented (top + bottom hairline, 2px underline) */}
      <ScrollView
        ref={tabBarRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
        onLayout={onTabBarLayout}
      >
        {visibleTABS.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => handleTabChange(item.key)}
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

      {/* ── Swipeable tab content */}
      <View style={styles.tabContent}>
        <TabPager
          tabs={visibleTABS}
          pagerRef={pagerRef}
          renderTabPage={renderTabPage}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />
      </View>

    </Screen>
    </ProjectTabRefreshProvider>
    </TabPagerProvider>
  );
}

function TabPager({
  tabs,
  pagerRef,
  renderTabPage,
  onViewableItemsChanged,
  onScrollBeginDrag,
  onMomentumScrollEnd,
}: {
  tabs: Tab[];
  pagerRef: React.RefObject<FlatList<Tab> | null>;
  renderTabPage: ({ item }: { item: Tab }) => React.ReactElement;
  onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  onScrollBeginDrag: () => void;
  onMomentumScrollEnd: () => void;
}) {
  const { swipeEnabled } = useTabPager();
  const n = Math.max(tabs.length, 1);
  return (
    <FlatList
      ref={pagerRef}
      data={tabs}
      keyExtractor={(item) => item.key}
      renderItem={renderTabPage}
      horizontal
      pagingEnabled
      scrollEnabled={swipeEnabled}
      showsHorizontalScrollIndicator={false}
      bounces={false}
      initialScrollIndex={0}
      removeClippedSubviews={false}
      initialNumToRender={n}
      maxToRenderPerBatch={n}
      windowSize={n + 2}
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
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: color.textMuted,
    textAlign: 'center',
  },

  // ── Nav bar
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
  navThumb: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  navThumbImg: {
    width: 28,
    height: 28,
  },
  navThumbText: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '500',
    color: color.textMuted,
    letterSpacing: 0.5,
  },
  navTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  navTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },
  navSub: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textFaint,
    letterSpacing: 1.2,
    marginTop: 1,
  },
  navIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Tab bar
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

  // ── Tab content
  tabContent: {
    flex: 1,
    backgroundColor: color.bgGrouped,
  },

});
