/**
 * Staff detail — shows the staff's identity (name / role / salary)
 * and a monthly attendance grid. Tap any day cell to cycle:
 *
 *   blank  →  present  →  half  →  absent  →  blank
 *
 * Each tap writes (or deletes) one `staffAttendance` doc keyed by
 * `{staffId}_{YYYY-MM-DD}`. Future days are disabled.
 *
 * Actions in the header kebab:
 *   - Edit details (reuses the same fields Add staff uses)
 *   - Archive (soft delete — preserves attendance history)
 *
 * Permission: any caller can land here, but write actions
 * (mark / edit / archive) require `finance.write`.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import {
  archiveStaff,
  clearStaffAttendance,
  markStaffAttendance,
  updateStaff,
} from '@/src/features/staff/staff';
import {
  type PayUnit,
  type Staff,
  type StaffAttendanceStatus,
  computePayroll,
  dateKey,
  monthKey,
  WORKING_DAYS_PER_MONTH,
} from '@/src/features/staff/types';
import { useStaff } from '@/src/features/staff/useStaff';
import { useStaffAttendance } from '@/src/features/staff/useStaffAttendance';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, screenInset, space } from '@/src/theme/tokens';

const STATUS_CYCLE: (StaffAttendanceStatus | null)[] = [
  null,
  'present',
  'half',
  'absent',
];

const STATUS_TONE: Record<StaffAttendanceStatus, { fg: string; bg: string; label: string }> = {
  present: { fg: '#fff', bg: color.success, label: 'P' },
  half:    { fg: '#fff', bg: color.warning, label: 'H' },
  absent:  { fg: '#fff', bg: color.danger,  label: 'A' },
};

function inrCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) {
    const v = n / 1_00_000;
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    return `₹${s.endsWith('.0') ? s.slice(0, -2) : s}L`;
  }
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export default function StaffDetailScreen() {
  const { staffId } = useLocalSearchParams<{ staffId: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { can } = usePermissions();
  const canWrite = can('finance.write');

  const { data: staffList, loading } = useStaff(orgId);
  const staff = useMemo(
    () => staffList.find((s) => s.id === staffId) ?? null,
    [staffList, staffId],
  );

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const { byStaff } = useStaffAttendance(orgId, month);
  const attendance = useMemo(() => byStaff[staffId] ?? [], [byStaff, staffId]);
  // Real status from Firestore, keyed by date (YYYY-MM-DD).
  const realAttendanceMap = useMemo(() => {
    const m = new Map<string, StaffAttendanceStatus>();
    for (const a of attendance) m.set(a.date, a.status);
    return m;
  }, [attendance]);

  // Optimistic overrides: dateKey → next intended status (or `null` for
  // "cleared"). Cells render this override immediately on tap so the
  // user gets feedback before the Firestore write round-trips.
  const [optimistic, setOptimistic] = useState<
    Record<string, StaffAttendanceStatus | null>
  >({});

  // Drop overrides that the snapshot has now confirmed.
  useEffect(() => {
    setOptimistic((prev) => {
      let changed = false;
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) {
        const want = prev[k];
        const real = realAttendanceMap.get(k);
        const matches = want === null ? real === undefined : want === real;
        if (matches) changed = true;
        else next[k] = want;
      }
      return changed ? next : prev;
    });
  }, [realAttendanceMap]);

  // Reset overrides when the user changes month — those taps were for
  // dates that may not be in the new range.
  useEffect(() => {
    setOptimistic({});
  }, [month]);

  // Display map = real values overlaid with optimistic intentions.
  const attendanceMap = useMemo(() => {
    const m = new Map<string, StaffAttendanceStatus>(realAttendanceMap);
    for (const k of Object.keys(optimistic)) {
      const v = optimistic[k];
      if (v === null) m.delete(k);
      else m.set(k, v);
    }
    return m;
  }, [realAttendanceMap, optimistic]);

  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const list: Date[] = [];
    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      list.push(new Date(d));
    }
    return list;
  }, [month]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const tally = useMemo(() => {
    let present = 0;
    let half = 0;
    let absent = 0;
    for (const a of attendance) {
      if (a.status === 'present') present += 1;
      else if (a.status === 'half') half += 1;
      else if (a.status === 'absent') absent += 1;
    }
    return { present, half, absent };
  }, [attendance]);

  const dueAmount = useMemo(() => {
    if (!staff) return 0;
    return computePayroll(staff, tally.present, tally.half);
  }, [staff, tally]);

  const onCycleDay = async (d: Date) => {
    if (!staff || !orgId || !canWrite) return;
    if (d > today) return;
    const k = dateKey(d);
    const cur = attendanceMap.get(k) ?? null;
    const idx = STATUS_CYCLE.indexOf(cur);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    // Apply optimistic override IMMEDIATELY so the cell flips on tap,
    // not after a Firestore round-trip. The useEffect above clears the
    // override once the snapshot listener confirms.
    setOptimistic((prev) => ({ ...prev, [k]: next }));
    try {
      if (next === null) {
        await clearStaffAttendance({ staffId: staff.id, date: k });
      } else {
        await markStaffAttendance({
          staffId: staff.id,
          orgId,
          date: k,
          status: next,
        });
      }
    } catch (e) {
      // Revert: drop the override so the cell snaps back to truth.
      setOptimistic((prev) => {
        const upd = { ...prev };
        delete upd[k];
        return upd;
      });
      Alert.alert('Could not update attendance', (e as Error).message);
    }
  };

  const goPrevMonth = () =>
    setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const goNextMonth = () =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/overview' as never);
  };

  const [editOpen, setEditOpen] = useState(false);
  const onArchive = () => {
    if (!staff) return;
    Alert.alert(
      'Archive staff?',
      `${staff.name}'s attendance and payroll history stays available, but they'll be hidden from the active list and excluded from future payroll runs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveStaff(staff.id);
              if (router.canGoBack()) router.back();
            } catch (e) {
              Alert.alert('Could not archive', (e as Error).message);
            }
          },
        },
      ],
    );
  };

  if (loading && !staff) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header onBack={onBack} title="Staff" />
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      </View>
    );
  }
  if (!staff) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header onBack={onBack} title="Staff" />
        <View style={styles.loading}>
          <Text variant="meta" color="textMuted">Staff not found.</Text>
        </View>
      </View>
    );
  }

  const mk = monthKey(month);
  const posted = staff.lastPayrollMonth === mk;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header
        onBack={onBack}
        title={staff.name}
        right={
          canWrite ? (
            <Pressable
              onPress={() =>
                Alert.alert(staff.name, 'Choose an action', [
                  { text: 'Edit details', onPress: () => setEditOpen(true) },
                  { text: 'Archive', style: 'destructive', onPress: onArchive },
                  { text: 'Cancel', style: 'cancel' },
                ])
              }
              hitSlop={12}
              style={styles.headerKebab}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={color.text} />
            </Pressable>
          ) : null
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <View style={styles.idCard}>
          <View style={styles.idAvatar}>
            <Text variant="title" color="primary">{staff.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="rowTitle" color="text">{staff.name}</Text>
            <Text variant="meta" color="textMuted">{staff.role || 'Staff'}</Text>
            <Text variant="caption" color="textFaint" style={{ marginTop: 4 }}>
              {staff.payUnit === 'month' ? 'Monthly' : 'Per-day'} · {inrCompact(staff.monthlySalary)}/mo
            </Text>
          </View>
          {posted ? (
            <View style={styles.postedPill}>
              <Text style={styles.postedPillText}>{mk} POSTED</Text>
            </View>
          ) : null}
        </View>

        {/* Tally row */}
        <View style={styles.tallyCard}>
          <TallyCell label="PRESENT" value={String(tally.present)} tone={color.success} />
          <View style={styles.tallyDivider} />
          <TallyCell label="HALF" value={String(tally.half)} tone={color.warning} />
          <View style={styles.tallyDivider} />
          <TallyCell label="ABSENT" value={String(tally.absent)} tone={color.danger} />
          <View style={styles.tallyDivider} />
          <TallyCell label="DUE" value={inrCompact(dueAmount)} tone={color.text} />
        </View>

        {/* Month pager */}
        <View style={styles.monthBar}>
          <Pressable onPress={goPrevMonth} hitSlop={12} style={styles.monthBtn}>
            <Ionicons name="chevron-back" size={20} color={color.text} />
          </Pressable>
          <Text variant="rowTitle" color="text">
            {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable onPress={goNextMonth} hitSlop={12} style={styles.monthBtn}>
            <Ionicons name="chevron-forward" size={20} color={color.text} />
          </Pressable>
        </View>

        {/* Attendance grid — 7-column, days of the month. Tap to
            cycle through none → present → half → absent → none. */}
        <View style={styles.gridLabels}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <Text key={i} style={styles.gridLabel}>{d}</Text>
          ))}
        </View>
        <View style={styles.grid}>
          {/* Pad cells for the days of the week before the 1st. */}
          {Array.from({ length: days[0]?.getDay() ?? 0 }).map((_, i) => (
            <View key={`pad-${i}`} style={[styles.gridCell, styles.gridCellEmpty]} />
          ))}
          {days.map((d) => {
            const k = dateKey(d);
            const status = attendanceMap.get(k);
            const tone = status ? STATUS_TONE[status] : null;
            const isFuture = d > today;
            return (
              <Pressable
                key={k}
                onPress={() => void onCycleDay(d)}
                disabled={isFuture || !canWrite}
                style={({ pressed }) => [
                  styles.gridCell,
                  tone && { backgroundColor: tone.bg, borderColor: tone.bg },
                  isFuture && { opacity: 0.3 },
                  pressed && !isFuture && canWrite && { opacity: 0.6 },
                ]}
              >
                <Text
                  style={
                    tone
                      ? [styles.gridDay, { color: tone.fg, fontWeight: '700' as const }]
                      : styles.gridDay
                  }
                >
                  {d.getDate()}
                </Text>
                {tone ? (
                  <Text style={[styles.gridStatusLetter, { color: tone.fg }]}>
                    {tone.label}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text variant="caption" color="textFaint" style={styles.hint}>
          Tap a day to cycle: empty → Present → Half → Absent → empty.
          Future dates are disabled.
        </Text>
      </ScrollView>

      {editOpen ? (
        <EditStaffModal
          visible={editOpen}
          onClose={() => setEditOpen(false)}
          staff={staff}
        />
      ) : null}
    </View>
  );
}

// ── Header / cells / edit modal ─────────────────────────────────────

function Header({
  onBack,
  title,
  right,
}: {
  onBack: () => void;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={22} color={color.primary} />
        <Text variant="body" color="primary">Back</Text>
      </Pressable>
      <Text variant="rowTitle" color="text" style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

function TallyCell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.tallyCell}>
      <Text style={styles.tallyLabel}>{label}</Text>
      <Text
        style={tone ? [styles.tallyValue, { color: tone }] : styles.tallyValue}
      >
        {value}
      </Text>
    </View>
  );
}

function EditStaffModal({
  visible,
  onClose,
  staff,
}: {
  visible: boolean;
  onClose: () => void;
  staff: Staff;
}) {
  const [name, setName] = useState(staff.name);
  const [role, setRole] = useState(staff.role);
  const [salary, setSalary] = useState(String(staff.monthlySalary));
  const [payUnit, setPayUnit] = useState<PayUnit>(staff.payUnit);
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    const salaryNum = Number(salary);
    if (!name.trim()) return Alert.alert('Name is required');
    if (!Number.isFinite(salaryNum) || salaryNum <= 0)
      return Alert.alert('Enter a valid monthly salary');
    setBusy(true);
    try {
      await updateStaff(staff.id, {
        name: name.trim(),
        role: role.trim() || 'Staff',
        monthlySalary: salaryNum,
        payUnit,
      });
      onClose();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;
  return (
    <View style={modalStyles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={modalStyles.sheet}>
        <View style={modalStyles.handle} />
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text variant="body" color="textMuted">Cancel</Text>
          </Pressable>
          <Text variant="title" color="text">Edit staff</Text>
          <Pressable onPress={onSave} hitSlop={10} disabled={busy}>
            <Text variant="bodyStrong" color="primary">{busy ? '…' : 'Save'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={modalStyles.body}>
          <Text style={modalStyles.label}>NAME</Text>
          <TextInput value={name} onChangeText={setName} style={modalStyles.input} autoCapitalize="words" />
          <Text style={modalStyles.label}>ROLE</Text>
          <TextInput value={role} onChangeText={setRole} style={modalStyles.input} autoCapitalize="words" />
          <Text style={modalStyles.label}>MONTHLY SALARY (₹)</Text>
          <TextInput value={salary} onChangeText={setSalary} style={modalStyles.input} keyboardType="number-pad" />
          <Text style={modalStyles.label}>PAY UNIT</Text>
          <View style={modalStyles.toggle}>
            <Pressable
              onPress={() => setPayUnit('month')}
              style={[modalStyles.toggleBtn, payUnit === 'month' && modalStyles.toggleBtnActive]}
            >
              <Text variant="metaStrong" color={payUnit === 'month' ? 'onPrimary' : 'text'}>Monthly</Text>
            </Pressable>
            <Pressable
              onPress={() => setPayUnit('day')}
              style={[modalStyles.toggleBtn, payUnit === 'day' && modalStyles.toggleBtnActive]}
            >
              <Text variant="metaStrong" color={payUnit === 'day' ? 'onPrimary' : 'text'}>Per day</Text>
            </Pressable>
          </View>
          <Text variant="caption" color="textFaint" style={{ marginTop: 12 }}>
            Standard {WORKING_DAYS_PER_MONTH} working days per month.
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingTop: 50, // approx safe-area; the Stack.Screen hides nav so we offset.
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 80,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerRight: { minWidth: 80, alignItems: 'flex-end' },
  headerKebab: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  scroll: {
    paddingBottom: 40,
  },
  idCard: {
    margin: screenInset,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    backgroundColor: color.bg,
  },
  idAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: color.successSoft,
  },
  postedPillText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.success,
    letterSpacing: 0.8,
  },
  tallyCard: {
    flexDirection: 'row',
    marginHorizontal: screenInset,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tallyCell: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, gap: 2 },
  tallyDivider: { width: StyleSheet.hairlineWidth, backgroundColor: color.borderStrong },
  tallyLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.1,
  },
  tallyValue: {
    fontFamily: fontFamily.mono,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabels: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingBottom: 6,
  },
  gridLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: screenInset,
    gap: 6,
  },
  gridCell: {
    width: '13.4%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  gridCellEmpty: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  gridDay: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
  },
  gridStatusLetter: {
    fontFamily: fontFamily.mono,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  hint: {
    paddingHorizontal: screenInset,
    paddingTop: 14,
    lineHeight: 16,
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: color.borderStrong,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  body: { padding: screenInset, gap: 8 },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.2,
    marginTop: 12,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.text,
  },
  toggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 10,
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  toggleBtnActive: { backgroundColor: color.primary },
});
