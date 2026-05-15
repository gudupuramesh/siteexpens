/**
 * Org-wide tasks inbox — surfaces every open task across the active
 * org, no matter which project it belongs to. Mounted from the home
 * tab Summary card's "TASKS" cell tap.
 *
 * Scope: same role-based filter as `useOrgOpenTasks`:
 *   - SuperAdmin / Admin → everything
 *   - Manager / Accountant / Viewer / Site Engineer / Supervisor →
 *     only tasks in the projects they have access to
 *   - Client → empty list
 *
 * Each row shows: status dot · task title · project name · end date.
 * Tap a row → routes to the existing per-project task detail screen
 * (`/(app)/projects/[id]/task/[taskId]`).
 *
 * The screen is read-only — adding, editing, completing tasks still
 * happens on the project detail screen. This is the "where's the
 * fire?" inbox.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useProjects } from '@/src/features/projects/useProjects';
import { useOrgOpenTasks } from '@/src/features/tasks/useOrgOpenTasks';
import type { Task, TaskStatus } from '@/src/features/tasks/types';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

// ── Helpers ─────────────────────────────────────────────────────────

function formatDue(d: Date | null | undefined, todayMidnight: number): string {
  if (!d) return 'No due date';
  const ms = d.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round((ms - todayMidnight) / dayMs);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff <= 7) return `In ${diff}d`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const STATUS_TONE: Record<TaskStatus, string> = {
  not_started: '#94A3B8', // neutral grey-blue
  ongoing: '#0A84FF',
  completed: '#34C759',
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  ongoing: 'In progress',
  completed: 'Done',
};

// ── Screen ──────────────────────────────────────────────────────────

export default function OrgTasksScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;

  const { tasks, loading } = useOrgOpenTasks(orgId);
  const { data: projects } = useProjects();

  // Build a lookup: projectId → name. Fall back to the id when the
  // project doc isn't visible to the current user (very edge — role
  // permits the task but not the project membership).
  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const todayMidnight = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — back / title / count */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: t.colors.separator,
            borderBottomWidth: t.hairline,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.headerSideBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={t.colors.label} />
        </Pressable>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text
            variant="headline"
            color="label"
            style={{ fontWeight: '700' }}
            numberOfLines={1}
          >
            Tasks
          </Text>
          <Text variant="caption2" color="secondary" numberOfLines={1}>
            {loading
              ? 'Loading…'
              : tasks.length === 0
                ? 'All clear'
                : `${tasks.length} open`}
          </Text>
        </View>

        <View style={styles.headerSideBtn} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      ) : tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 24,
            gap: 8,
          }}
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              projectName={projectName.get(item.projectId) ?? item.projectId}
              todayMidnight={todayMidnight}
            />
          )}
        />
      )}
    </View>
  );
}

// ── Row ────────────────────────────────────────────────────────────

function TaskRow({
  task,
  projectName,
  todayMidnight,
}: {
  task: Task;
  projectName: string;
  todayMidnight: number;
}) {
  const t = useThemeV2();
  const due = task.endDate?.toDate?.() ?? null;
  const dueText = formatDue(due, todayMidnight);
  const isOverdue =
    due != null && due.getTime() < todayMidnight && task.status !== 'completed';
  const tone = STATUS_TONE[task.status];

  return (
    <Pressable
      onPress={() =>
        router.push(
          `/(app)/projects/${task.projectId}/task/${task.id}` as never,
        )
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${projectName}, ${STATUS_LABEL[task.status]}, ${dueText}`}
    >
      <View style={[styles.statusDot, { backgroundColor: tone }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="callout"
          color="label"
          style={{ fontWeight: '600' }}
          numberOfLines={1}
        >
          {task.title || 'Untitled task'}
        </Text>
        <Text
          variant="caption1"
          color="secondary"
          style={{ marginTop: 2 }}
          numberOfLines={1}
        >
          {projectName}
          {task.assignedToName ? `  ·  ${task.assignedToName}` : ''}
        </Text>
      </View>
      <Text
        variant="caption1"
        style={{
          color: isOverdue ? t.palette.red.base : t.colors.secondary,
          fontWeight: '600',
        }}
        numberOfLines={1}
      >
        {dueText}
      </Text>
    </Pressable>
  );
}

// ── Empty ──────────────────────────────────────────────────────────

function EmptyState() {
  const t = useThemeV2();
  return (
    <View style={styles.emptyWrap}>
      <View
        style={[
          styles.emptyTile,
          {
            backgroundColor:
              t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Ionicons
          name="checkmark-done-outline"
          size={28}
          color={t.palette.green.base}
        />
      </View>
      <Text
        variant="title3"
        color="label"
        style={{ marginTop: 14, fontWeight: '700' }}
      >
        No open tasks
      </Text>
      <Text
        variant="caption1"
        color="secondary"
        style={{ marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }}
      >
        New tasks created in any project will show up here.
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  headerSideBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
  },
  emptyTile: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
