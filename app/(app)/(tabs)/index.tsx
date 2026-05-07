/**
 * Projects tab — dashboard stats, search + filter, reference-style project cards.
 */
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useOrgMaterialRequests } from '@/src/features/materialRequests/useOrgMaterialRequests';
import { ProjectListFilterSheet } from '@/src/features/projects/ProjectListFilterSheet';
import { ProjectsSlimStatCards } from '@/src/features/projects/ProjectsSlimStatCards';
import {
  type Project,
  type ProjectStatus,
} from '@/src/features/projects/types';
import { useProjects } from '@/src/features/projects/useProjects';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useOrgOpenTaskCount } from '@/src/features/tasks/useOrgOpenTaskCount';
import { isTransactionCountedInTotals } from '@/src/features/transactions/types';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import { KeyboardAvoidingShell } from '@/src/ui/KeyboardFormLayout';
import { OrgSwitcherChip } from '@/src/ui/OrgSwitcherChip';
import { PageEnter } from '@/src/ui/PageEnter';
import { BlueprintLoader } from '@/src/ui/loaders';
import {
  ProjectRowSheet,
  type ProjectRowSheetStatus,
} from '@/src/ui/ProjectRowSheet';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TutorialEmptyState } from '@/src/ui/TutorialEmptyState';
import { color, fontFamily, space } from '@/src/theme/tokens';

function getAreaFromSiteAddress(siteAddress?: string): string | undefined {
  if (!siteAddress) return undefined;
  const firstChunk = siteAddress.split(',')[0]?.trim();
  return firstChunk || undefined;
}

const STATUS_DISPLAY: Record<ProjectStatus, ProjectRowSheetStatus> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Completed',
};

export default function ProjectsTabScreen() {
  const { data: projects, loading } = useProjects();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { totalsByProject, transactions, loading: totalsLoading } = useProjectTotals(orgId);
  const { can, role } = usePermissions();
  const canCreateProject = can('project.create');

  const { data: materialRequests, loading: materialsLoading } = useOrgMaterialRequests(orgId);
  const { openCount, loading: tasksLoading } = useOrgOpenTaskCount(orgId);

  const approvedTxnCount = useMemo(
    () => transactions.filter((t) => isTransactionCountedInTotals(t)).length,
    [transactions],
  );
  const pendingMaterialCount = useMemo(
    () => materialRequests.filter((r) => r.status === 'pending').length,
    [materialRequests],
  );

  const statsLoading = totalsLoading || materialsLoading || tasksLoading;

  const canSeeProjectFinance =
    role === 'superAdmin'
    || role === 'admin'
    || role === 'manager'
    || role === 'accountant'
    || role === 'viewer'
    || role === 'siteEngineer';

  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | null>(null);

  const hasActiveFilters = filterDate !== null || filterStatus !== null;

  const filtered = useMemo(() => {
    let list: Project[] = projects;

    if (filterStatus) list = list.filter((p) => p.status === filterStatus);

    if (filterDate) {
      const fd = filterDate.getTime();
      list = list.filter((p) => {
        if (!p.endDate) return false;
        const end = p.endDate.toDate();
        end.setHours(0, 0, 0, 0);
        return end.getTime() <= fd;
      });
    }

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q)
          || p.siteAddress.toLowerCase().includes(q),
      );
    }
    return list;
  }, [projects, query, filterStatus, filterDate]);

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(app)/projects/new');
  };

  const clearFilters = useCallback(() => {
    setFilterDate(null);
    setFilterStatus(null);
  }, []);

  return (
    <Screen padded={false} style={{ backgroundColor: color.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingShell headerInset={0}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Projects</Text>
          <View style={styles.headerRight}>
            <OrgSwitcherChip />
            <Pressable
              onPress={() => router.push('/(app)/notifications' as never)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={18} color={color.text} />
            </Pressable>
            {canCreateProject ? (
              <Pressable
                onPress={handleAdd}
                style={({ pressed }) => [
                  styles.addBtn,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityLabel="New project"
              >
                <Ionicons name="add" size={18} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ProjectsSlimStatCards
          approvedTxnCount={approvedTxnCount}
          pendingMaterialCount={pendingMaterialCount}
          openTaskCount={openCount}
          loading={statsLoading}
        />

        {role === 'client' ? (
          <Text variant="meta" color="textMuted" style={styles.roleHint}>
            Transaction, material, and task counts reflect your org role. Clients do not see finance totals on project cards.
          </Text>
        ) : null}

        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Ionicons name="search" size={15} color={color.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search projects…"
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
          <Pressable
            onPress={() => setFilterOpen(true)}
            style={({ pressed }) => [
              styles.filterBtn,
              hasActiveFilters && styles.filterBtnActive,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Filter projects"
          >
            <Ionicons
              name="options-outline"
              size={16}
              color={hasActiveFilters ? '#fff' : color.text}
            />
            <Text
              style={hasActiveFilters ? [styles.filterBtnLabel, { color: '#fff' }] : styles.filterBtnLabel}
              numberOfLines={1}
            >
              Filter
            </Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, minHeight: 0 }}>
          {loading && projects.length === 0 ? (
            <PageEnter viewKey="loading">
              <View style={styles.empty}>
                <BlueprintLoader size={56} />
                <Text variant="meta" color="textMuted" style={{ marginTop: space.sm }}>
                  Loading projects…
                </Text>
              </View>
            </PageEnter>
          ) : filtered.length === 0 ? (
            <TutorialEmptyState
              pageKey="projects"
              fallback={
                <View style={styles.empty}>
                  <Ionicons name="folder-open-outline" size={28} color={color.textFaint} />
                  <Text variant="body" color="textMuted" align="center" style={styles.emptyText}>
                    {query || hasActiveFilters ? 'No matching projects.' : 'No projects yet.'}
                  </Text>
                  {!query && !hasActiveFilters && canCreateProject ? (
                    <Pressable onPress={handleAdd}>
                      <Text variant="metaStrong" color="primary">
                        Create your first project
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              }
            />
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={filtered}
              keyExtractor={(p) => p.id}
              renderItem={({ item, index }) => {
                const totals = canSeeProjectFinance ? totalsByProject.get(item.id) : undefined;
                const area = getAreaFromSiteAddress(item.siteAddress);
                const subtitleParts = [area, item.subType].filter(Boolean);
                return (
                  <ProjectRowSheet
                    index={index + 1}
                    name={item.name}
                    photoUri={item.photoUri}
                    subtitle={subtitleParts.length ? subtitleParts.join(' • ') : undefined}
                    budget={item.value ?? 0}
                    totalIn={totals?.income}
                    totalOut={totals?.expense}
                    progress={item.progress}
                    status={STATUS_DISPLAY[item.status]}
                    startDate={item.startDate ? item.startDate.toDate() : null}
                    endDate={item.endDate ? item.endDate.toDate() : null}
                    variant="reference"
                    onPress={() => router.push(`/(app)/projects/${item.id}` as never)}
                    onStatusPress={() => router.push(`/(app)/projects/${item.id}/overview` as never)}
                  />
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.cardGap} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          )}
        </View>
      </KeyboardAvoidingShell>

      <ProjectListFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filterStatus={filterStatus}
        onStatusChange={setFilterStatus}
        filterDate={filterDate}
        onDateChange={setFilterDate}
        onClear={clearFilters}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: color.bg,
  },
  headerTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleHint: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: color.bg,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: color.text,
    paddingVertical: 0,
    fontFamily: fontFamily.sans,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: color.bg,
  },
  filterBtnActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  filterBtnLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 30,
  },
  cardGap: {
    height: 8,
  },
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
