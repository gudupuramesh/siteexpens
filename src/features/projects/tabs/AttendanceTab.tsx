import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useAuth } from '@/src/features/auth/useAuth';
import { useAttendance } from '@/src/features/attendance/useAttendance';
import { markAttendanceForDate, updateAttendanceStatus } from '@/src/features/attendance/attendance';
import type { AttendanceRecord, AttendanceStatus, AttendanceUiStatus } from '@/src/features/attendance/types';
import { useEffectiveProjectLabour } from '@/src/features/attendance/useEffectiveProjectLabour';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // local YYYY-MM-DD (timezone-safe)
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

type DisplayStatus = AttendanceUiStatus;

const StatusToggle = memo(function StatusToggle({
  status,
  onToggle,
}: {
  status: AttendanceUiStatus;
  onToggle: (s: AttendanceStatus) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Pressable
        onPress={() => onToggle('present')}
        style={[styles.toggleBtn, status === 'present' && styles.togglePresent]}
      >
        <Text variant="caption" style={{ color: status === 'present' ? '#fff' : color.success }}>P</Text>
      </Pressable>
      <Pressable
        onPress={() => onToggle('absent')}
        style={[styles.toggleBtn, status === 'absent' && styles.toggleAbsent]}
      >
        <Text variant="caption" style={{ color: status === 'absent' ? '#fff' : color.danger }}>A</Text>
      </Pressable>
      <Pressable
        onPress={() => onToggle('half_day')}
        style={[styles.toggleBtn, status === 'half_day' && styles.toggleHalf]}
      >
        <Text variant="caption" style={{ color: status === 'half_day' ? '#fff' : color.warning }}>H</Text>
      </Pressable>
    </View>
  );
}, (prev, next) => prev.status === next.status);

export function AttendanceTab() {
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

  const handleToggle = useCallback(async (row: AttendanceRow, newStatus: AttendanceStatus) => {
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

  const [showCalendar, setShowCalendar] = useState(false);

  // Scroll the strip so the selected date sits near the centre.
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
      return {
        labourId: labour.labourId,
        labourName: labour.labourName,
        labourRole: labour.labourRole,
        description: labour.description,
        payRate: labour.payRate,
        payUnit: labour.payUnit,
        status: optimistic ?? 'unmarked',
      };
    });

    // Show legacy day records that may not yet be in roster.
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
  }, [dayRecords, optimisticByLabour, roster]);

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

  const renderItem = useCallback(({ item }: { item: AttendanceRow }) => {
    const initial = item.labourName.charAt(0).toUpperCase();
    const payText =
      item.payRate && item.payRate > 0
        ? ` · ₹${item.payRate}/${item.payUnit === 'hour' ? 'hr' : 'day'}`
        : '';
    const displayStatus: DisplayStatus = item.status;
    const statusMeta =
      displayStatus === 'present'
        ? { label: 'PRESENT', bg: color.successSoft, fg: color.success }
        : displayStatus === 'half_day'
          ? { label: 'HALF', bg: color.warningSoft, fg: color.warning }
          : displayStatus === 'absent'
            ? { label: 'ABSENT', bg: color.dangerSoft, fg: color.danger }
            : { label: 'UNMARKED', bg: color.surfaceAlt, fg: color.textMuted };
    return (
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text variant="metaStrong" style={{ color: color.primary }}>{initial}</Text>
        </View>
        <Pressable
          onPress={() => router.push({
            pathname: '/(app)/projects/[id]/attendance/[recordId]',
            params: { id: projectId, recordId: item.labourId },
          })}
          style={({ pressed }) => [styles.rowBody, pressed && { opacity: 0.85 }]}
        >
          <Text variant="rowTitle" color="text" numberOfLines={1}>{item.labourName}</Text>
          <View style={styles.rowMetaLine}>
            <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.rowMetaText}>
              {item.labourRole}{payText}
            </Text>
            <View style={[styles.statePill, { backgroundColor: statusMeta.bg }]}>
              <Text variant="caption" style={{ color: statusMeta.fg }}>{statusMeta.label}</Text>
            </View>
          </View>
        </Pressable>
        <StatusToggle
          status={item.status}
          onToggle={(s) => handleToggle(item, s)}
        />
      </View>
    );
  }, [handleToggle, projectId]);

  return (
    <View style={styles.container}>
      <View style={styles.dateNavWrap}>
        <Pressable onPress={goToPreviousDay} style={styles.dateNavBtn} accessibilityLabel="Previous day">
          <Ionicons name="chevron-back" size={16} color={color.textMuted} />
        </Pressable>
        <View style={styles.dateNavCenter}>
          <Text variant="caption" color="textMuted" style={styles.dateNavKicker}>
            SELECTED DATE
          </Text>
          <Text variant="bodyStrong" color="text">
            {date.toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
        </View>
        <Pressable
          onPress={goToNextDay}
          disabled={dateStr >= todayKey}
          style={[styles.dateNavBtn, dateStr >= todayKey && styles.dateNavBtnDisabled]}
          accessibilityLabel="Next day"
        >
          <Ionicons name="chevron-forward" size={16} color={dateStr >= todayKey ? color.textFaint : color.textMuted} />
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHead}>
          <View style={styles.summaryHeadText}>
            <Text variant="caption" color="textMuted" style={styles.summaryKicker} numberOfLines={1}>
              DAY TOTAL · PAYABLE
            </Text>
            <Text variant="bodyStrong" color="text" style={styles.summaryMain} numberOfLines={1}>
              {summary.total} workers · {estimatedHours} hrs
            </Text>
          </View>
          <Pressable onPress={() => setShowCalendar(true)} style={styles.calendarBtn}>
            <Ionicons name="calendar-outline" size={16} color={color.textMuted} />
          </Pressable>
        </View>
        {actionError ? (
          <View style={styles.errorPill}>
            <Text variant="caption" style={styles.errorPillText}>{actionError}</Text>
          </View>
        ) : null}
        {hasUnmarked && !isFutureDate ? (
          <Pressable onPress={markAllUnmarkedPresent} style={styles.bulkMarkBtn}>
            <Ionicons name="checkmark-done-outline" size={14} color={color.primary} />
            <Text variant="caption" color="primary">
              MARK ALL UNMARKED AS PRESENT
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCell, { backgroundColor: color.successSoft }]}>
            <Text variant="caption" style={{ color: color.success }}>{summary.present} Present</Text>
          </View>
          <View style={[styles.summaryCell, { backgroundColor: color.warningSoft }]}>
            <Text variant="caption" style={{ color: color.warning }}>{summary.halfDay} Half</Text>
          </View>
          <View style={[styles.summaryCell, { backgroundColor: color.dangerSoft }]}>
            <Text variant="caption" style={{ color: color.danger }}>{summary.absent} Absent</Text>
          </View>
        </View>
        <Text variant="caption" color="textMuted" style={styles.summarySubline} numberOfLines={1}>
          {payableUnits.toFixed(1)} PAYABLE UNITS
        </Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
            No labourers added
          </Text>
          <Text variant="meta" color="textMuted" align="center">
            Add daily workers and contractors to track attendance.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.labourId}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {!isFutureDate ? (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/(app)/projects/${projectId}/add-labour` as never);
          }}
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
          accessibilityLabel="Add labour"
        >
          <Ionicons name="add" size={24} color={color.onPrimary} />
        </Pressable>
      ) : null}

      {showCalendar ? (
        Platform.OS === 'ios' ? (
          <Modal
            visible={showCalendar}
            transparent
            animationType="slide"
            onRequestClose={() => setShowCalendar(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowCalendar(false)}>
              <View />
            </Pressable>
            <View style={styles.modalSheet}>
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                maximumDate={today}
                onChange={(_: DateTimePickerEvent, next?: Date) => {
                  if (next && toDateString(next) <= todayKey) {
                    requestAnimationFrame(() => setDate(next));
                  }
                }}
              />
              <Pressable onPress={() => setShowCalendar(false)} style={styles.doneBtn}>
                <Text variant="bodyStrong" color="primary">Done</Text>
              </Pressable>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            maximumDate={today}
            onChange={(event: DateTimePickerEvent, next?: Date) => {
              if (event.type !== 'dismissed' && next && toDateString(next) <= todayKey) {
                requestAnimationFrame(() => setDate(next));
              }
              setShowCalendar(false);
            }}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateNavWrap: {
    marginTop: 8,
    marginHorizontal: screenInset,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    padding: 8,
    gap: 8,
  },
  dateNavBtn: {
    width: 36,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgGrouped,
  },
  dateNavBtnDisabled: {
    opacity: 0.45,
  },
  dateNavCenter: {
    flex: 1,
    alignItems: 'center',
  },
  dateNavKicker: {
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  summaryCard: {
    paddingHorizontal: screenInset,
    paddingVertical: 12,
    marginHorizontal: screenInset,
    marginTop: 6,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
  },
  summaryKicker: {
    letterSpacing: 1,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryHeadText: {
    flex: 1,
    minWidth: 0,
  },
  summaryMain: {
    marginTop: 2,
  },
  calendarBtn: {
    width: 36,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgGrouped,
  },
  summaryGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  bulkMarkBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  errorPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: color.danger,
    backgroundColor: color.dangerSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  errorPillText: {
    color: color.danger,
  },
  summaryCell: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  summarySubline: {
    marginTop: 8,
    letterSpacing: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: 12,
    backgroundColor: color.surface,
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    borderRadius: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowMetaLine: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMetaText: {
    flex: 1,
  },
  statePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  toggleBtn: {
    width: 34,
    height: 34,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgGrouped,
  },
  togglePresent: {
    backgroundColor: color.success,
    borderColor: color.success,
  },
  toggleAbsent: {
    backgroundColor: color.danger,
    borderColor: color.danger,
  },
  toggleHalf: {
    backgroundColor: color.warning,
    borderColor: color.warning,
  },
  listContent: {
    paddingHorizontal: screenInset,
    paddingTop: 2,
    paddingBottom: 80,
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  modalSheet: {
    backgroundColor: color.bgGrouped,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingTop: 8,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
  },
  doneBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
