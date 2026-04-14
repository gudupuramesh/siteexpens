/**
 * Project detail screen — tabs-first layout.
 *
 * Structure:
 *   1. Compact nav bar (back + project name + settings kebab)
 *   2. ScrollableTabBar (Party, Transaction, Attendance, Material, Design)
 *   3. Tab content fills remaining screen
 *   4. Settings modal (project info, status, delete) via kebab menu
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
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
import { ScrollableTabBar, type TabItem } from '@/src/ui/ScrollableTabBar';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

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

type TabKey = 'party' | 'transaction' | 'site' | 'task' | 'attendance' | 'material' | 'mom' | 'laminate' | 'design' | 'files';

const TABS: TabItem<TabKey>[] = [
  { key: 'party',       label: 'Party' },
  { key: 'transaction', label: 'Transaction' },
  { key: 'site',        label: 'Site' },
  { key: 'task',        label: 'Task' },
  { key: 'attendance',  label: 'Attendance' },
  { key: 'material',    label: 'Material' },
  { key: 'mom',         label: 'MOM' },
  { key: 'laminate',    label: 'Laminate' },
  { key: 'design',      label: 'Design' },
  { key: 'files',       label: 'Files' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:    { label: 'Active',    color: color.success },
  on_hold:   { label: 'On Hold',   color: color.warning },
  completed: { label: 'Completed', color: color.textMuted },
  archived:  { label: 'Archived',  color: color.textFaint },
};

function TabContent({ tab }: { tab: TabKey }) {
  switch (tab) {
    case 'party': return <PartyTab />;
    case 'transaction': return <TransactionTab />;
    case 'site': return <SiteTab />;
    case 'task': return <TaskTab />;
    case 'attendance': return <AttendanceTab />;
    case 'material': return <MaterialTab />;
    case 'mom': return <MOMTab />;
    case 'laminate': return <LaminateTab />;
    case 'design': return <DesignTab />;
    case 'files': return <FilesTab />;
  }
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading, error } = useProject(id);
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: parties } = useParties(orgId);
  const { rooms: lamRooms, data: lamData } = useLaminates(id);
  const [tab, setTab] = useState<TabKey>('transaction');
  const [showSettings, setShowSettings] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const pagerRef = useRef<FlatList>(null);
  const isUserSwipe = useRef(true);

  const handleTabChange = useCallback((key: TabKey) => {
    setTab(key);
    const idx = TABS.findIndex((t) => t.key === key);
    if (idx >= 0) {
      isUserSwipe.current = false;
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  }, []);

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

  const renderTabPage = useCallback(({ item }: { item: TabItem<TabKey> }) => (
    <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
      <TabContent tab={item.key} />
    </View>
  ), []);

  if (loading) {
    return (
      <Screen bg="grouped">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      </Screen>
    );
  }

  if (!project) {
    return (
      <Screen bg="grouped">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <Text variant="body" color="textMuted" align="center">
            {error ? `Couldn't load project:\n${error}` : 'Project not found.'}
          </Text>
        </View>
      </Screen>
    );
  }

  const startDate = project.startDate ? project.startDate.toDate() : null;
  const endDate = project.endDate ? project.endDate.toDate() : null;
  const initial = project.name.charAt(0).toUpperCase();
  const statusCfg = STATUS_LABELS[project.status] ?? STATUS_LABELS.active;

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav bar */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle} numberOfLines={1}>
          {project.name}
        </Text>
        {tab === 'laminate' && lamData.length > 0 && (
          <Pressable
            onPress={handleGeneratePdf}
            disabled={generatingPdf}
            hitSlop={12}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }, generatingPdf && { opacity: 0.4 }]}
            accessibilityLabel="Generate laminate PDF"
          >
            <Ionicons name="document-text-outline" size={20} color={color.primary} />
          </Pressable>
        )}
        <Pressable
          onPress={() => setShowSettings(true)}
          hitSlop={12}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Project settings"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={color.text} />
        </Pressable>
      </View>

      {/* Tab bar */}
      <ScrollableTabBar tabs={TABS} value={tab} onChange={handleTabChange} />

      {/* Swipeable tab content */}
      <View style={styles.tabContent}>
        <FlatList
          ref={pagerRef}
          data={TABS}
          keyExtractor={(item) => item.key}
          renderItem={renderTabPage}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          initialScrollIndex={TABS.findIndex((t) => t.key === 'transaction')}
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

      {/* Settings Modal */}
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
          {/* Handle */}
          <View style={styles.modalHandle} />

          {/* Project header */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetThumb}>
              {project.photoUri ? (
                <Image source={{ uri: project.photoUri }} style={styles.sheetThumbImg} />
              ) : (
                <View style={styles.sheetThumbPlaceholder}>
                  <Text variant="bodyStrong" color="primary">{initial}</Text>
                </View>
              )}
            </View>
            <View style={styles.sheetHeaderText}>
              <Text variant="bodyStrong" color="text" numberOfLines={2}>{project.name}</Text>
              <Text variant="meta" color="textMuted" numberOfLines={1}>{project.siteAddress}</Text>
            </View>
          </View>

          <View style={styles.sheetDivider} />

          {/* Info rows */}
          <View style={styles.sheetRow}>
            <Text variant="meta" color="textMuted">Status</Text>
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
              <Text variant="metaStrong" style={{ color: statusCfg.color }}>{statusCfg.label}</Text>
            </View>
          </View>

          <View style={styles.sheetRow}>
            <Text variant="meta" color="textMuted">Value</Text>
            <Text variant="metaStrong" color="primary" tabular>{formatInr(project.value)}</Text>
          </View>

          <View style={styles.sheetRow}>
            <Text variant="meta" color="textMuted">Timeline</Text>
            <Text variant="metaStrong" color="text">{formatDateRange(startDate, endDate)}</Text>
          </View>

          <View style={styles.sheetDivider} />

          {/* Delete */}
          <Pressable
            style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.6 }]}
          >
            <Text variant="metaStrong" color="danger">Delete Project</Text>
            <Ionicons name="trash-outline" size={18} color={color.danger} />
          </Pressable>

          {/* Close */}
          <Pressable
            onPress={() => setShowSettings(false)}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <Text variant="bodyStrong" color="primary">Close</Text>
          </Pressable>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
  },

  // Nav
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: space.xxs,
    backgroundColor: color.surface,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: space.xs,
  },

  // Tab content
  tabContent: {
    flex: 1,
    backgroundColor: color.bgGrouped,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    paddingHorizontal: screenInset,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: space.md,
  },

  // Sheet content
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
  },
  sheetThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.xs,
    overflow: 'hidden',
  },
  sheetThumbImg: {
    width: 48,
    height: 48,
  },
  sheetThumbPlaceholder: {
    flex: 1,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeaderText: {
    flex: 1,
    gap: 2,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
    marginVertical: space.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: space.md,
    marginTop: space.xs,
  },
});
