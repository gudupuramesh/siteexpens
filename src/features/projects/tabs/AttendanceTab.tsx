/**
 * Attendance tab — v2 design.
 *
 * Layout:
 *   1. Date pager — prev · "SELECTED DATE" + label · next + calendar btn
 *   2. Day-total summary card with Present/Half/Absent pill grid
 *   3. Bulk-mark CTA (when there are unmarked rows)
 *   4. List of labour rows — avatar + name/role/pay + status pill + P/H/A toggle
 *   5. FAB — Add labour
 *   6. Calendar sheet — v2 DateTimeSheet (with Done button)
 */
import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useAuth } from '@/src/features/auth/useAuth';
import { useAttendance } from '@/src/features/attendance/useAttendance';
import { markAttendanceForDate, updateAttendanceStatus } from '@/src/features/attendance/attendance';
import type { AttendanceRecord, AttendanceStatus, AttendanceUiStatus } from '@/src/features/attendance/types';
import { useEffectiveProjectLabour } from '@/src/features/attendance/useEffectiveProjectLabour';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { Can } from '@/src/ui/Can';

import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FAB } from '@/src/ui/v2/FAB';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + delta);
  return d;
}

type AttendanceRow = {
  labourId: string;
  labourName: string;
  labourRole: string;
  description?: string;
  payRate?: number;
  payUnit?: 'day' | 'hour';
  recordId?: string;
  status: AttendanceUiStatus;
  sourceRecord?: AttendanceRecord;
};

const StatusToggle = memo(function StatusToggle({
  status,
  onToggle,
}: {
  status: AttendanceUiStatus;
  onToggle: (s: AttendanceStatus) => void;
}) {
  const t = useThemeV2();
  const busy = status === 'loading';

  const renderBtn = (
    label: 'P' | 'A' | 'H',
    target: AttendanceStatus,
    activeBg: string,
  ) => {
    const active =
      (label === 'P' && status === 'present')
      || (label === 'A' && status === 'absent')
      || (label === 'H' && status === 'half_day');
    return (
      <Pressable
        key={label}
        disabled={busy}
        onPress={() => onToggle(target)}
        style={({ pressed }) => [
          styles.toggleBtn,
          {
            backgroundColor: active ? activeBg : t.colors.fill3,
            borderRadius: 8,
          },
          busy && { opacity: 0.4 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text
          variant="caption2"
          style={{
            color: active ? '#fff' : t.colors.secondary,
            fontWeight: '700',
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.toggleRow}>
      {renderBtn('P', 'present', t.palette.green.base)}
      {renderBtn('H', 'half_day', t.palette.orange.base)}
      {renderBtn('A', 'absent', t.palette.red.base)}
    </View>
  );
}, (prev, next) => prev.status === next.status);

export function AttendanceTab() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [date, setDate] = useState(new Date());
  const dateStr = toDateString(date);
  const [today] = useState(() => new Date());
  const todayKey = toDateString(today);
  const isFutureDate = dateStr > todayKey;
  const { data: dayRecords, loading: dayLoading } = useAttendance(projectId, dateStr, orgId || undefined);
  const { data: roster, loading: rosterLoading } = useEffectiveProjectLabour(projectId, orgId || undefined);
  const [optimisticByLabour, setOptimisticByLabour] = useState<Map<string, AttendanceStatus>>(new Map());
  const [actionError, setActionError] = useState<string>();
  const [showCalendar, setShowCalendar] = useState(false);

  const handleToggle = useCallback(async (row: AttendanceRow, newStatus: AttendanceStatus) => {
    if (row.status === 'loading') return;
    if (isFutureDate) return;
    if (!projectId || !user || !orgId) return;
    setActionError(undefined);
    setOptimisticByLabour((prev) => {
      const next = new Map(prev);
      next.set(row.labourId, newStatus);
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (row.recordId) {
        await updateAttendanceStatus(row.recordId, newStatus);
        return;
      }
      await markAttendanceForDate({
        orgId,
        projectId,
        labourId: row.labourId,
        labourName: row.labourName,
        labourRole: row.labourRole,
        description: row.description,
        payRate: row.payRate,
        payUnit: row.payUnit,
        date: dateStr,
        status: newStatus,
        createdBy: user.uid,
      });
    } catch (err) {
      setOptimisticByLabour((prev) => {
        const next = new Map(prev);
        next.delete(row.labourId);
        return next;
      });
      setActionError('Could not save attendance. Please try again.');
      console.warn('[AttendanceTab] toggle error:', err);
    }
  }, [dateStr, isFutureDate, orgId, projectId, user]);

  useEffect(() => {
    setOptimisticByLabour(new Map());
    setActionError(undefined);
  }, [dateStr]);

  useEffect(() => {
    if (optimisticByLabour.size === 0) return;
    const dayByLabour = new Map<string, AttendanceStatus>();
    for (const rec of dayRecords) {
      dayByLabour.set(rec.labourId, rec.status);
    }
    setOptimisticByLabour((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      prev.forEach((status, labourId) => {
        if (dayByLabour.get(labourId) === status) next.delete(labourId);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [dayRecords, optimisticByLabour.size]);

  const goToPreviousDay = useCallback(() => {
    requestAnimationFrame(() => setDate((prev) => addDays(prev, -1)));
  }, []);

  const goToNextDay = useCallback(() => {
    if (isFutureDate || dateStr >= todayKey) return;
    requestAnimationFrame(() => setDate((prev) => addDays(prev, 1)));
  }, [dateStr, isFutureDate, todayKey]);

  const rows = useMemo<AttendanceRow[]>(() => {
    const dayByLabour = new Map<string, AttendanceRecord>();
    for (const rec of dayRecords) {
      dayByLabour.set(rec.labourId, rec);
    }
    const merged: AttendanceRow[] = roster.map((labour) => {
      const day = dayByLabour.get(labour.labourId);
      const optimistic = optimisticByLabour.get(labour.labourId);
      if (day) {
        return {
          labourId: labour.labourId,
          labourName: day.labourName,
          labourRole: day.labourRole,
          description: day.description ?? labour.description,
          payRate: day.payRate ?? labour.payRate,
          payUnit: day.payUnit ?? labour.payUnit,
          recordId: day.id,
          status: optimistic ?? day.status,
          sourceRecord: day,
        };
      }
      const fallbackStatus: AttendanceUiStatus =
        dayLoading && !optimistic ? 'loading' : optimistic ?? 'unmarked';
      return {
        labourId: labour.labourId,
        labourName: labour.labourName,
        labourRole: labour.labourRole,
        description: labour.description,
        payRate: labour.payRate,
        payUnit: labour.payUnit,
        status: fallbackStatus,
      };
    });
    for (const day of dayRecords) {
      if (merged.some((m) => m.labourId === day.labourId)) continue;
      const optimistic = optimisticByLabour.get(day.labourId);
      merged.push({
        labourId: day.labourId,
        labourName: day.labourName,
        labourRole: day.labourRole,
        description: day.description,
        payRate: day.payRate,
        payUnit: day.payUnit,
        recordId: day.id,
        status: optimistic ?? day.status,
        sourceRecord: day,
      });
    }
    merged.sort((a, b) => a.labourName.localeCompare(b.labourName));
    return merged;
  }, [dayLoading, dayRecords, optimisticByLabour, roster]);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let halfDay = 0;
    for (const row of rows) {
      if (row.status === 'present') present += 1;
      else if (row.status === 'absent') absent += 1;
      else if (row.status === 'half_day') halfDay += 1;
    }
    return { present, absent, halfDay, total: rows.length };
  }, [rows]);

  const estimatedHours = summary.present * 8 + summary.halfDay * 4;
  const payableUnits = summary.present + summary.halfDay * 0.5;
  const loading = dayLoading || rosterLoading;
  const hasUnmarked = rows.some((r) => r.status === 'unmarked');

  const markAllUnmarkedPresent = useCallback(async () => {
    if (isFutureDate) return;
    if (!projectId || !user || !orgId) return;
    const targets = rows.filter((r) => r.status === 'unmarked');
    if (targets.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Promise.all(
        targets.map((row) =>
          markAttendanceForDate({
            orgId,
            projectId,
            labourId: row.labourId,
            labourName: row.labourName,
            labourRole: row.labourRole,
            description: row.description,
            payRate: row.payRate,
            payUnit: row.payUnit,
            date: dateStr,
            status: 'present',
            createdBy: user.uid,
          }),
        ),
      );
    } catch (err) {
      console.warn('[AttendanceTab] bulk mark error:', err);
    }
  }, [dateStr, isFutureDate, orgId, projectId, rows, user]);

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const renderItem = useCallback(({ item }: { item: AttendanceRow }) => {
    const initial = item.labourName.charAt(0).toUpperCase();
    const payText =
      item.payRate && item.payRate > 0
        ? ` · ₹${item.payRate}/${item.payUnit === 'hour' ? 'hr' : 'day'}`
        : '';

    const statusMeta =
      item.status === 'loading'
        ? { label: '…', bg: t.colors.fill3, fg: t.colors.tertiary }
        : item.status === 'present'
          ? {
              // 90/10: Present is the default-good state — reads in neutral.
              label: 'PRESENT',
              bg: t.colors.fill3,
              fg: t.colors.secondary,
            }
          : item.status === 'half_day'
            ? {
                label: 'HALF',
                bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                fg: t.palette.orange.base,
              }
            : item.status === 'absent'
              ? {
                  label: 'ABSENT',
                  bg: t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                  fg: t.palette.red.base,
                }
              : { label: 'UNMARKED', bg: t.colors.fill3, fg: t.colors.secondary };

    return (
      <View
        style={[
          styles.row,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.card,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
        ]}
      >
        <View
          style={[
            styles.avatar,
            {
              backgroundColor:
                t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
            },
          ]}
        >
          <Text variant="footnote" style={{ color: t.palette.blue.base, fontWeight: '700' }}>
            {initial}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/(app)/projects/[id]/attendance/[recordId]',
              params: { id: projectId, recordId: item.labourId },
            })
          }
          style={({ pressed }) => [styles.rowBody, pressed && { opacity: 0.85 }]}
        >
          <Text variant="callout" color="label" numberOfLines={1}>
            {item.labourName}
          </Text>
          <View style={styles.rowMetaLine}>
            <Text variant="caption1" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
              {item.labourRole}{payText}
            </Text>
            <View
              style={[
                styles.statePill,
                { backgroundColor: statusMeta.bg, borderRadius: 999 },
              ]}
            >
              <Text
                variant="caption2"
                style={{
                  color: statusMeta.fg,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                }}
              >
                {statusMeta.label}
              </Text>
            </View>
          </View>
        </Pressable>
        <StatusToggle status={item.status} onToggle={(s) => handleToggle(item, s)} />
      </View>
    );
  }, [cardBg, cardBorder, handleToggle, projectId, t]);

  return (
    <View style={styles.container}>
      {/* Date pager */}
      <View style={styles.dateNavWrap}>
        <View
          style={[
            styles.dateNav,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.card,
              borderColor: cardBorder,
              borderWidth: t.hairline,
            },
          ]}
        >
          <Pressable
            onPress={goToPreviousDay}
            hitSlop={10}
            style={({ pressed }) => [
              styles.dateNavBtn,
              { backgroundColor: t.colors.fill3, borderRadius: 999 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Previous day"
          >
            <Ionicons name="chevron-back" size={16} color={t.colors.label} />
          </Pressable>
          <View style={styles.dateNavCenter}>
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5 }}
            >
              SELECTED DATE
            </Text>
            <Text
              variant="callout"
              color="label"
              style={{ fontWeight: '700', marginTop: 1 }}
            >
              {date.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowCalendar(true)}
            hitSlop={10}
            style={({ pressed }) => [
              styles.dateNavBtn,
              { backgroundColor: t.colors.fill3, borderRadius: 999 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Open calendar"
          >
            <Ionicons name="calendar-outline" size={15} color={t.colors.label} />
          </Pressable>
          <Pressable
            onPress={goToNextDay}
            disabled={dateStr >= todayKey}
            hitSlop={10}
            style={({ pressed }) => [
              styles.dateNavBtn,
              { backgroundColor: t.colors.fill3, borderRadius: 999 },
              pressed && { opacity: 0.7 },
              dateStr >= todayKey && { opacity: 0.4 },
            ]}
            accessibilityLabel="Next day"
          >
            <Ionicons
              name="chevron-forward"
              size={16}
              color={dateStr >= todayKey ? t.colors.tertiary : t.colors.label}
            />
          </Pressable>
        </View>
      </View>

      {/* Day-total summary */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.card,
              borderColor: cardBorder,
              borderWidth: t.hairline,
            },
          ]}
        >
          <View style={styles.summaryHead}>
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5 }}
            >
              DAY TOTAL · PAYABLE
            </Text>
            {dayLoading && roster.length > 0 ? (
              <ActivityIndicator size="small" color={t.colors.tertiary} />
            ) : null}
          </View>
          <Text
            variant="callout"
            color="label"
            style={{ fontWeight: '700', marginTop: 4 }}
            numberOfLines={1}
          >
            {summary.total} workers · {estimatedHours} hrs
          </Text>

          {actionError ? (
            <View
              style={[
                styles.errorPill,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                  borderRadius: 999,
                },
              ]}
            >
              <Text variant="caption2" style={{ color: t.palette.red.base, fontWeight: '700' }}>
                {actionError}
              </Text>
            </View>
          ) : null}

          {hasUnmarked && !isFutureDate ? (
            <Pressable
              onPress={markAllUnmarkedPresent}
              style={({ pressed }) => [
                styles.bulkMarkBtn,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                  borderRadius: 999,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons
                name="checkmark-done-outline"
                size={13}
                color={t.palette.blue.base}
              />
              <Text
                variant="caption2"
                style={{
                  color: t.palette.blue.base,
                  fontWeight: '700',
                  marginLeft: 4,
                  letterSpacing: 0.4,
                }}
              >
                MARK ALL UNMARKED AS PRESENT
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.summaryGrid}>
            {/* 90/10: Present neutralised; Half + Absent keep their action
                tones (orange / red). */}
            <SummaryPill
              label={`${summary.present} Present`}
              tone={t.colors.secondary}
              bg={t.colors.fill3}
            />
            <SummaryPill
              label={`${summary.halfDay} Half`}
              tone={t.palette.orange.base}
              bg={t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft}
            />
            <SummaryPill
              label={`${summary.absent} Absent`}
              tone={t.palette.red.base}
              bg={t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft}
            />
          </View>
          <Text
            variant="caption2"
            color="tertiary"
            style={{ marginTop: 8, letterSpacing: 0.5 }}
            numberOfLines={1}
          >
            {payableUnits.toFixed(1)} PAYABLE UNITS
          </Text>
        </View>
      </View>

      {/* List */}
      {loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="footnote" color="secondary">Loading…</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={32} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
            No labourers added
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
          >
            Add daily workers and contractors to track attendance.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.labourId}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl {...refresh.props} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      {!isFutureDate ? (
        <Can capability="attendance.write">
          <FAB
            icon="add"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/(app)/projects/${projectId}/add-labour` as never);
            }}
            bottomOffset={24}
            accessibilityLabel="Add labour"
          />
        </Can>
      ) : null}

      <DateTimeSheet
        open={showCalendar}
        value={date}
        onChange={(d) => {
          if (toDateString(d) <= todayKey) {
            requestAnimationFrame(() => setDate(d));
          }
        }}
        onClose={() => setShowCalendar(false)}
        mode="date"
        title="Select date"
      />
    </View>
  );
}

function SummaryPill({
  label,
  tone,
  bg,
}: {
  label: string;
  tone: string;
  bg: string;
}) {
  return (
    <View
      style={[
        styles.summaryPill,
        { backgroundColor: bg, borderRadius: 999 },
      ]}
    >
      <Text
        variant="caption2"
        style={{
          color: tone,
          fontWeight: '700',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Date pager
  dateNavWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  dateNavBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavCenter: {
    flex: 1,
    alignItems: 'center',
  },

  // Summary card
  summaryCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  bulkMarkBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },
  summaryGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  summaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  // List rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowMetaLine: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },

  // Status toggle
  toggleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  toggleBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 100,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});
