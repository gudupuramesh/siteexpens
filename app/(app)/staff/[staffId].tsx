/**
 * Staff detail — v2 design.
 *
 * Shows the staff's identity (avatar, name, role, salary) and a monthly
 * attendance grid. Tap any day cell to cycle:
 *
 *   blank  →  present  →  half  →  absent  →  blank
 *
 * Each tap writes (or deletes) one `staffAttendance` doc keyed by
 * `{staffId}_{YYYY-MM-DD}`. Future days are disabled.
 *
 * Header trailing icon opens a native action sheet:
 *   - Edit details (reuses Add staff form fields in a modal sheet)
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
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { inrCompact, useThemeV2 } from '@/src/theme/v2';

const STATUS_CYCLE: (StaffAttendanceStatus | null)[] = [
  null,
  'present',
  'half',
  'absent',
];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export default function StaffDetailScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
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
  const realAttendanceMap = useMemo(() => {
    const m = new Map<string, StaffAttendanceStatus>();
    for (const a of attendance) m.set(a.date, a.status);
    return m;
  }, [attendance]);

  // Optimistic overrides: dateKey → next intended status.
  const [optimistic, setOptimistic] = useState<
    Record<string, StaffAttendanceStatus | null>
  >({});

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

  useEffect(() => {
    setOptimistic({});
  }, [month]);

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
    for (
      let d = new Date(start);
      d <= end;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
    ) {
      list.push(new Date(d));
    }
    return list;
  }, [month]);

  const today = useMemo(() => {
    const tt = new Date();
    tt.setHours(0, 0, 0, 0);
    return tt;
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

  const STATUS_TONE: Record<StaffAttendanceStatus, { fg: string; bg: string; label: string }> = {
    present: { fg: '#fff', bg: t.palette.green.base, label: 'P' },
    half: { fg: '#fff', bg: t.palette.orange.base, label: 'H' },
    absent: { fg: '#fff', bg: t.palette.red.base, label: 'A' },
  };

  const onCycleDay = async (d: Date) => {
    if (!staff || !orgId || !canWrite) return;
    if (d > today) return;
    const k = dateKey(d);
    const cur = attendanceMap.get(k) ?? null;
    const idx = STATUS_CYCLE.indexOf(cur);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
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

  const onMore = () => {
    if (!staff) return;
    Alert.alert(staff.name, 'Choose an action', [
      { text: 'Edit details', onPress: () => setEditOpen(true) },
      { text: 'Archive', style: 'destructive', onPress: onArchive },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loading && !staff) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={onBack} title="Staff" />
        <View style={styles.centered}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }
  if (!staff) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={onBack} title="Staff" />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">
            Staff not found.
          </Text>
        </View>
      </View>
    );
  }

  const mk = monthKey(month);
  const posted = staff.lastPayrollMonth === mk;
  const initial = staff.name.charAt(0).toUpperCase() || '?';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <Header
        onBack={onBack}
        title={staff.name}
        right={
          canWrite ? (
            <Pressable
              onPress={onMore}
              hitSlop={10}
              style={({ pressed }) => [
                styles.headerKebab,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: 999,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={t.colors.secondary}
              />
            </Pressable>
          ) : null
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <View
            style={[
              styles.idCard,
              {
                backgroundColor: t.colors.surface,
                borderRadius: t.radii.hero,
                borderColor:
                  t.mode === 'dark'
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,0,0,0.04)',
                borderWidth: t.hairline,
              },
            ]}
          >
            <View
              style={[
                styles.idAvatar,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                },
              ]}
            >
              <Text variant="title2" style={{ color: t.palette.blue.base, fontWeight: '700' }}>
                {initial}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="headline" color="label" style={{ fontWeight: '700' }} numberOfLines={1}>
                {staff.name}
              </Text>
              <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                {staff.role || 'Staff'}
              </Text>
              <Text
                variant="footnote"
                color="label"
                style={{
                  marginTop: 6,
                  fontWeight: '700',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {inrCompact(staff.monthlySalary)}
                <Text variant="caption1" color="secondary" style={{ fontWeight: '400' }}>
                  {' '}
                  / {staff.payUnit === 'month' ? 'month' : 'month (per-day)'}
                </Text>
              </Text>
            </View>
            {posted ? (
              <View
                style={[
                  styles.postedPill,
                  {
                    // Neutral pill — the label "POSTED" speaks for itself.
                    backgroundColor: t.colors.fill3,
                    borderRadius: 999,
                  },
                ]}
              >
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: t.colors.tertiary,
                  }}
                />
                <Text
                  variant="caption2"
                  style={{
                    color: t.colors.secondary,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                    marginLeft: 4,
                  }}
                >
                  POSTED
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Tally KPI strip */}
        <View style={[styles.tallyRow, { paddingHorizontal: 16 }]}>
          <TallyTile
            label="PRESENT"
            value={String(tally.present)}
            tone={t.palette.green.base}
            bg={t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft}
          />
          <TallyTile
            label="HALF"
            value={String(tally.half)}
            tone={t.palette.orange.base}
            bg={t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft}
          />
          <TallyTile
            label="ABSENT"
            value={String(tally.absent)}
            tone={t.palette.red.base}
            bg={t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft}
          />
          <TallyTile
            label="DUE"
            value={inrCompact(dueAmount)}
            tone={t.palette.blue.base}
            bg={t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft}
          />
        </View>

        {/* Month pager */}
        <View style={[styles.monthBar, { paddingHorizontal: 16 }]}>
          <Pressable
            onPress={goPrevMonth}
            hitSlop={10}
            style={({ pressed }) => [
              styles.monthBtn,
              {
                backgroundColor: t.colors.surface,
                borderRadius: 999,
                borderColor:
                  t.mode === 'dark'
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(0,0,0,0.05)',
                borderWidth: t.hairline,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="chevron-back" size={18} color={t.colors.label} />
          </Pressable>
          <Text variant="headline" color="label" style={{ fontWeight: '700' }}>
            {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </Text>
          <Pressable
            onPress={goNextMonth}
            hitSlop={10}
            style={({ pressed }) => [
              styles.monthBtn,
              {
                backgroundColor: t.colors.surface,
                borderRadius: 999,
                borderColor:
                  t.mode === 'dark'
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(0,0,0,0.05)',
                borderWidth: t.hairline,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="chevron-forward" size={18} color={t.colors.label} />
          </Pressable>
        </View>

        {/* Attendance grid */}
        <View style={{ paddingHorizontal: 16 }}>
          <View style={styles.gridLabels}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <Text
                key={i}
                variant="caption2"
                color="tertiary"
                style={[styles.gridLabel, { letterSpacing: 0.6 }]}
              >
                {d}
              </Text>
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
                    {
                      backgroundColor: tone ? tone.bg : t.colors.surface,
                      borderColor: tone
                        ? tone.bg
                        : (t.mode === 'dark'
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(0,0,0,0.05)'),
                      borderWidth: t.hairline,
                    },
                    isFuture && { opacity: 0.3 },
                    pressed && !isFuture && canWrite && { opacity: 0.6 },
                  ]}
                >
                  <Text
                    variant="footnote"
                    style={{
                      color: tone ? tone.fg : t.colors.label,
                      fontWeight: tone ? '700' : '600',
                    }}
                  >
                    {d.getDate()}
                  </Text>
                  {tone ? (
                    <Text
                      variant="caption2"
                      style={{
                        color: tone.fg,
                        fontWeight: '700',
                        letterSpacing: 0.4,
                        marginTop: 1,
                      }}
                    >
                      {tone.label}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Text
            variant="caption1"
            color="tertiary"
            style={{ marginTop: 14, lineHeight: 17, paddingHorizontal: 4 }}
          >
            Tap a day to cycle: empty → Present → Half → Absent → empty. Future dates are disabled.
          </Text>
        </View>
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

// ── Header ────────────────────────────────────────────────────────────

function Header({
  onBack,
  title,
  right,
}: {
  onBack: () => void;
  title: string;
  right?: React.ReactNode;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 6,
          borderBottomColor: t.colors.separator,
          borderBottomWidth: t.hairline,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        hitSlop={12}
        style={({ pressed }) => [
          styles.backBtn,
          pressed && { opacity: 0.6 },
        ]}
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={22} color={t.palette.blue.base} />
        <Text variant="body" style={{ color: t.palette.blue.base }}>
          Back
        </Text>
      </Pressable>
      <Text
        variant="headline"
        color="label"
        style={[styles.headerTitle, { fontWeight: '600' }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

// ── Tally tile ────────────────────────────────────────────────────────

/** Tally tile — neutral by design (90/10 colour discipline). `tone`/`bg`
 *  props accepted for back-compat but ignored. */
function TallyTile({
  label,
  value,
}: {
  label: string;
  value: string;
  /** @deprecated value renders in neutral label colour. */
  tone?: string;
  /** @deprecated dot renders with neutral fill3 background. */
  bg?: string;
}) {
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.tallyTile,
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
      <View style={[styles.tallyDot, { backgroundColor: t.colors.fill3 }]}>
        <View style={[styles.tallyDotInner, { backgroundColor: t.colors.tertiary }]} />
      </View>
      <Text
        variant="caption2"
        color="tertiary"
        style={{ letterSpacing: 0.5, marginTop: 6 }}
      >
        {label}
      </Text>
      <Text
        variant="footnote"
        color="label"
        style={{
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          marginTop: 2,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Edit staff modal ─────────────────────────────────────────────────

function EditStaffModal({
  visible,
  onClose,
  staff,
}: {
  visible: boolean;
  onClose: () => void;
  staff: Staff;
}) {
  const t = useThemeV2();
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
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <AmbientBackground />
        <SheetHeader
          title="Edit staff"
          cancelLabel="Cancel"
          saveLabel="Save"
          saveLoading={busy}
          onCancel={onClose}
          onSave={() => void onSave()}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <FormGroup header="Identity">
              <InputRow
                label="Name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              <InputRow
                label="Role"
                value={role}
                onChangeText={setRole}
                autoCapitalize="words"
                divider={false}
              />
            </FormGroup>

            <FormGroup
              header="Salary"
              footer={`Standard ${WORKING_DAYS_PER_MONTH} working days per month.`}
            >
              <InputRow
                label="Monthly salary"
                value={salary}
                onChangeText={setSalary}
                keyboardType="number-pad"
                autoCapitalize="none"
              />
              <View style={styles.payModelBlock}>
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12 }}
                >
                  PAY MODEL
                </Text>
                <View style={[styles.modelPillRow, { paddingHorizontal: 12, paddingVertical: 10 }]}>
                  {(['month', 'day'] as PayUnit[]).map((p) => {
                    const sel = payUnit === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setPayUnit(p)}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.modelPill,
                          {
                            backgroundColor: sel
                              ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                              : t.colors.fill3,
                            borderRadius: t.radii.pill,
                            borderColor: sel ? t.palette.blue.base + '33' : 'transparent',
                            borderWidth: sel ? 1 : 0,
                          },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text
                          variant="footnote"
                          style={{
                            color: sel ? t.palette.blue.base : t.colors.secondary,
                            fontWeight: sel ? '700' : '500',
                          }}
                        >
                          {p === 'month' ? 'Monthly' : 'Per-day'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </FormGroup>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 70,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerRight: { minWidth: 70, alignItems: 'flex-end' },
  headerKebab: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {},

  // Identity card
  idCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  idAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },

  // Tally row
  tallyRow: {
    flexDirection: 'row',
    paddingTop: 14,
    gap: 8,
  },
  tallyTile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'flex-start',
  },
  tallyDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tallyDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Month pager
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 22,
    paddingBottom: 12,
  },
  monthBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Grid
  gridLabels: {
    flexDirection: 'row',
    paddingBottom: 8,
  },
  gridLabel: {
    flex: 1,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridCell: {
    width: '13.4%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  gridCellEmpty: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },

  // Edit modal pay-model row
  payModelBlock: {
    paddingBottom: 0,
  },
  modelPillRow: {
    flexDirection: 'row',
    gap: 7,
  },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
