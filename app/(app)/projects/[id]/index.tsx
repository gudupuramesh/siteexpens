/**
 * Project detail screen — v2 design.
 *
 * Layout:
 *   1. AmbientBackground (soft radial glows)
 *   2. Compact nav header — back · cover thumb · name + uppercase meta · trailing icons
 *   3. v2 SubTabs strip — horizontally-scrollable tab labels with blue underline
 *   4. Swipeable horizontal pager — one tab per page
 *
 * Tabs (default: Transaction):
 *   Transaction · Site · Timeline · Attendance · Material · Party ·
 *   Whiteboard · Laminate · Files
 *
 * The trailing icons in the nav adapt to the active tab — e.g. on
 * Transaction it shows the payment-report shortcut, on Laminate the
 * PDF-export shortcut. The right-most ellipsis always opens the
 * Project Overview screen (separate route, behind the kebab).
 */
import { useFocusEffect } from '@react-navigation/native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProject } from '@/src/features/projects/useProject';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { useLaminates } from '@/src/features/laminates/useLaminates';
import { generateLaminateReport } from '@/src/features/laminates/laminateReport';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { SubTabs, type SubTabItem } from '@/src/ui/v2/SubTabs';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

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

type Tab = SubTabItem<TabKey>;

// Tab strip order: Party sits at the leading edge so the most
// frequently-needed cross-reference (who's involved on this project) is
// always one tap away. The DEFAULT landing tab is still 'transaction'
// (set in the useState initializer below) — that's the screen the user
// opens a project to look at most often.
const TABS: Tab[] = [
  { key: 'party',       label: 'Party' },
  { key: 'transaction', label: 'Transaction' },
  { key: 'site',        label: 'Site' },
  { key: 'task',        label: 'Timeline' },
  { key: 'attendance',  label: 'Attendance' },
  { key: 'material',    label: 'Material' },
  { key: 'whiteboard',  label: 'Whiteboard' },
  { key: 'laminate',    label: 'Laminate' },
  { key: 'files',       label: 'Files' },
];

const DEFAULT_TAB: TabKey = 'transaction';

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
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading, error } = useProject(id);
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: parties } = useParties(orgId);

  const visibleTabs = useVisibleProjectTabs();
  const visibleTABS = useMemo(
    () => TABS.filter((tt) => visibleTabs.has(tt.key)),
    [visibleTabs],
  );

  // Default to Transaction (regardless of where it sits in the strip) —
  // that's what users open a project to see first. Fall back to the
  // first visible tab if Transaction is hidden for the role.
  const [tab, setTab] = useState<TabKey>(() =>
    visibleTABS.some((tt) => tt.key === DEFAULT_TAB)
      ? DEFAULT_TAB
      : (visibleTABS[0]?.key ?? DEFAULT_TAB),
  );
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [tabDataRefreshKey, setTabDataRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setTabDataRefreshKey((k) => k + 1);
    }, []),
  );

  // Re-subscribed via the same focus key the tabs use, so the PDF
  // button enable state stays in lock-step with the laminate list
  // after pop-back from add/edit-laminate.
  const { rooms: lamRooms, data: lamData } = useLaminates(id, tabDataRefreshKey);

  // If the active tab is no longer visible (role changed mid-session,
  // e.g. demotion), snap to the first available one.
  useEffect(() => {
    if (visibleTABS.length === 0) return;
    if (!visibleTABS.some((tt) => tt.key === tab)) {
      setTab(visibleTABS[0].key);
    }
  }, [visibleTABS, tab]);

  const pagerRef = useRef<FlatList<Tab>>(null);
  const isUserSwipe = useRef(true);

  const handleTabChange = useCallback((key: TabKey) => {
    setTab(key);
    const idx = visibleTABS.findIndex((tt) => tt.key === key);
    if (idx >= 0) {
      isUserSwipe.current = false;
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, [visibleTABS]);

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
      <TabContent tab={item.key} />
    </View>
  ), []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <View style={styles.centered}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center', paddingHorizontal: 32 }}>
            {error ? `Couldn't load project: ${error}` : 'Project not found.'}
          </Text>
        </View>
      </View>
    );
  }

  const initials = project.name.slice(0, 2).toUpperCase();

  return (
    <TabPagerProvider>
    <ProjectTabRefreshProvider refreshKey={tabDataRefreshKey}>
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* ── Compact nav header */}
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.navIconBtn,
            {
              // Match the soft-fill chip pattern used on the overview header
              // and across other v2 surfaces — no white card look, no border,
              // no shadow. Reads as a tap target without shouting.
              backgroundColor: t.colors.fill3,
              borderRadius: 999,
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>

        <View
          style={[
            styles.navThumb,
            {
              backgroundColor:
                t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
              borderRadius: t.radii.tile,
            },
          ]}
        >
          {project.photoUri ? (
            <Image source={{ uri: project.photoUri }} style={styles.navThumbImg} />
          ) : (
            <Text
              variant="caption2"
              style={{
                color: t.palette.blue.base,
                fontWeight: '700',
                letterSpacing: 0.5,
              }}
            >
              {initials}
            </Text>
          )}
        </View>

        <View style={styles.navTitleWrap}>
          <Text
            variant="headline"
            color="label"
            style={{ fontWeight: '700' }}
            numberOfLines={1}
          >
            {project.name}
          </Text>
          {project.location || project.siteAddress ? (
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5, marginTop: 1 }}
              numberOfLines={1}
            >
              {(project.location || project.siteAddress).toUpperCase()}
            </Text>
          ) : null}
        </View>

        {tab === 'laminate' && lamData.length > 0 ? (
          <Pressable
            onPress={handleGeneratePdf}
            disabled={generatingPdf}
            hitSlop={10}
            style={({ pressed }) => [
              styles.navIconBtn,
              {
                // Document/PDF action — soft blue fill so the action reads as
                // interactive without breaking the calm-header pattern.
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
              pressed && { opacity: 0.7 },
              generatingPdf && { opacity: 0.4 },
            ]}
            accessibilityLabel="Generate laminate PDF"
          >
            <Ionicons
              name="document-text-outline"
              size={16}
              color={t.palette.blue.base}
            />
          </Pressable>
        ) : null}

        {tab === 'transaction' ? (
          <Pressable
            onPress={() => router.push(`/(app)/projects/${id}/transaction-report` as never)}
            hitSlop={10}
            style={({ pressed }) => [
              styles.navIconBtn,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Payment report"
          >
            <Ionicons
              name="document-text-outline"
              size={16}
              color={t.palette.blue.base}
            />
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => router.push(`/(app)/projects/${id}/overview` as never)}
          hitSlop={10}
          style={({ pressed }) => [
            styles.navIconBtn,
            {
              // Neutral chip for the kebab — same fill as the back button.
              backgroundColor: t.colors.fill3,
              borderRadius: 999,
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Project overview"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={16}
            color={t.colors.label}
          />
        </Pressable>
      </View>

      {/* ── Tab strip — v2 SubTabs (horizontally scrollable, blue underline) */}
      <SubTabs<TabKey>
        items={visibleTABS}
        selected={tab}
        onChange={(k) => handleTabChange(k)}
      />

      {/* ── Swipeable tab content */}
      <View style={styles.tabContent}>
        <TabPager
          tabs={visibleTABS}
          // Pager opens on the Transaction page even though Party is the
          // first tab in the strip. If Transaction is hidden for the
          // current role, fall back to whichever tab is selected.
          initialIndex={Math.max(
            0,
            visibleTABS.findIndex((tt) => tt.key === tab),
          )}
          pagerRef={pagerRef}
          renderTabPage={renderTabPage}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />
      </View>

    </View>
    </ProjectTabRefreshProvider>
    </TabPagerProvider>
  );
}

function TabPager({
  tabs,
  initialIndex,
  pagerRef,
  renderTabPage,
  onViewableItemsChanged,
  onScrollBeginDrag,
  onMomentumScrollEnd,
}: {
  tabs: Tab[];
  initialIndex: number;
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
      initialScrollIndex={initialIndex}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Nav bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  navIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navThumb: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  navThumbImg: {
    width: '100%',
    height: '100%',
  },
  navTitleWrap: {
    flex: 1,
    minWidth: 0,
  },

  // Tab content
  tabContent: {
    flex: 1,
  },
});
