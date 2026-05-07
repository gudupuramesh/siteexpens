import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useTasks } from '@/src/features/tasks/useTasks';
import { useProjectTabRefreshKey } from '@/src/features/projects/ProjectTabRefreshContext';
import { useFirestoreRefresh } from '@/src/lib/useFirestoreRefresh';
import { DEFAULT_TASK_CATEGORIES, type Task } from '@/src/features/tasks/types';
import { useProject } from '@/src/features/projects/useProject';
import { TaskReportModal } from '@/src/features/projects/TaskReportModal';
import { Can } from '@/src/ui/Can';
import { Text } from '@/src/ui/Text';
import { TutorialEmptyState } from '@/src/ui/TutorialEmptyState';
import { color, screenInset, space } from '@/src/theme';

function getTaskDate(task: Task): Date | null {
  if (task.startDate) return task.startDate.toDate();
  if (task.endDate) return task.endDate.toDate();
  return null;
}

function getCategoryLabel(key: string | undefined): string {
  if (!key) return 'General';
  const fromDefault = DEFAULT_TASK_CATEGORIES.find((c) => c.key === key)?.label;
  if (fromDefault) return fromDefault;
  return key
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export function TaskTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const focusRefresh = useProjectTabRefreshKey();
  const { refreshing, refresh, refreshKey } = useFirestoreRefresh();
  const { data, loading } = useTasks(projectId, undefined, refreshKey + focusRefresh);
  const { data: project } = useProject(projectId);
  const [reportOpen, setReportOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...data].sort((a, b) => {
        const aDate = getTaskDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDate = getTaskDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      }),
    [data],
  );

  const completedCount = useMemo(
    () => sorted.filter((t) => t.status === 'completed').length,
    [sorted],
  );

  const renderItem = ({ item, index }: { item: Task; index: number }) => {
    const done = item.status === 'completed';
    const startDate = item.startDate ? item.startDate.toDate() : null;
    const endDate = item.endDate ? item.endDate.toDate() : null;
    const date = getTaskDate(item);
    const dateLabel = date
      ? date
          .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          .toUpperCase()
      : 'NO DATE';
    const startLabel = startDate
      ? startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Not set';
    const endLabel = endDate
      ? endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Not set';
    const progress = Math.max(0, Math.min(100, item.progress ?? 0));
    const hasNext = index < sorted.length - 1;
    const categoryLabel = getCategoryLabel(item.category);

    return (
      <Pressable
        onPress={() => router.push(`/(app)/projects/${projectId}/task/${item.id}` as never)}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
      >
        <View style={styles.leftRail}>
          <View style={[styles.dot, done && styles.dotDone]}>
            {done ? <Ionicons name="checkmark" size={10} color={color.onPrimary} /> : null}
          </View>
          {hasNext ? <View style={styles.railLine} /> : null}
        </View>

        <View style={[styles.content, done && styles.contentDone]}>
          <View style={styles.rowTop}>
            <Text variant="caption" color="textMuted" style={styles.dateText}>
              {dateLabel}
            </Text>
            <Ionicons name="create-outline" size={12} color={color.textFaint} />
          </View>

          <Text variant="bodyStrong" color="text" style={[styles.title, done && styles.titleDone]}>
            {item.title}
          </Text>

          <Text variant="meta" color="textMuted" numberOfLines={1} style={styles.metaLine}>
            Start: {startLabel} · End: {endLabel} · {progress}% complete
          </Text>
          <View style={styles.categoryPill}>
            <Text variant="caption" color="primary">
              {categoryLabel.toUpperCase()}
            </Text>
          </View>

          {!!item.description && (
            <Text variant="meta" color="textMuted" numberOfLines={2} style={styles.note}>
              {item.description}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text variant="caption" color="textMuted" style={styles.kicker}>
            PROJECT TIMELINE · {sorted.length} MILESTONES
          </Text>
          <Text variant="bodyStrong" color="text">
            {completedCount} done · {Math.max(0, sorted.length - completedCount)} upcoming
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setReportOpen(true)}
            disabled={sorted.length === 0}
            style={({ pressed }) => [
              styles.reportChip,
              sorted.length === 0 && { opacity: 0.4 },
              pressed && sorted.length > 0 && { opacity: 0.86 },
            ]}
          >
            <Ionicons name="document-text-outline" size={13} color={color.primary} />
            <Text variant="metaStrong" style={{ color: color.primary }}>
              Report
            </Text>
          </Pressable>
          <Can capability="task.write">
            <Pressable
              onPress={() => router.push(`/(app)/projects/${projectId}/add-task` as never)}
              style={({ pressed }) => [styles.addChip, pressed && { opacity: 0.86 }]}
            >
              <Ionicons name="add" size={13} color={color.onPrimary} />
              <Text variant="metaStrong" style={{ color: color.onPrimary }}>
                Add
              </Text>
            </Pressable>
          </Can>
        </View>
      </View>

      <TaskReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        project={project}
        tasks={sorted}
      />

      {loading && sorted.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : sorted.length === 0 ? (
        <TutorialEmptyState
          pageKey="tasks"
          fallback={
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={28} color={color.textFaint} />
              <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>No timeline entries</Text>
              <Text variant="meta" color="textMuted" align="center">
                Add a timeline item to track project progress.
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingHorizontal: screenInset,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  kicker: {
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportChip: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: color.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: screenInset,
    paddingBottom: 14,
  },
  leftRail: {
    alignItems: 'center',
    width: 20,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: color.border,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dotDone: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  railLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    backgroundColor: color.border,
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 2,
  },
  contentDone: {
    opacity: 0.62,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    letterSpacing: 0.35,
  },
  title: {
    marginTop: 2,
    lineHeight: 20,
  },
  titleDone: {
    textDecorationLine: 'line-through',
  },
  note: {
    marginTop: 2,
    lineHeight: 19,
  },
  metaLine: {
    marginTop: 3,
    lineHeight: 18,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    marginTop: 3,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },

  listContent: { paddingBottom: 28 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },
  emptyTitle: { marginTop: space.xxs },
});
