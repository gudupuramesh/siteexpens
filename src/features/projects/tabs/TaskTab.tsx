/**
 * Timeline (Task) tab — v2 design.
 *
 * Layout:
 *   1. Header — kicker + summary line + Report / Add chips
 *   2. Vertical timeline list — milestone rows with rail dots and progress
 *   3. Empty state when there are no tasks
 *
 * Each row is a v2 surface card with:
 *   - Left rail: dot (filled when complete) + connecting line
 *   - Date + edit affordance row
 *   - Title (strikethrough when completed)
 *   - Meta line (start · end · % complete)
 *   - Category pill
 *   - Optional description preview
 *   - Progress sliver
 */
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

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

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
  const t = useThemeV2();
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
    () => sorted.filter((tt) => tt.status === 'completed').length,
    [sorted],
  );

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

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
      <View style={styles.row}>
        <View style={styles.leftRail}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: done ? t.palette.green.base : t.colors.surface,
                borderColor: done ? t.palette.green.base : t.colors.tertiary,
              },
            ]}
          >
            {done ? <Ionicons name="checkmark" size={10} color="#fff" /> : null}
          </View>
          {hasNext ? (
            <View
              style={[
                styles.railLine,
                { backgroundColor: t.colors.separator },
              ]}
            />
          ) : null}
        </View>

        <Pressable
          onPress={() => router.push(`/(app)/projects/${projectId}/task/${item.id}` as never)}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.card,
              borderColor: cardBorder,
              borderWidth: t.hairline,
              opacity: done ? 0.7 : 1,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.cardTop}>
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5 }}
            >
              {dateLabel}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={13}
              color={t.colors.tertiary}
            />
          </View>

          <Text
            variant="callout"
            color="label"
            style={[
              styles.title,
              {
                fontWeight: '700',
                textDecorationLine: done ? 'line-through' : 'none',
              },
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          <Text
            variant="caption1"
            color="secondary"
            numberOfLines={1}
            style={{ marginTop: 4 }}
          >
            {`Start: ${startLabel} · End: ${endLabel}`}
          </Text>

          <View style={styles.pillRow}>
            <View
              style={[
                styles.categoryPill,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                  borderRadius: 999,
                },
              ]}
            >
              <Text
                variant="caption2"
                style={{
                  color: t.palette.blue.base,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                }}
              >
                {categoryLabel.toUpperCase()}
              </Text>
            </View>
            <Text
              variant="caption2"
              color="secondary"
              style={{ fontWeight: '700', marginLeft: 'auto', fontVariant: ['tabular-nums'] }}
            >
              {progress}%
            </Text>
          </View>

          <View
            style={[
              styles.progressTrack,
              { backgroundColor: t.colors.fill3 },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress}%`,
                  backgroundColor: done
                    ? t.palette.green.base
                    : t.palette.blue.base,
                },
              ]}
            />
          </View>

          {item.description ? (
            <Text
              variant="caption1"
              color="secondary"
              numberOfLines={2}
              style={{ marginTop: 8, lineHeight: 17 }}
            >
              {item.description}
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="caption2"
            color="tertiary"
            style={{ letterSpacing: 0.5 }}
          >
            {`PROJECT TIMELINE · ${sorted.length} MILESTONES`}
          </Text>
          <Text
            variant="callout"
            color="label"
            style={{ fontWeight: '700', marginTop: 2 }}
          >
            {completedCount} done · {Math.max(0, sorted.length - completedCount)} upcoming
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setReportOpen(true)}
            disabled={sorted.length === 0}
            hitSlop={6}
            style={({ pressed }) => [
              styles.reportChip,
              {
                backgroundColor: t.colors.surface,
                borderRadius: 999,
                borderColor: t.palette.blue.base + '40',
                borderWidth: t.hairline,
              },
              sorted.length === 0 && { opacity: 0.4 },
              pressed && sorted.length > 0 && { opacity: 0.86 },
            ]}
          >
            <Ionicons
              name="document-text-outline"
              size={13}
              color={t.palette.blue.base}
            />
            <Text
              variant="caption2"
              style={{
                color: t.palette.blue.base,
                fontWeight: '700',
                marginLeft: 4,
                letterSpacing: 0.3,
              }}
            >
              REPORT
            </Text>
          </Pressable>
          <Can capability="task.write">
            <Pressable
              onPress={() => router.push(`/(app)/projects/${projectId}/add-task` as never)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.addChip,
                {
                  backgroundColor: t.palette.blue.base,
                  borderRadius: 999,
                },
                pressed && { opacity: 0.86 },
              ]}
            >
              <Ionicons name="add" size={14} color="#fff" />
              <Text
                variant="caption2"
                style={{
                  color: '#fff',
                  fontWeight: '700',
                  marginLeft: 4,
                  letterSpacing: 0.3,
                }}
              >
                ADD
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
          <Text variant="footnote" color="secondary">Loading…</Text>
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={32} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
            No timeline entries
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
          >
            Add a milestone to track project progress.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={t.palette.blue.base}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // Timeline row
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  leftRail: {
    alignItems: 'center',
    width: 20,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  railLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },

  // Card
  card: {
    flex: 1,
    padding: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  categoryPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  listContent: { paddingBottom: 28 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});
