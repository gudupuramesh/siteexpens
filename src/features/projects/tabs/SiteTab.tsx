import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useAttendance } from '@/src/features/attendance/useAttendance';
import {
  getCategoryLabel,
  parseDayBounds,
  previousProgressForUpdate,
  startOfLocalDay,
  taskOverlapsSelectedDay,
  taskStatusPill,
  toLocalDateKey,
} from '@/src/features/dpr/dprDay';
import { useDpr } from '@/src/features/dpr/useDpr';
import { useMaterialRequests } from '@/src/features/materialRequests/useMaterialRequests';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useProjectTabRefreshKey } from '@/src/features/projects/ProjectTabRefreshContext';
import type { Task } from '@/src/features/tasks/types';
import { useProjectTaskUpdatesForDate } from '@/src/features/tasks/useProjectTaskUpdatesForDate';
import { useTasks } from '@/src/features/tasks/useTasks';
import { formatDate, formatInr } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

export function SiteTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const focusRefresh = useProjectTabRefreshKey();
  const [date, setDate] = useState(() => new Date());
  const dateStr = toLocalDateKey(date);

  const { summary: attSummary } = useAttendance(projectId, dateStr, orgId || undefined);
  const { data: dpr } = useDpr(projectId, dateStr);
  const { data: materialRequests, loading: matLoading } = useMaterialRequests(
    projectId,
    undefined,
    focusRefresh,
  );
  const { data: tasks, loading: tasksLoading } = useTasks(projectId, undefined, focusRefresh);

  const taskRefs = useMemo(
    () => tasks.map((t) => ({ id: t.id, title: t.title })),
    [tasks],
  );

  const { data: dayUpdates, loading: updatesLoading } = useProjectTaskUpdatesForDate(
    projectId,
    dateStr,
    taskRefs,
    focusRefresh,
  );

  const calendarTodayStart = startOfLocalDay(new Date());

  const bounds = parseDayBounds(dateStr);

  const requestsToday = useMemo(() => {
    return materialRequests.filter((r) => {
      if (r.status === 'rejected') return false;
      if (!r.createdAt) return false;
      return toLocalDateKey(r.createdAt.toDate()) === dateStr;
    });
  }, [materialRequests, dateStr]);

  const requestsTodayCount = requestsToday.length;
  const requestsTodayValue = requestsToday.reduce((s, r) => s + (r.totalValue ?? 0), 0);

  const pendingApprovalsCount = useMemo(
    () => materialRequests.filter((r) => r.status === 'pending').length,
    [materialRequests],
  );

  const taskIdsUpdatedToday = useMemo(() => new Set(dayUpdates.map((u) => u.taskId)), [dayUpdates]);

  const siteTasks = useMemo(() => {
    if (!bounds) return [];
    const { dayStart, dayEndExclusive } = bounds;
    const map = new Map<string, Task>();
    for (const t of tasks) {
      if (taskOverlapsSelectedDay(t, dayStart, dayEndExclusive) || taskIdsUpdatedToday.has(t.id)) {
        map.set(t.id, t);
      }
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, bounds, taskIdsUpdatedToday]);

  const overdueCount = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.status === 'completed') return false;
        const end = t.endDate?.toDate();
        return !!end && startOfLocalDay(end).getTime() < calendarTodayStart.getTime();
      }).length,
    [tasks, calendarTodayStart],
  );

  const payableUnits = attSummary.present + attSummary.halfDay * 0.5;

  const goPrev = useCallback(() => {
    setDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() - 1);
      return n;
    });
  }, []);

  const goNext = useCallback(() => {
    setDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 1);
      return n;
    });
  }, []);

  const hasDpr = !!dpr;
  const openDpr = () => router.push(`/(app)/projects/${projectId}/dpr/${dateStr}` as never);

  const openTask = (taskId: string) =>
    router.push(`/(app)/projects/${projectId}/task/${taskId}` as never);

  const showIssuesBanner = !!(dpr?.issues && String(dpr.issues).trim());

  return (
    <View style={styles.container}>
      <View style={styles.dateBar}>
        <Pressable onPress={goPrev} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={color.textMuted} />
        </Pressable>
        <Text variant="metaStrong" color="text">{formatDate(date)}</Text>
        <Pressable onPress={goNext} hitSlop={8}>
          <Ionicons name="chevron-forward" size={18} color={color.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {showIssuesBanner ? (
          <Pressable onPress={openDpr} style={styles.issuesBanner}>
            <Ionicons name="warning-outline" size={18} color={color.warning} />
            <View style={{ flex: 1 }}>
              <Text variant="metaStrong" style={{ color: color.warning }}>Site issues today</Text>
              <Text variant="caption" color="textMuted" numberOfLines={2}>{dpr!.issues}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={color.textMuted} />
          </Pressable>
        ) : null}

        <View style={styles.cards}>
          <View style={styles.card}>
            <Ionicons name="people" size={20} color={color.primary} />
            <Text variant="title" color="text">{attSummary.present}</Text>
            <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
              Staff present
            </Text>
            <Text variant="caption" color="textFaint" style={{ textAlign: 'center', marginTop: 2 }}>
              {attSummary.halfDay} half · {attSummary.absent} absent
            </Text>
            <Text variant="caption" color="textMuted" style={{ textAlign: 'center', marginTop: 4 }}>
              ~{payableUnits.toFixed(1)} payable units
            </Text>
          </View>
          <View style={styles.card}>
            <Ionicons name="clipboard-outline" size={20} color={color.success} />
            <Text variant="title" color="text">{matLoading ? '…' : requestsTodayCount}</Text>
            <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
              Material requested
            </Text>
            <Text variant="caption" color="textFaint" style={{ textAlign: 'center', marginTop: 4 }}>
              Created this day
            </Text>
          </View>
          <View style={styles.card}>
            <Ionicons name="cash-outline" size={20} color={color.primary} />
            <Text variant="title" color="text" style={{ fontSize: 15 }}>
              {matLoading ? '…' : formatInr(requestsTodayValue)}
            </Text>
            <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
              Material value
            </Text>
            <Text variant="caption" color="textFaint" style={{ textAlign: 'center', marginTop: 4 }}>
              Same-day requests
            </Text>
          </View>
        </View>

        {(overdueCount > 0 || pendingApprovalsCount > 0) && (
          <View style={styles.chipsRow}>
            {overdueCount > 0 ? (
              <View style={[styles.chip, styles.chipDanger]}>
                <Ionicons name="alert-circle-outline" size={14} color={color.danger} />
                <Text variant="caption" style={{ color: color.danger }}>
                  {overdueCount} overdue task{overdueCount === 1 ? '' : 's'}
                </Text>
              </View>
            ) : null}
            {pendingApprovalsCount > 0 ? (
              <View style={[styles.chip, styles.chipWarn]}>
                <Ionicons name="hourglass-outline" size={14} color={color.warning} />
                <Text variant="caption" style={{ color: color.warning }}>
                  {pendingApprovalsCount} pending approval{pendingApprovalsCount === 1 ? '' : 's'}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {hasDpr && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="metaStrong" color="text">Daily report</Text>
            </View>
            <Pressable onPress={openDpr} style={styles.dprCard}>
              <View style={styles.dprMetaRow}>
                <View style={styles.dprMeta}>
                  <Ionicons name="people-outline" size={14} color={color.textMuted} />
                  <Text variant="caption" color="textMuted">
                    {dpr.staffPresent} present · {dpr.staffTotal} rostered
                  </Text>
                </View>
                {!!dpr.issues && (
                  <View style={styles.dprMeta}>
                    <Ionicons name="alert-circle-outline" size={14} color={color.warning} />
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {dpr.issues}
                    </Text>
                  </View>
                )}
              </View>
              {!!dpr.workDone && (
                <Text variant="body" color="text" numberOfLines={4}>
                  {dpr.workDone}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="metaStrong" color="text">Today&apos;s tasks</Text>
            <Text variant="caption" color="textMuted">
              Active this day or updated this day
            </Text>
          </View>
          {tasksLoading && siteTasks.length === 0 ? (
            <Text variant="meta" color="textMuted" style={styles.emptyInline}>Loading…</Text>
          ) : siteTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="checkbox-outline" size={22} color={color.textFaint} />
              <Text variant="meta" color="textMuted" align="center">
                No tasks for this day.
              </Text>
            </View>
          ) : (
            siteTasks.map((task) => {
              const pill = taskStatusPill(task, calendarTodayStart);
              const pct = Math.max(0, Math.min(100, task.progress ?? 0));
              return (
                <Pressable
                  key={task.id}
                  onPress={() => openTask(task.id)}
                  style={({ pressed }) => [styles.taskRow, pressed && { opacity: 0.85 }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" color="text" numberOfLines={1}>{task.title}</Text>
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {getCategoryLabel(task.category)}
                      {task.assignedToName ? ` · ${task.assignedToName}` : ''}
                    </Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
                    <Text variant="caption" style={{ color: pill.fg }}>{pill.label}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="metaStrong" color="text">Timeline updates</Text>
            <Text variant="caption" color="textMuted">Posted this day</Text>
          </View>
          {updatesLoading && dayUpdates.length === 0 ? (
            <Text variant="meta" color="textMuted" style={styles.emptyInline}>Loading…</Text>
          ) : dayUpdates.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="chatbubble-outline" size={22} color={color.textFaint} />
              <Text variant="meta" color="textMuted" align="center">
                No progress posts for this day.
              </Text>
            </View>
          ) : (
            dayUpdates.map((row) => {
              const prev = previousProgressForUpdate(row, dayUpdates);
              const delta = row.progress - prev;
              const deltaLabel = delta === 0 ? '' : `${delta > 0 ? '+' : ''}${delta}% → `;
              const initial = row.authorName.charAt(0).toUpperCase();
              const photos = row.photoUris?.slice(0, 3) ?? [];
              return (
                <Pressable
                  key={`${row.taskId}-${row.id}`}
                  onPress={() => openTask(row.taskId)}
                  style={({ pressed }) => [styles.updateRow, pressed && { opacity: 0.88 }]}
                >
                  <View style={styles.updateAvatar}>
                    <Text variant="metaStrong" style={{ color: color.primary }}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {row.authorName}
                    </Text>
                    <Text variant="metaStrong" color="text" numberOfLines={1}>
                      {row.taskTitle}
                    </Text>
                    <Text variant="caption" color="primary">
                      {deltaLabel}{row.progress}%
                    </Text>
                    {!!row.text?.trim() && (
                      <Text variant="meta" color="textMuted" numberOfLines={2}>
                        {row.text}
                      </Text>
                    )}
                    {photos.length > 0 ? (
                      <View style={styles.updatePhotos}>
                        {photos.map((uri) => (
                          <Image key={uri} source={{ uri }} style={styles.updateThumb} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="metaStrong" color="text">Site photos</Text>
          </View>
          {dpr && (dpr.photoUris?.length ?? 0) > 0 ? (
            <View style={styles.photoGrid}>
              {(dpr.photoUris ?? []).map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photoThumb} />
              ))}
            </View>
          ) : (
            <View style={styles.photosEmpty}>
              <Ionicons name="camera-outline" size={24} color={color.textFaint} />
              <Text variant="meta" color="textMuted">No photos for this date</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.dprWrap}>
        <Pressable
          onPress={openDpr}
          style={({ pressed }) => [styles.dprBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons
            name={hasDpr ? 'create-outline' : 'document-text-outline'}
            size={18}
            color={color.onPrimary}
          />
          <Text variant="bodyStrong" style={{ color: color.onPrimary }}>
            {hasDpr ? 'View / Edit DPR' : 'Create DPR'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 96 },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.bg,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  issuesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    padding: space.sm,
    backgroundColor: color.warningSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  cards: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: space.xxs,
    paddingVertical: space.md,
    paddingHorizontal: 4,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    paddingHorizontal: screenInset,
    marginBottom: space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipDanger: {
    backgroundColor: color.dangerSoft,
    borderColor: color.danger,
  },
  chipWarn: {
    backgroundColor: color.warningSoft,
    borderColor: color.warning,
  },
  section: {
    paddingHorizontal: screenInset,
    marginTop: space.sm,
  },
  sectionHeader: {
    marginBottom: space.sm,
    gap: 2,
  },
  dprCard: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
    padding: space.sm,
    gap: space.xs,
  },
  dprMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  dprMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emptyInline: { paddingVertical: space.sm },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
    gap: space.xs,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    marginBottom: space.xs,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.surfaceAlt,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.primary,
    borderRadius: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.sm,
    marginBottom: space.xs,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
  },
  updateAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatePhotos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
  },
  updateThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.separator,
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.separator,
  },
  photosEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
    gap: space.xs,
  },
  dprWrap: {
    position: 'absolute',
    left: screenInset,
    right: screenInset,
    bottom: space.xl,
  },
  dprBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: color.primary,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    ...shadow.fab,
  },
});
