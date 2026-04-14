import { useState, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTasks } from '@/src/features/tasks/useTasks';
import type { Task } from '@/src/features/tasks/types';
import { formatDateRange } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { Separator } from '@/src/ui/Separator';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'not_started', label: 'Not Started' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
] as const;

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  not_started: { bg: color.dangerSoft, fg: color.danger },
  ongoing: { bg: color.warningSoft, fg: color.warning },
  completed: { bg: color.successSoft, fg: color.success },
};

export function TaskTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [statusFilter, setStatusFilter] = useState('');
  const { data, loading } = useTasks(projectId, statusFilter || undefined);

  const counts = useMemo(() => {
    const all = data;
    const notStarted = all.filter((t) => t.status === 'not_started').length;
    const ongoing = all.filter((t) => t.status === 'ongoing').length;
    const completed = all.filter((t) => t.status === 'completed').length;
    const progress = all.length > 0 ? Math.round((completed / all.length) * 100) : 0;
    return { notStarted, ongoing, completed, progress, total: all.length };
  }, [data]);

  const renderItem = ({ item }: { item: Task }) => {
    const startDate = item.startDate ? item.startDate.toDate() : null;
    const endDate = item.endDate ? item.endDate.toDate() : null;
    const cfg = STATUS_COLORS[item.status] ?? STATUS_COLORS.not_started;
    const progress = item.quantity > 0
      ? Math.round((item.completedQuantity / item.quantity) * 100)
      : 0;

    return (
      <View style={styles.taskRow}>
        <View style={styles.taskBody}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>{item.title}</Text>
          <Text variant="meta" color="textMuted" numberOfLines={1}>
            {formatDateRange(startDate, endDate)}
            {item.assignedTo ? ` · ${item.assignedTo}` : ''}
          </Text>
          {item.quantity > 0 && (
            <View style={styles.progressRow}>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text variant="caption" color="textMuted">
                {item.completedQuantity}/{item.quantity} {item.unit}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text variant="caption" style={{ color: cfg.fg }}>
            {item.status === 'not_started' ? 'New' : item.status === 'ongoing' ? 'Ongoing' : 'Done'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Summary row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text variant="title" color="danger">{counts.notStarted}</Text>
          <Text variant="caption" color="textMuted">Not Started</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text variant="title" color="warning">{counts.ongoing}</Text>
          <Text variant="caption" color="textMuted">Ongoing</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text variant="title" color="success">{counts.progress}%</Text>
          <Text variant="caption" color="textMuted">Progress</Text>
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setStatusFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text variant="caption" style={{ color: active ? '#fff' : color.text }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkbox-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>No tasks yet</Text>
          <Text variant="meta" color="textMuted" align="center">
            Create tasks to track work progress on this project.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(app)/projects/${projectId}/add-task` as never);
        }}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
        accessibilityLabel="Add task"
      >
        <Ionicons name="add" size={24} color={color.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    paddingVertical: space.sm,
    paddingHorizontal: screenInset,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  summaryCell: { flex: 1, alignItems: 'center', gap: 2 },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingVertical: space.xs,
    backgroundColor: color.surface,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  filterChip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
  },
  filterChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  taskBody: { flex: 1, minWidth: 0, gap: 4 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: 2,
  },
  progressBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.bgGrouped,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.primary,
  },
  statusBadge: {
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  listContent: { paddingBottom: 80 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },
  emptyTitle: { marginTop: space.xxs },
  fab: {
    position: 'absolute',
    right: screenInset,
    bottom: space.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
