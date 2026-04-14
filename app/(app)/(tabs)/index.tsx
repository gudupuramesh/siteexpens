/**
 * Projects tab — dense, native-feel dashboard.
 *
 * Layout (top to bottom, compact):
 *   1. Compact header: org eyebrow + "Projects" title + avatar
 *   2. Inline stat pills (no card wrapper)
 *   3. Filter chips (horizontal scroll)
 *   4. Dense FlatList of ProjectRows (dominates screen)
 *   5. FAB (bottom-right)
 */
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useProjects } from '@/src/features/projects/useProjects';
import type { Project, ProjectStatus } from '@/src/features/projects/types';
import { ProjectRow } from '@/src/ui/ProjectRow';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';
import { formatInr } from '@/src/lib/format';

type FilterKey = 'all' | ProjectStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
];

function StatPill({ label, tone }: { label: string; tone: 'info' | 'neutral' | 'warning' }) {
  const bg = tone === 'info' ? color.infoSoft : tone === 'warning' ? color.warningSoft : color.surfaceAlt;
  const fg = tone === 'info' ? color.info : tone === 'warning' ? color.warning : color.textMuted;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text variant="caption" style={{ color: fg }}>{label}</Text>
    </View>
  );
}

export default function ProjectsTabScreen() {
  const insets = useSafeAreaInsets();
  const { data: org } = useCurrentOrganization();
  const { data: projects, loading } = useProjects();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [refreshing, setRefreshing] = useState(false);

  const companyInitial = (org?.name ?? '?').charAt(0).toUpperCase();

  // Stats
  const activeCount = useMemo(() => projects.filter(p => p.status === 'active').length, [projects]);
  const totalValue = useMemo(() => projects.reduce((s, p) => s + (p.value || 0), 0), [projects]);
  const pendingCount = useMemo(() => projects.filter(p => p.status === 'on_hold').length, [projects]);

  // Filtered list
  const filtered = useMemo(
    () => filter === 'all' ? projects : projects.filter(p => p.status === filter),
    [projects, filter],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // The real-time listener auto-updates, but we simulate pull feedback
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handleFabPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(app)/projects/new');
  }, []);

  const renderItem = useCallback(({ item }: { item: Project }) => (
    <ProjectRow
      name={item.name}
      siteAddress={item.siteAddress}
      startDate={item.startDate ? item.startDate.toDate() : null}
      endDate={item.endDate ? item.endDate.toDate() : null}
      value={item.value}
      photoUri={item.photoUri}
      status={item.status}
      onPress={() => router.push(`/(app)/projects/${item.id}` as never)}
    />
  ), []);

  const keyExtractor = useCallback((p: Project) => p.id, []);

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  // Format total value in crore/lakh shorthand
  const totalLabel = totalValue >= 10000000
    ? `₹${(totalValue / 10000000).toFixed(1)} Cr`
    : formatInr(totalValue);

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — matches LargeHeader spacing from Parties tab */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text variant="caption" color="textMuted">
            {(org?.name ?? 'Your firm').toUpperCase()}
          </Text>
          <Text variant="largeTitle" color="text">Projects</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/profile')}
          style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
        >
          <Text variant="metaStrong" color="onPrimary">{companyInitial}</Text>
        </Pressable>
      </View>

      {/* Stat Pills */}
      <View style={styles.statsRow}>
        <StatPill label={`${activeCount} Active`} tone="info" />
        <StatPill label={`Total: ${totalLabel}`} tone="neutral" />
        {pendingCount > 0 && <StatPill label={`${pendingCount} Pending`} tone="warning" />}
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContent}
        style={styles.filtersScroll}
      >
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text
                variant="caption"
                style={{ color: active ? color.onPrimary : color.textMuted }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Project List */}
      <View style={styles.listArea}>
        {loading && projects.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text variant="meta" color="textMuted">Loading projects…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="folder-open-outline" size={32} color={color.textFaint} />
            <Text variant="body" color="textMuted" align="center" style={styles.emptyText}>
              {filter === 'all' ? 'No projects yet' : `No ${FILTERS.find(f => f.key === filter)?.label.toLowerCase()} projects`}
            </Text>
            {filter === 'all' && (
              <Pressable onPress={() => router.push('/(app)/projects/new')}>
                <Text variant="metaStrong" color="primary">Create your first project</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ItemSeparatorComponent={ItemSeparator}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={color.primary}
                colors={[color.primary]}
              />
            }
          />
        )}
      </View>

      {/* FAB */}
      <Pressable
        onPress={handleFabPress}
        style={({ pressed }) => [
          styles.fab,
          { bottom: 24 + insets.bottom },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="New project"
      >
        <Ionicons name="add" size={26} color={color.onPrimary} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Header — matches LargeHeader spacing
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stat pills
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    gap: space.xs,
    backgroundColor: color.surface,
  },
  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },

  // Filter chips
  filtersScroll: {
    flexGrow: 0,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  filtersContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: space.sm,
    gap: space.xs,
  },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    alignSelf: 'flex-start',
  },
  chipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },

  // List
  listArea: {
    flex: 1,
    backgroundColor: color.bgGrouped,
  },
  listContent: {
    paddingBottom: 80,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
    marginLeft: screenInset + 48 + space.sm, // indent past thumbnail
  },

  // Empty
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
    gap: space.xs,
  },
  emptyText: {
    marginTop: space.xxs,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: screenInset,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
