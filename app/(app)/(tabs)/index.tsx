/**
 * Projects tab — InteriorOS visual port, wired to live Firestore data.
 *
 * Visual reference: `interior os/src/screens-projects.jsx::ProjectsScreen`.
 *
 * Layout:
 *   1. Eyebrow "{N} PROJECTS · {M} ACTIVE" + large "Projects" title
 *      + inline 36×36 square accent "+" button
 *   2. Hairline-bordered search field
 *   3. InteriorOS chip filters (All / Active / On Hold / Completed)
 *   4. Stack of hairline-bordered project cards (ProjectRow)
 *
 * Data: useProjects() — live Firestore subscription scoped to org.
 * Tapping a row routes to /(app)/projects/{id}.
 */
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useProjects } from '@/src/features/projects/useProjects';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import {
  PROJECT_TYPOLOGIES,
  type Project,
  type ProjectStatus,
} from '@/src/features/projects/types';
import { ProjectRow, type ProjectRowStatus } from '@/src/ui/ProjectRow';
import { PageEnter } from '@/src/ui/PageEnter';
import { Screen } from '@/src/ui/Screen';
import { Spinner } from '@/src/ui/Spinner';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, space } from '@/src/theme/tokens';

type FilterKey = 'all' | ProjectStatus;

function getAreaFromSiteAddress(siteAddress?: string): string | undefined {
  if (!siteAddress) return undefined;
  const firstChunk = siteAddress.split(',')[0]?.trim();
  return firstChunk || undefined;
}

/** Map our internal status keys to the prototype's display labels. */
const STATUS_DISPLAY: Record<ProjectStatus, ProjectRowStatus> = {
  active:    'Active',
  on_hold:   'On Hold',
  completed: 'Completed',
  archived:  'Completed', // closest visual equivalent
};

export default function ProjectsTabScreen() {
  const { data: projects, loading } = useProjects();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { totalsByProject } = useProjectTotals(orgId);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: projects.length,
      active: 0,
      on_hold: 0,
      completed: 0,
      archived: 0,
    };
    for (const p of projects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [projects]);

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all',       label: 'All',       count: counts.all },
    { key: 'active',    label: 'Active',    count: counts.active },
    { key: 'on_hold',   label: 'On Hold',   count: counts.on_hold },
    { key: 'completed', label: 'Completed', count: counts.completed },
  ];

  const filtered = useMemo(() => {
    let list: Project[] =
      filter === 'all' ? projects : projects.filter((p) => p.status === filter);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.siteAddress.toLowerCase().includes(q),
      );
    }
    return list;
  }, [projects, filter, query]);

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(app)/projects/new');
  };

  const eyebrow = `${projects.length} PROJECT${projects.length === 1 ? '' : 'S'} · ${counts.active} ACTIVE`;

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — eyebrow + title + bell + square + button */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>Projects</Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/notifications' as never)}
          style={({ pressed }) => [styles.bellBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={20} color={color.text} />
        </Pressable>
        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="New project"
        >
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={16} color={color.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or address"
            placeholderTextColor={color.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close" size={14} color={color.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={active ? [styles.chipLabel, styles.chipLabelActive] : styles.chipLabel}>
                {f.label}
              </Text>
              <Text style={active ? [styles.chipCount, styles.chipCountActive] : styles.chipCount}>
                {f.count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* List */}
      {loading && projects.length === 0 ? (
        <PageEnter viewKey="loading">
          <View style={styles.empty}>
            <Spinner size={28} />
            <Text variant="meta" color="textMuted" style={{ marginTop: space.sm }}>
              Loading projects…
            </Text>
          </View>
        </PageEnter>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={28} color={color.textFaint} />
          <Text variant="body" color="textMuted" align="center" style={styles.emptyText}>
            {query
              ? 'No matches.'
              : filter === 'all'
              ? 'No projects yet.'
              : `No ${filters.find((f) => f.key === filter)?.label.toLowerCase()} projects.`}
          </Text>
          {!query && filter === 'all' ? (
            <Pressable onPress={handleAdd}>
              <Text variant="metaStrong" color="primary">
                Create your first project
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => {
            const typologyLabel = item.typology
              ? PROJECT_TYPOLOGIES.find((t) => t.key === item.typology)?.label
              : undefined;
            const typeLine =
              typologyLabel && item.subType
                ? `${typologyLabel} — ${item.subType}`
                : typologyLabel ?? item.subType ?? undefined;
            const area = getAreaFromSiteAddress(item.siteAddress);
            const locationLine = [area, item.location].filter(Boolean).join(' · ') || item.siteAddress;
            const totals = totalsByProject.get(item.id);
            return (
              <ProjectRow
                name={item.name}
                client={item.client}
                location={locationLine}
                type={typeLine}
                budget={item.value ?? 0}
                totalIn={totals?.income}
                totalOut={totals?.expense}
                progress={item.progress}
                status={STATUS_DISPLAY[item.status]}
                startDate={item.startDate ? item.startDate.toDate() : null}
                endDate={item.endDate ? item.endDate.toDate() : null}
                photoUri={item.photoUri ?? undefined}
                onPress={() => router.push(`/(app)/projects/${item.id}` as never)}
              />
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.cardGap} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 12,
    backgroundColor: color.bgGrouped,
    gap: 8,
  },
  headerLeft: {
    flex: 1,
  },
  eyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textFaint,
    letterSpacing: 1.8,
  },
  title: {
    fontFamily: fontFamily.sans,
    fontSize: 26,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.6,
    marginTop: 2,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
  },
  addBtn: {
    width: 36,
    height: 36,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: color.bgGrouped,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    paddingHorizontal: 12,
    gap: 8,
    borderRadius: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: color.text,
    paddingVertical: 0,
    fontFamily: fontFamily.sans,
  },

  // Chips
  chipsScroll: {
    flexGrow: 0,
    backgroundColor: color.bgGrouped,
  },
  chipsContent: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 6,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: color.separator,
    backgroundColor: color.bg,
  },
  chipActive: {
    borderColor: color.primary,
    backgroundColor: color.primary,
  },
  chipLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '500',
    color: color.text,
    letterSpacing: -0.1,
  },
  chipLabelActive: {
    color: '#fff',
  },
  chipCount: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.text,
    opacity: 0.55,
    fontVariant: ['tabular-nums'],
  },
  chipCountActive: {
    color: '#fff',
    opacity: 0.85,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  cardGap: {
    height: 10,
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: space.xs,
  },
  emptyText: {
    marginTop: space.xxs,
  },
});
