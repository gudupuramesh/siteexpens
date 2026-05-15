/**
 * Site tab — v2 design.
 *
 * Shows the day's site activity for a project: attendance, material
 * requests, daily report, today's tasks, timeline updates, and photos.
 *
 * Layout:
 *   1. Date pager (prev · date · next)
 *   2. Issues banner (when DPR has issues)
 *   3. KPI strip — Staff present / Material reqs / Material value
 *   4. Status chips — overdue tasks / pending approvals (when relevant)
 *   5. FormGroup "Daily report" — when DPR exists
 *   6. FormGroup "Today's tasks" — list of task rows
 *   7. FormGroup "Timeline updates" — task progress posts
 *   8. FormGroup "Site photos" — DPR photo grid
 *   9. Floating bottom button — Create / View DPR
 */
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
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

import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

export function SiteTab() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
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
    () => tasks.map((tt) => ({ id: tt.id, title: tt.title })),
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

  const taskIdsUpdatedToday = useMemo(
    () => new Set(dayUpdates.map((u) => u.taskId)),
    [dayUpdates],
  );

  const siteTasks = useMemo(() => {
    if (!bounds) return [];
    const { dayStart, dayEndExclusive } = bounds;
    const map = new Map<string, Task>();
    for (const tt of tasks) {
      if (taskOverlapsSelectedDay(tt, dayStart, dayEndExclusive) || taskIdsUpdatedToday.has(tt.id)) {
        map.set(tt.id, tt);
      }
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, bounds, taskIdsUpdatedToday]);

  const overdueCount = useMemo(
    () =>
      tasks.filter((tt) => {
        if (tt.status === 'completed') return false;
        const end = tt.endDate?.toDate();
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

  // Card surface helpers
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={styles.container}>
      {/* Date pager */}
      <View style={styles.dateBarWrap}>
        <View
          style={[
            styles.dateBar,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.field,
              borderColor: cardBorder,
              borderWidth: t.hairline,
            },
          ]}
        >
          <Pressable
            onPress={goPrev}
            hitSlop={10}
            style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={18} color={t.colors.label} />
          </Pressable>
          <Text variant="callout" color="label" style={{ fontWeight: '700' }}>
            {formatDate(date)}
          </Text>
          <Pressable
            onPress={goNext}
            hitSlop={10}
            style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-forward" size={18} color={t.colors.label} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...refresh.props} />}
      >
        {/* Issues banner */}
        {showIssuesBanner ? (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <Pressable
              onPress={openDpr}
              style={({ pressed }) => [
                styles.issuesBanner,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                  borderRadius: t.radii.card,
                  borderColor: t.palette.orange.base + '33',
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="warning" size={16} color={t.palette.orange.base} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text
                  variant="footnote"
                  style={{ color: t.palette.orange.base, fontWeight: '700' }}
                >
                  Site issues today
                </Text>
                <Text
                  variant="caption1"
                  color="secondary"
                  style={{ marginTop: 1 }}
                  numberOfLines={2}
                >
                  {dpr!.issues}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={t.colors.tertiary}
              />
            </Pressable>
          </View>
        ) : null}

        {/* KPI strip */}
        <View style={styles.kpiRow}>
          <KpiCard
            icon="people"
            tone={t.palette.blue.base}
            bg={t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft}
            value={String(attSummary.present)}
            label="STAFF PRESENT"
            footnote={`${attSummary.halfDay} half · ${attSummary.absent} absent`}
          />
          <KpiCard
            icon="clipboard-outline"
            tone={t.palette.green.base}
            bg={t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft}
            value={matLoading ? '…' : String(requestsTodayCount)}
            label="MATERIAL REQS"
            footnote="Created this day"
          />
          <KpiCard
            icon="cash-outline"
            tone={t.palette.orange.base}
            bg={t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft}
            value={matLoading ? '…' : formatInr(requestsTodayValue)}
            label="REQ VALUE"
            footnote={`~${payableUnits.toFixed(1)} payable units`}
          />
        </View>

        {/* Status chips */}
        {(overdueCount > 0 || pendingApprovalsCount > 0) ? (
          <View style={styles.chipsRow}>
            {overdueCount > 0 ? (
              <StatusChip
                tone={t.palette.red.base}
                bg={t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft}
                icon="alert-circle"
                label={`${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}`}
              />
            ) : null}
            {pendingApprovalsCount > 0 ? (
              <StatusChip
                tone={t.palette.orange.base}
                bg={t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft}
                icon="time-outline"
                label={`${pendingApprovalsCount} pending approval${pendingApprovalsCount === 1 ? '' : 's'}`}
              />
            ) : null}
          </View>
        ) : null}

        {/* Daily report card */}
        {hasDpr ? (
          <SectionWrap title="Daily report">
            <Pressable
              onPress={openDpr}
              style={({ pressed }) => [
                styles.surfaceCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.dprMetaRow}>
                <View style={styles.dprMeta}>
                  <Ionicons name="people-outline" size={13} color={t.colors.tertiary} />
                  <Text variant="caption1" color="secondary" style={{ marginLeft: 4 }}>
                    {dpr!.staffPresent} present · {dpr!.staffTotal} rostered
                  </Text>
                </View>
                {dpr!.issues ? (
                  <View style={styles.dprMeta}>
                    <Ionicons name="alert-circle-outline" size={13} color={t.palette.orange.base} />
                    <Text variant="caption1" color="secondary" style={{ marginLeft: 4 }} numberOfLines={1}>
                      {dpr!.issues}
                    </Text>
                  </View>
                ) : null}
              </View>
              {dpr!.workDone ? (
                <Text variant="callout" color="label" style={{ marginTop: 8 }} numberOfLines={4}>
                  {dpr!.workDone}
                </Text>
              ) : null}
            </Pressable>
          </SectionWrap>
        ) : null}

        {/* Today's tasks */}
        <SectionWrap
          title="Today's tasks"
          subtitle="Active this day or updated this day"
        >
          {tasksLoading && siteTasks.length === 0 ? (
            <Text variant="footnote" color="secondary" style={{ paddingHorizontal: 4 }}>
              Loading…
            </Text>
          ) : siteTasks.length === 0 ? (
            <EmptyCard
              icon="checkbox-outline"
              text="No tasks for this day."
            />
          ) : (
            siteTasks.map((task) => {
              const pill = taskStatusPill(task, calendarTodayStart);
              const pct = Math.max(0, Math.min(100, task.progress ?? 0));
              return (
                <Pressable
                  key={task.id}
                  onPress={() => openTask(task.id)}
                  style={({ pressed }) => [
                    styles.taskRow,
                    {
                      backgroundColor: cardBg,
                      borderRadius: t.radii.card,
                      borderColor: cardBorder,
                      borderWidth: t.hairline,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      variant="callout"
                      color="label"
                     
                      numberOfLines={1}
                    >
                      {task.title}
                    </Text>
                    <Text variant="caption1" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
                      {getCategoryLabel(task.category)}
                      {task.assignedToName ? ` · ${task.assignedToName}` : ''}
                    </Text>
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
                            width: `${pct}%`,
                            backgroundColor:
                              pct >= 100 ? t.palette.green.base : t.palette.blue.base,
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: pill.bg, borderRadius: 999 },
                    ]}
                  >
                    <Text variant="caption2" style={{ color: pill.fg, fontWeight: '700', letterSpacing: 0.4 }}>
                      {pill.label.toUpperCase()}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
                </Pressable>
              );
            })
          )}
        </SectionWrap>

        {/* Timeline updates */}
        <SectionWrap title="Timeline updates" subtitle="Posted this day">
          {updatesLoading && dayUpdates.length === 0 ? (
            <Text variant="footnote" color="secondary" style={{ paddingHorizontal: 4 }}>
              Loading…
            </Text>
          ) : dayUpdates.length === 0 ? (
            <EmptyCard icon="chatbubble-outline" text="No progress posts for this day." />
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
                  style={({ pressed }) => [
                    styles.updateRow,
                    {
                      backgroundColor: cardBg,
                      borderRadius: t.radii.card,
                      borderColor: cardBorder,
                      borderWidth: t.hairline,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View
                    style={[
                      styles.updateAvatar,
                      {
                        backgroundColor:
                          t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                      },
                    ]}
                  >
                    <Text
                      variant="footnote"
                      style={{ color: t.palette.blue.base, fontWeight: '700' }}
                    >
                      {initial}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="caption1" color="secondary" numberOfLines={1}>
                      {row.authorName}
                    </Text>
                    <Text variant="callout" color="label" style={{ fontWeight: '700' }} numberOfLines={1}>
                      {row.taskTitle}
                    </Text>
                    <Text
                      variant="caption2"
                      style={{
                        color: t.palette.blue.base,
                        marginTop: 2,
                        fontWeight: '700',
                        letterSpacing: 0.4,
                      }}
                    >
                      {deltaLabel}{row.progress}%
                    </Text>
                    {row.text?.trim() ? (
                      <Text variant="footnote" color="secondary" numberOfLines={2} style={{ marginTop: 4 }}>
                        {row.text}
                      </Text>
                    ) : null}
                    {photos.length > 0 ? (
                      <View style={styles.updatePhotos}>
                        {photos.map((uri) => (
                          <Image
                            key={uri}
                            source={{ uri }}
                            style={[
                              styles.updateThumb,
                              { backgroundColor: t.colors.fill3, borderRadius: 8 },
                            ]}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </SectionWrap>

        {/* Site photos */}
        <SectionWrap title="Site photos">
          {dpr && (dpr.photoUris?.length ?? 0) > 0 ? (
            <View style={styles.photoGrid}>
              {(dpr.photoUris ?? []).map((uri) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={[
                    styles.photoThumb,
                    {
                      backgroundColor: t.colors.fill3,
                      borderRadius: t.radii.tile,
                    },
                  ]}
                />
              ))}
            </View>
          ) : (
            <EmptyCard icon="camera-outline" text="No photos for this date" />
          )}
        </SectionWrap>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating DPR button */}
      <View style={styles.dprBtnWrap}>
        <Pressable
          onPress={openDpr}
          style={({ pressed }) => [
            styles.dprBtn,
            {
              backgroundColor: t.palette.blue.base,
              borderRadius: t.radii.field,
              shadowColor: t.palette.blue.base,
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Ionicons
            name={hasDpr ? 'create-outline' : 'document-text-outline'}
            size={18}
            color="#fff"
          />
          <Text
            variant="footnote"
            style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}
          >
            {hasDpr ? 'View / Edit DPR' : 'Create DPR'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────

/**
 * KPI metric tile — value + label + optional footnote.
 *
 * Per the app-wide colour discipline (only blue/red/orange/green carry
 * meaning), KPI counts render in neutral theme tokens regardless of metric.
 * The `tone` and `bg` props are kept on the type for back-compat with
 * existing callers but their values are ignored.
 */
function KpiCard({
  icon,
  value,
  label,
  footnote,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** @deprecated value renders in neutral label colour. */
  tone?: string;
  /** @deprecated icon tile renders with neutral fill3 background. */
  bg?: string;
  value: string;
  label: string;
  footnote?: string;
}) {
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.kpiCard,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
      ]}
    >
      <View style={[styles.kpiIcon, { backgroundColor: t.colors.fill3 }]}>
        <Ionicons name={icon} size={13} color={t.colors.tertiary} />
      </View>
      <Text
        variant="title3"
        color="label"
        style={{
          fontWeight: '700',
          marginTop: 6,
          fontVariant: ['tabular-nums'],
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      <Text
        variant="caption2"
        color="tertiary"
        style={{ letterSpacing: 0.4, marginTop: 2 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {footnote ? (
        <Text
          variant="caption2"
          color="tertiary"
          style={{ marginTop: 2 }}
          numberOfLines={1}
        >
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

function StatusChip({
  tone,
  bg,
  icon,
  label,
}: {
  tone: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View
      style={[
        styles.statusChip,
        {
          backgroundColor: bg,
          borderRadius: 999,
          borderColor: tone + '33',
          borderWidth: 1,
        },
      ]}
    >
      <Ionicons name={icon} size={12} color={tone} />
      <Text
        variant="caption2"
        style={{
          color: tone,
          fontWeight: '700',
          marginLeft: 4,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SectionWrap({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text
          variant="caption2"
          color="secondary"
          style={{ letterSpacing: 0.5 }}
        >
          {title.toUpperCase()}
        </Text>
        {subtitle ? (
          <Text variant="caption1" color="tertiary" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function EmptyCard({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.emptyCard,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={t.colors.tertiary} />
      <Text variant="footnote" color="secondary" style={{ marginTop: 8 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 24 },

  // Date pager
  dateBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dateBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Issues banner
  issuesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // KPI strip
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
  },
  kpiIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Status chips
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },

  // Section wrapper
  section: {
    marginTop: 22,
  },
  sectionHeader: {
    paddingHorizontal: 32,
    paddingBottom: 8,
  },
  sectionBody: {
    paddingHorizontal: 16,
    gap: 8,
  },

  surfaceCard: {
    padding: 12,
  },

  // DPR card
  dprMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dprMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Task row
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
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
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  // Update row
  updateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
  },
  updateAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatePhotos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  updateThumb: {
    width: 56,
    height: 56,
  },

  // Photo grid
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  photoThumb: {
    width: 88,
    height: 88,
  },

  // Empty card
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
  },

  // Floating DPR button
  dprBtnWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
  },
  dprBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
