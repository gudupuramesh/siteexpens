/**
 * Attendance tab — daily P/H/A marker for studio staff.
 *
 * One staff per row, three pills (Present / Half / Absent). Tap a pill
 * to set; tap the same pill again to clear (deletes the doc, which is
 * the cleanest way to revert an accidental mark).
 *
 * Date selector at top (today / yesterday / pick date). The per-staff
 * detail screen (`/staff/[staffId]`) still exists for the full month grid.
 *
 * All writes go through the existing engine:
 *  - markStaffAttendance(staffId, orgId, date, status)
 *  - clearStaffAttendance(staffId, date)
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import {
  clearStaffAttendance,
  markStaffAttendance,
} from '@/src/features/staff/staff';
import {
  type Staff,
  type StaffAttendanceStatus,
  dateKey,
} from '@/src/features/staff/types';
import { useStaff } from '@/src/features/staff/useStaff';
import { useStaffAttendance } from '@/src/features/staff/useStaffAttendance';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, screenInset, space } from '@/src/theme';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const STATUS_PILLS: { key: StaffAttendanceStatus; label: string; tone: string; tint: string }[] = [
  { key: 'present', label: 'P', tone: color.success, tint: color.successSoft },
  { key: 'half', label: 'H', tone: color.warning, tint: color.warningSoft },
  { key: 'absent', label: 'A', tone: color.danger, tint: color.dangerSoft },
];

export function AttendanceTab() {
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { can } = usePermissions();
  const canWrite = can('finance.write');

  const [date, setDate] = useState<Date>(() => new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Optimistic overrides: staffId → next intended status (or `null` for
  // "cleared"). The pill renders this immediately on tap; once the
  // Firestore snapshot catches up (or a write fails) the override is
  // dropped and the real value takes over again.
  const [optimistic, setOptimistic] = useState<
    Record<string, StaffAttendanceStatus | null>
  >({});

  // useStaffAttendance pulls a whole month — we filter client-side to
  // the chosen day. Cheaper than a per-day listener since the month
  // window is the same data the Payroll tab already subscribes to.
  const monthAnchor = useMemo(() => startOfMonth(date), [date]);
  const { data: staff, loading: staffLoading } = useStaff(orgId);
  const { byStaff, loading: attLoading } = useStaffAttendance(orgId, monthAnchor);

  const activeStaff = useMemo(() => staff.filter((s) => !s.archivedAt), [staff]);

  const dateKeyStr = useMemo(() => dateKey(date), [date]);
  // The "real" status from Firestore for each staff on the chosen day.
  const realStatusFor = useMemo(() => {
    const m: Record<string, StaffAttendanceStatus | undefined> = {};
    for (const s of activeStaff) {
      const att = byStaff[s.id] ?? [];
      const today = att.find((a) => a.date === dateKeyStr);
      m[s.id] = today?.status;
    }
    return m;
  }, [activeStaff, byStaff, dateKeyStr]);

  // Drop any optimistic override that the snapshot has now confirmed.
  // Runs after every snapshot — keeps the override map small and
  // ensures `statusFor` lines up with truth as soon as Firestore catches up.
  useEffect(() => {
    setOptimistic((prev) => {
      let changed = false;
      const next: typeof prev = {};
      for (const key of Object.keys(prev)) {
        const want = prev[key];
        const real = realStatusFor[key];
        // `null` override means "cleared" — confirmed when real becomes undefined.
        const matches = want === null ? real === undefined : want === real;
        if (matches) {
          changed = true;
        } else {
          next[key] = want;
        }
      }
      return changed ? next : prev;
    });
  }, [realStatusFor]);

  // Reset all overrides when the user changes the active date — those
  // taps were for a different day, so they shouldn't override the new day.
  useEffect(() => {
    setOptimistic({});
  }, [dateKeyStr]);

  // Display status = optimistic override (if any) ?? real Firestore value.
  const statusFor = useMemo(() => {
    const m: Record<string, StaffAttendanceStatus | undefined> = {};
    for (const s of activeStaff) {
      if (s.id in optimistic) {
        const v = optimistic[s.id];
        m[s.id] = v ?? undefined;
      } else {
        m[s.id] = realStatusFor[s.id];
      }
    }
    return m;
  }, [activeStaff, optimistic, realStatusFor]);

  const todayCounts = useMemo(() => {
    let p = 0, h = 0, a = 0;
    for (const s of activeStaff) {
      const st = statusFor[s.id];
      if (st === 'present') p++;
      else if (st === 'half') h++;
      else if (st === 'absent') a++;
    }
    return { p, h, a, unmarked: activeStaff.length - p - h - a };
  }, [activeStaff, statusFor]);

  const handleMark = async (s: Staff, status: StaffAttendanceStatus) => {
    if (!orgId || !canWrite) return;
    const current = statusFor[s.id];
    const willClear = current === status;
    const intended: StaffAttendanceStatus | null = willClear ? null : status;
    // Apply optimistic override IMMEDIATELY so the pill flips on tap,
    // not after a Firestore round-trip (~200ms-2s on slow networks).
    setOptimistic((prev) => ({ ...prev, [s.id]: intended }));
    try {
      if (willClear) {
        await clearStaffAttendance({ staffId: s.id, date: dateKeyStr });
      } else {
        await markStaffAttendance({
          staffId: s.id,
          orgId,
          date: dateKeyStr,
          status,
        });
      }
      // Don't drop the override here — let the useEffect above clear it
      // once the snapshot listener catches up. That way the UI never
      // flickers from optimistic → empty → real if the listener takes
      // a beat to settle.
    } catch (e) {
      // Revert: drop the override so the pill snaps back to truth.
      setOptimistic((prev) => {
        const next = { ...prev };
        delete next[s.id];
        return next;
      });
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    }
  };

  const goPrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d);
  };
  const goNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d);
  };
  const goToday = () => setDate(new Date());

  const isToday = isSameDay(date, new Date());
  const isLoading = staffLoading || attLoading;

  const renderRow = ({ item }: { item: Staff }) => {
    const current = statusFor[item.id];
    return (
      <View style={styles.row}>
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/(app)/staff/[staffId]',
              params: { staffId: item.id },
            })
          }
          style={styles.rowMeta}
        >
          <View style={styles.avatar}>
            <Text variant="metaStrong" style={{ color: color.primary }}>
              {item.name.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="rowTitle" color="text" numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="meta" color="textMuted" numberOfLines={1}>
              {item.role || 'Staff'}
            </Text>
          </View>
        </Pressable>

        <View style={styles.pillRow}>
          {STATUS_PILLS.map((p) => {
            const on = current === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => handleMark(item, p.key)}
                disabled={!canWrite}
                style={({ pressed }) => [
                  styles.pill,
                  on && {
                    backgroundColor: p.tint,
                    borderColor: p.tone,
                  },
                  pressed && { opacity: 0.55 },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: on ? p.tone : color.textMuted },
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Date bar */}
      <View style={styles.dateBar}>
        <Pressable
          onPress={goPrevDay}
          hitSlop={12}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
          accessibilityLabel="Previous day"
        >
          <Ionicons name="chevron-back" size={18} color={color.text} />
        </Pressable>
        <Pressable
          onPress={() => setDatePickerOpen(true)}
          style={styles.dateLabelWrap}
          accessibilityLabel="Pick date"
        >
          <Text variant="rowTitle" color="text">
            {isToday ? 'Today' : fmtDateLong(date)}
          </Text>
          <Text variant="meta" color="textMuted" style={{ marginTop: 1 }}>
            {isToday ? fmtDateLong(date) : 'Tap to change'}
          </Text>
        </Pressable>
        <Pressable
          onPress={goNextDay}
          hitSlop={12}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
          accessibilityLabel="Next day"
        >
          <Ionicons name="chevron-forward" size={18} color={color.text} />
        </Pressable>
        {!isToday ? (
          <Pressable
            onPress={goToday}
            hitSlop={6}
            style={({ pressed }) => [styles.todayChip, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.todayChipText}>TODAY</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={activeStaff}
        keyExtractor={(s) => s.id}
        renderItem={renderRow}
        ListHeaderComponent={
          <View>
            <View style={styles.summaryCard}>
              <SummaryCell label="PRESENT" value={String(todayCounts.p)} tone={color.success} />
              <View style={styles.summaryDivider} />
              <SummaryCell label="HALF" value={String(todayCounts.h)} tone={color.warning} />
              <View style={styles.summaryDivider} />
              <SummaryCell label="ABSENT" value={String(todayCounts.a)} tone={color.danger} />
              <View style={styles.summaryDivider} />
              <SummaryCell label="UNMARKED" value={String(todayCounts.unmarked)} tone={color.textMuted} />
            </View>
            <Text style={styles.sectionLabel}>STAFF · {activeStaff.length}</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={color.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={28} color={color.textFaint} />
              <Text variant="bodyStrong" color="text" style={{ marginTop: space.xs }}>
                No active staff
              </Text>
              <Text variant="meta" color="textMuted" align="center" style={{ marginTop: 4 }}>
                Add staff in the Staff tab to start marking attendance.
              </Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Date picker — Android dialog auto-closes; iOS gets a modal sheet */}
      {datePickerOpen && Platform.OS === 'android' ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(_, d) => {
            setDatePickerOpen(false);
            if (d) setDate(d);
          }}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={datePickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setDatePickerOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setDatePickerOpen(false)}
            />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text variant="bodyStrong" color="text">Pick a date</Text>
                <Pressable onPress={() => setDatePickerOpen(false)} hitSlop={12}>
                  <Text variant="metaStrong" color="primary">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={date}
                mode="date"
                display="inline"
                maximumDate={new Date()}
                onChange={(_, d) => {
                  if (d) setDate(d);
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Date bar
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    gap: space.sm,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabelWrap: { flex: 1, alignItems: 'center' },
  todayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: color.primarySoft,
  },
  todayChipText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: 0.8,
  },

  // Summary
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: screenInset,
    marginTop: space.md,
  },
  summaryCell: { flex: 1, paddingVertical: 12, paddingHorizontal: 6, gap: 4, alignItems: 'center' },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: color.borderStrong },
  summaryLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.0,
  },
  summaryValue: {
    fontFamily: fontFamily.mono,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },

  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    paddingHorizontal: screenInset,
    marginTop: space.lg,
    marginBottom: 6,
  },

  // List
  listContent: { paddingHorizontal: screenInset, paddingBottom: 40 },
  rowGap: { height: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: { flexDirection: 'row', gap: 6 },
  pill: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  empty: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  // iOS date picker modal
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 6,
    paddingBottom: 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
});
