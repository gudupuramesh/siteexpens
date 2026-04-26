/**
 * Project detail screen — InteriorOS-styled wrapper.
 *
 * Layout:
 *   1. Compact nav (back · 28px thumb · name + uppercase mono address · ⋯)
 *   2. InteriorOS Segmented tab bar (top + bottom hairline, 2px accent
 *      underline on active tab, horizontally scrollable)
 *   3. Tab content fills remaining screen — swipeable pager
 *   4. Settings bottom-sheet via the ⋯ button
 *
 * Tabs (default: Overview):
 *   Overview · Transaction · Site · Timeline · Attendance · Material ·
 *   Party · MOM · Laminate · Design · Files
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

import { useProject } from '@/src/features/projects/useProject';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { useLaminates } from '@/src/features/laminates/useLaminates';
import { generateLaminateReport } from '@/src/features/laminates/laminateReport';
import { formatDateRange, formatInr } from '@/src/lib/format';
import { PageEnter } from '@/src/ui/PageEnter';
import { Screen } from '@/src/ui/Screen';
import { Spinner } from '@/src/ui/Spinner';
import { color, fontFamily } from '@/src/theme/tokens';

import { OverviewTab } from '@/src/features/projects/tabs/OverviewTab';
import { PartyTab } from '@/src/features/projects/tabs/PartyTab';
import { TransactionTab } from '@/src/features/projects/tabs/TransactionTab';
import { SiteTab } from '@/src/features/projects/tabs/SiteTab';
import { TaskTab } from '@/src/features/projects/tabs/TaskTab';
import { AttendanceTab } from '@/src/features/projects/tabs/AttendanceTab';
import { MaterialTab } from '@/src/features/projects/tabs/MaterialTab';
import { MOMTab } from '@/src/features/projects/tabs/MOMTab';
import { DesignTab } from '@/src/features/projects/tabs/DesignTab';
import { LaminateTab } from '@/src/features/projects/tabs/LaminateTab';
import { FilesTab } from '@/src/features/projects/tabs/FilesTab';
import { WhiteboardTab } from '@/src/features/projects/tabs/WhiteboardTab';
import { TabPagerProvider, useTabPager } from '@/src/features/projects/TabPagerContext';

type TabKey =
  | 'overview'
  | 'transaction'
  | 'site'
  | 'task'
  | 'attendance'
  | 'material'
  | 'party'
  | 'mom'
  | 'whiteboard'
  | 'laminate'
  | 'design'
  | 'files';

type Tab = { key: TabKey; label: string };

const TABS: Tab[] = [
  { key: 'overview',    label: 'Overview' },
  { key: 'transaction', label: 'Transaction' },
  { key: 'site',        label: 'Site' },
  { key: 'task',        label: 'Timeline' },
  { key: 'attendance',  label: 'Attendance' },
  { key: 'material',    label: 'Material' },
  { key: 'party',       label: 'Party' },
  { key: 'mom',         label: 'MOM' },
  { key: 'whiteboard',  label: 'Whiteboard' },
  { key: 'laminate',    label: 'Laminate' },
  { key: 'design',      label: 'Design' },
  { key: 'files',       label: 'Files' },
];

const STATUS_LABELS: Record<string, { label: string; fg: string; bg: string }> = {
  active:    { label: 'Active',    fg: color.success,   bg: color.successSoft },
  on_hold:   { label: 'On Hold',   fg: color.warning,   bg: color.warningSoft },
  completed: { label: 'Completed', fg: color.textMuted, bg: color.surfaceAlt },
  archived:  { label: 'Archived',  fg: color.textFaint, bg: color.surfaceAlt },
};

function TabContent({ tab }: { tab: TabKey }) {
  switch (tab) {
    case 'overview':    return <OverviewTab />;
    case 'party':       return <PartyTab />;
    case 'transaction': return <TransactionTab />;
    case 'site':        return <SiteTab />;
    case 'task':        return <TaskTab />;
    case 'attendance':  return <AttendanceTab />;
    case 'material':    return <MaterialTab />;
    case 'mom':         return <MOMTab />;
    case 'whiteboard':  return <WhiteboardTab />;
    case 'laminate':    return <LaminateTab />;
    case 'design':      return <DesignTab />;
    case 'files':       return <FilesTab />;
  }
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading, error } = useProject(id);
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: parties } = useParties(orgId);
  const { rooms: lamRooms, data: lamData } = useLaminates(id);

  const [tab, setTab] = useState<TabKey>('overview');
  const [showSettings, setShowSettings] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
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
    const idx = TABS.findIndex((t) => t.key === key);
    if (idx >= 0) {
      isUserSwipe.current = false;
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, [syncTabBarToActive]);

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

  const startDate = project.startDate ? project.startDate.toDate() : null;
  const endDate = project.endDate ? project.endDate.toDate() : null;
  const initials = project.name.slice(0, 2).toUpperCase();
  const statusCfg = STATUS_LABELS[project.status] ?? STATUS_LABELS.active;

  return (
    <TabPagerProvider>
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

        <Pressable
          onPress={() => setShowSettings(true)}
          hitSlop={12}
          style={({ pressed }) => [styles.navIconBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Project settings"
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
        {TABS.map((item) => {
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
          pagerRef={pagerRef}
          renderTabPage={renderTabPage}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />
      </View>

      {/* ── Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSettings(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <View style={styles.sheetHeader}>
            <View style={styles.sheetThumb}>
              {project.photoUri ? (
                <Image source={{ uri: project.photoUri }} style={styles.sheetThumbImg} />
              ) : (
                <RNText style={styles.sheetThumbText}>{initials}</RNText>
              )}
            </View>
            <View style={styles.sheetHeaderText}>
              <RNText style={styles.sheetName} numberOfLines={2}>
                {project.name}
              </RNText>
              <RNText style={styles.sheetAddr} numberOfLines={1}>
                {project.siteAddress}
              </RNText>
            </View>
          </View>

          <View style={styles.sheetDivider} />

          <View style={styles.sheetRow}>
            <RNText style={styles.sheetLabel}>Status</RNText>
            <View style={[styles.sheetPill, { backgroundColor: statusCfg.bg }]}>
              <RNText style={[styles.sheetPillText, { color: statusCfg.fg }]}>
                {statusCfg.label}
              </RNText>
            </View>
          </View>

          <View style={styles.sheetRow}>
            <RNText style={styles.sheetLabel}>Value</RNText>
            <RNText style={styles.sheetValue}>{formatInr(project.value)}</RNText>
          </View>

          <View style={styles.sheetRow}>
            <RNText style={styles.sheetLabel}>Timeline</RNText>
            <RNText style={styles.sheetMeta}>
              {formatDateRange(startDate, endDate)}
            </RNText>
          </View>

          <View style={styles.sheetDivider} />

          <Pressable
            style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.6 }]}
          >
            <RNText style={[styles.sheetLabel, { color: color.danger, fontWeight: '600' }]}>
              Delete Project
            </RNText>
            <Ionicons name="trash-outline" size={18} color={color.danger} />
          </Pressable>

          <Pressable
            onPress={() => setShowSettings(false)}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <RNText style={styles.closeBtnText}>Close</RNText>
          </Pressable>
        </View>
      </Modal>
    </Screen>
    </TabPagerProvider>
  );
}

function TabPager({
  pagerRef,
  renderTabPage,
  onViewableItemsChanged,
  onScrollBeginDrag,
  onMomentumScrollEnd,
}: {
  pagerRef: React.RefObject<FlatList<Tab> | null>;
  renderTabPage: ({ item }: { item: Tab }) => React.ReactElement;
  onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  onScrollBeginDrag: () => void;
  onMomentumScrollEnd: () => void;
}) {
  const { swipeEnabled } = useTabPager();
  return (
    <FlatList
      ref={pagerRef}
      data={TABS}
      keyExtractor={(item) => item.key}
      renderItem={renderTabPage}
      horizontal
      pagingEnabled
      scrollEnabled={swipeEnabled}
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
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
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

  // ── Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalSheet: {
    backgroundColor: color.bgGrouped,
    paddingTop: 8,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sheetThumb: {
    width: 48,
    height: 48,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetThumbImg: {
    width: 48,
    height: 48,
  },
  sheetThumbText: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '500',
    color: color.textMuted,
    letterSpacing: 0.5,
  },
  sheetHeaderText: {
    flex: 1,
    gap: 2,
  },
  sheetName: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },
  sheetAddr: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
    marginVertical: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  sheetLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
  },
  sheetValue: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '600',
    color: color.primary,
    fontVariant: ['tabular-nums'],
  },
  sheetMeta: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
  },
  sheetPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  sheetPillText: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  closeBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.primary,
  },
});
