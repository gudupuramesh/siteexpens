/**
 * Labour attendance detail / preview — v2 design.
 *
 * Layout:
 *   1. Header — back · "Labour" · edit (top-right)
 *   2. Identity hero card — name + role + pay rate + description
 *   3. Per-month FormGroup blocks — 3-up Present/Half/Absent pills + meta rows
 *      (Days marked · Payable units · Estimated hours · Total amount) +
 *      per-day list with status pill
 *   4. Actions FormGroup — Disable / Enable + red Delete
 *   5. Edit sheet — bottom sheet with name/role/description/pay-rate/pay-unit
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { db } from '@/src/lib/firebase';
import { formatInr } from '@/src/lib/format';
import {
  getProjectLabourDocId,
  deleteLabourAcrossProject,
  setLabourDisabledAcrossProject,
  updateLabourAcrossProject,
} from '@/src/features/attendance/attendance';
import type { AttendanceRecord, ProjectLabour } from '@/src/features/attendance/types';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

function getMonthKey(dateString: string): string {
  return dateString.slice(0, 7);
}

function statusToUnits(status: AttendanceRecord['status']): number {
  if (status === 'present') return 1;
  if (status === 'half_day') return 0.5;
  return 0;
}

function statusToHours(status: AttendanceRecord['status']): number {
  if (status === 'present') return 8;
  if (status === 'half_day') return 4;
  return 0;
}

function monthLabelFromKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map((x) => Number(x));
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDayLabel(dateString: string): string {
  if (!dateString || dateString.length < 10) return dateString;
  const [y, m, d] = dateString.split('-').map((x) => Number(x));
  if (!y || !m || !d) return dateString;
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export default function AttendanceLabourDetailScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { id: projectId, recordId, labourId: labourIdParam } = useLocalSearchParams<{
    id: string;
    recordId?: string;
    labourId?: string;
  }>();
  const labourId = (labourIdParam ?? recordId ?? '').trim();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';

  const [record, setRecord] = useState<ProjectLabour | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingRole, setEditingRole] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [editingPayRate, setEditingPayRate] = useState('');
  const [editingPayUnit, setEditingPayUnit] = useState<'day' | 'hour'>('day');
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRecord[]>([]);

  useEffect(() => {
    if (!projectId || !labourId || !orgId) return;
    const rosterDocId = getProjectLabourDocId(projectId, labourId);
    const unsub = db.collection('projectLabour').doc(rosterDocId).onSnapshot(
      (snap) => {
        if (!snap.exists) {
          db.collection('attendance')
            .where('orgId', '==', orgId)
            .where('projectId', '==', projectId)
            .get()
            .then((attendanceSnap) => {
              const fallback = attendanceSnap.docs
                .map((d) => d.data() as Omit<AttendanceRecord, 'id'>)
                .filter((r) => r.labourId === labourId)
                .sort((a, b) => b.date.localeCompare(a.date))[0];
              if (!fallback) {
                setRecord(null);
                setLoading(false);
                return;
              }
              setRecord({
                id: getProjectLabourDocId(projectId, labourId),
                orgId: fallback.orgId,
                projectId: fallback.projectId,
                labourId: fallback.labourId,
                labourName: fallback.labourName,
                labourRole: fallback.labourRole,
                description: fallback.description,
                payRate: fallback.payRate,
                payUnit: fallback.payUnit,
                disabled: false,
                createdBy: fallback.createdBy,
                createdAt: null,
              });
              setLoading(false);
            })
            .catch(() => {
              setRecord(null);
              setLoading(false);
            });
          return;
        }
        const next = { id: snap.id, ...(snap.data() as Omit<ProjectLabour, 'id'>) };
        setRecord(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [labourId, projectId, orgId]);

  useEffect(() => {
    if (!projectId || !labourId || !record || !orgId) {
      setAttendanceRows([]);
      return;
    }
    const unsub = db
      .collection('attendance')
      .where('orgId', '==', orgId)
      .where('projectId', '==', projectId)
      .onSnapshot(
        (snap) => {
          if (!snap) {
            setAttendanceRows([]);
            return;
          }
          const rows = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))
            .filter((r) => r.labourId === labourId)
            .sort((a, b) => a.date.localeCompare(b.date));
          setAttendanceRows(rows);
        },
        () => setAttendanceRows([]),
      );
    return unsub;
  }, [projectId, labourId, record, orgId]);

  const summarizeRows = useCallback((rows: AttendanceRecord[]) => {
    let present = 0, half = 0, absent = 0, units = 0, hours = 0, payable = 0;
    for (const row of rows) {
      if (row.status === 'present') present += 1;
      else if (row.status === 'half_day') half += 1;
      else if (row.status === 'absent') absent += 1;
      const rowUnits = statusToUnits(row.status);
      const rowHours = statusToHours(row.status);
      units += rowUnits;
      hours += rowHours;
      if (row.payRate && row.payRate > 0) {
        if (row.payUnit === 'hour') payable += row.payRate * rowHours;
        else payable += row.payRate * rowUnits;
      }
    }
    return { present, half, absent, units, hours, payable, days: rows.length };
  }, []);

  const monthlyBreakdown = useMemo(() => {
    if (attendanceRows.length === 0) return [];
    const buckets = new Map<string, AttendanceRecord[]>();
    for (const row of attendanceRows) {
      const key = getMonthKey(row.date);
      if (!key) continue;
      const list = buckets.get(key) ?? [];
      list.push(row);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries())
      .map(([key, rows]) => {
        const sortedDays = [...rows].sort((a, b) => b.date.localeCompare(a.date));
        return {
          key,
          label: monthLabelFromKey(key),
          totals: summarizeRows(rows),
          days: sortedDays,
        };
      })
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [attendanceRows, summarizeRows]);

  const openEdit = () => {
    if (!record) return;
    setEditingName(record.labourName);
    setEditingRole(record.labourRole);
    setEditingDescription(record.description ?? '');
    setEditingPayRate(record.payRate ? String(record.payRate) : '');
    setEditingPayUnit(record.payUnit ?? 'day');
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!projectId || !record) return;
    if (!editingName.trim() || !editingRole.trim()) {
      Alert.alert('Missing details', 'Please enter labour name and worker detail.');
      return;
    }
    setSaving(true);
    try {
      await updateLabourAcrossProject(projectId, labourId, {
        labourName: editingName.trim(),
        labourRole: editingRole.trim(),
        description: editingDescription.trim(),
        payRate: editingPayRate ? Number(editingPayRate) : undefined,
        payUnit: editingPayUnit,
      });
      setShowEdit(false);
    } catch (err) {
      Alert.alert('Update failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onToggleDisable = () => {
    if (!projectId || !record) return;
    const next = !record.disabled;
    Alert.alert(
      next ? 'Disable labour' : 'Enable labour',
      next
        ? 'This person will be hidden from attendance list until re-enabled. Continue?'
        : 'This person will be visible again in attendance list. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next ? 'Disable' : 'Enable',
          style: next ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await setLabourDisabledAcrossProject(projectId, labourId, next);
              if (next) router.back();
            } catch (err) {
              Alert.alert('Action failed', (err as Error).message);
            }
          },
        },
      ],
    );
  };

  const onDeleteLabour = () => {
    if (!projectId || !record) return;
    Alert.alert(
      'Delete labour data',
      'This will permanently delete all attendance records of this person in this project. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLabourAcrossProject(projectId, labourId);
              router.back();
            } catch (err) {
              Alert.alert('Delete failed', (err as Error).message);
            }
          },
        },
      ],
    );
  };

  if (loading && !record) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="Labour" />
        <View style={styles.center}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }
  if (!record) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="Labour" />
        <View style={styles.center}>
          <Text variant="body" color="secondary">Record not found.</Text>
        </View>
      </View>
    );
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <Header
        onBack={() => router.back()}
        title="Labour"
        right={
          <CircleBtn
            icon="create-outline"
            onPress={openEdit}
            tint={t.palette.blue.base}
          />
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity hero */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.hero,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            <View
              style={[
                styles.heroAvatar,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                },
              ]}
            >
              <Text
                variant="title3"
                style={{ color: t.palette.blue.base, fontWeight: '700' }}
              >
                {record.labourName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                variant="headline"
                color="label"
                style={{ fontWeight: '700' }}
                numberOfLines={1}
              >
                {record.labourName}
              </Text>
              <Text
                variant="caption1"
                color="secondary"
                style={{ marginTop: 2 }}
                numberOfLines={1}
              >
                {record.labourRole}
                {record.payRate
                  ? ` · ₹${record.payRate}/${record.payUnit === 'hour' ? 'hr' : 'day'}`
                  : ''}
              </Text>
              {record.description ? (
                <Text variant="caption1" color="tertiary" style={{ marginTop: 6 }}>
                  {record.description}
                </Text>
              ) : null}
            </View>
            {record.disabled ? (
              <View
                style={[
                  styles.disabledPill,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                    borderRadius: 999,
                  },
                ]}
              >
                <Text
                  variant="caption2"
                  style={{
                    color: t.palette.orange.base,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                  }}
                >
                  DISABLED
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {monthlyBreakdown.length === 0 ? (
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <View
              style={[
                styles.emptyCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <Ionicons name="calendar-outline" size={28} color={t.colors.tertiary} />
              <Text
                variant="callout"
                color="label"
                style={{ marginTop: 10, fontWeight: '600', textAlign: 'center' }}
              >
                No attendance yet
              </Text>
              <Text
                variant="caption1"
                color="secondary"
                style={{ marginTop: 4, textAlign: 'center' }}
              >
                Open the Attendance tab and mark Present / Half / Absent for any date.
              </Text>
            </View>
          </View>
        ) : (
          monthlyBreakdown.map(({ key, label, totals, days }) => (
            <View key={key} style={{ marginTop: 22 }}>
              <Text
                variant="caption2"
                color="secondary"
                style={{
                  letterSpacing: 0.5,
                  paddingHorizontal: 32,
                  paddingBottom: 8,
                }}
              >
                {label.toUpperCase()} TOTAL
              </Text>
              <View style={{ paddingHorizontal: 16 }}>
                <View
                  style={[
                    styles.monthCard,
                    {
                      backgroundColor: cardBg,
                      borderRadius: t.radii.card,
                      borderColor: cardBorder,
                      borderWidth: t.hairline,
                    },
                  ]}
                >
                  <View style={styles.summaryGrid}>
                    {/* 90/10: Present is the default-good state and reads
                        in neutral. Only Half (orange) and Absent (red) keep
                        their action-prompting tones. */}
                    <SummaryPill
                      label={`${totals.present} Present`}
                      tone={t.colors.secondary}
                      bg={t.colors.fill3}
                    />
                    <SummaryPill
                      label={`${totals.half} Half`}
                      tone={t.palette.orange.base}
                      bg={t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft}
                    />
                    <SummaryPill
                      label={`${totals.absent} Absent`}
                      tone={t.palette.red.base}
                      bg={t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft}
                    />
                  </View>

                  <MonthMetaRow label="Days marked" value={String(totals.days)} />
                  <MonthMetaRow
                    label="Payable units"
                    value={totals.units.toFixed(1)}
                  />
                  <MonthMetaRow label="Estimated hours" value={String(totals.hours)} />
                  <MonthMetaRow
                    label="Total amount"
                    value={formatInr(totals.payable)}
                    tone={t.palette.blue.base}
                  />

                  <Text
                    variant="caption2"
                    color="tertiary"
                    style={{ letterSpacing: 0.5, marginTop: 14, paddingHorizontal: 4 }}
                  >
                    DAYS
                  </Text>
                  {days.map((d, i) => (
                    <View key={d.id ?? `${d.date}-${i}`} style={styles.dayRow}>
                      <Text variant="footnote" color="label" style={{ flex: 1, fontWeight: '600' }}>
                        {formatDayLabel(d.date)}
                      </Text>
                      <StatusPill status={d.status} />
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))
        )}

        {/* Actions */}
        <FormGroup header="Actions">
          <Row
            label={record.disabled ? 'Enable this person' : 'Disable this person'}
            // 90/10: re-enable action reads as interactive blue; disable
            // is a warning (orange).
            valueColor={record.disabled ? t.palette.blue.base : t.palette.orange.base}
            value={record.disabled ? 'Show' : 'Hide'}
            onPress={onToggleDisable}
          />
          <Row
            label="Delete this person from database"
            valueColor={t.palette.red.base}
            value="Delete"
            onPress={onDeleteLabour}
            divider={false}
          />
        </FormGroup>
      </ScrollView>

      {/* Edit sheet */}
      <Modal
        visible={showEdit}
        transparent
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => !saving && setShowEdit(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
            <AmbientBackground />
            <SheetHeader
              title="Edit labour"
              cancelLabel="Cancel"
              saveLabel="Save"
              saveLoading={saving}
              onCancel={() => !saving && setShowEdit(false)}
              onSave={saveEdit}
            />
            <ScrollView
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 60 }}
              keyboardShouldPersistTaps="handled"
            >
              <FormGroup header="Identity">
                <EditInputRow
                  label="Name"
                  value={editingName}
                  onChange={setEditingName}
                  autoCapitalize="words"
                />
                <EditInputRow
                  label="Role"
                  value={editingRole}
                  onChange={setEditingRole}
                  autoCapitalize="words"
                />
                <EditInputRow
                  label="Description"
                  value={editingDescription}
                  onChange={setEditingDescription}
                  multiline
                  divider={false}
                />
              </FormGroup>

              <FormGroup header="Pay">
                <EditInputRow
                  label="Pay rate"
                  value={editingPayRate}
                  onChange={(txt) => setEditingPayRate(txt.replace(/[^\d]/g, ''))}
                  keyboardType="number-pad"
                />
                <View style={styles.payUnitBlock}>
                  <Text
                    variant="caption2"
                    color="tertiary"
                    style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12 }}
                  >
                    PAY UNIT
                  </Text>
                  <View style={[styles.payUnitRow, { paddingHorizontal: 12, paddingVertical: 10 }]}>
                    {(['day', 'hour'] as const).map((u) => {
                      const active = editingPayUnit === u;
                      return (
                        <Pressable
                          key={u}
                          onPress={() => setEditingPayUnit(u)}
                          hitSlop={6}
                          style={({ pressed }) => [
                            styles.payUnitBtn,
                            {
                              backgroundColor: active
                                ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                                : t.colors.fill3,
                              borderRadius: t.radii.pill,
                              borderColor: active ? t.palette.blue.base + '33' : 'transparent',
                              borderWidth: active ? 1 : 0,
                            },
                            pressed && { opacity: 0.85 },
                          ]}
                        >
                          <Text
                            variant="footnote"
                            style={{
                              color: active ? t.palette.blue.base : t.colors.secondary,
                              fontWeight: active ? '700' : '500',
                            }}
                          >
                            {u === 'day' ? 'Per day' : 'Per hour'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </FormGroup>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function MonthMetaRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  const t = useThemeV2();
  return (
    <View style={styles.metaRow}>
      <Text variant="caption1" color="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text
        variant="footnote"
        style={{
          color: tone ?? t.colors.label,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
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
    <View style={[styles.summaryPill, { backgroundColor: bg, borderRadius: 999 }]}>
      <Text
        variant="caption2"
        style={{ color: tone, fontWeight: '700', letterSpacing: 0.3 }}
      >
        {label}
      </Text>
    </View>
  );
}

function StatusPill({ status }: { status: AttendanceRecord['status'] }) {
  const t = useThemeV2();
  // 90/10 discipline: only the problem states earn colour (absent → red,
  // half-day → orange because it's an unusual partial day). Present and
  // paid-leave both go neutral — the labels carry the meaning.
  const cfg: Record<AttendanceRecord['status'], { fg: string; bg: string; label: string }> = {
    present: {
      fg: t.colors.secondary,
      bg: t.colors.fill3,
      label: 'PRESENT',
    },
    half_day: {
      fg: t.palette.orange.base,
      bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
      label: 'HALF',
    },
    absent: {
      fg: t.palette.red.base,
      bg: t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
      label: 'ABSENT',
    },
    paid_leave: {
      fg: t.colors.secondary,
      bg: t.colors.fill3,
      label: 'LEAVE',
    },
    week_off: {
      fg: t.colors.secondary,
      bg: t.colors.fill3,
      label: 'OFF',
    },
  };
  const entry = cfg[status] ?? {
    fg: t.colors.secondary,
    bg: t.colors.fill3,
    label: String(status ?? '').toUpperCase(),
  };
  return (
    <View style={[styles.statusPill, { backgroundColor: entry.bg, borderRadius: 999 }]}>
      <Text
        variant="caption2"
        style={{ color: entry.fg, fontWeight: '700', letterSpacing: 0.5 }}
      >
        {entry.label}
      </Text>
    </View>
  );
}

function EditInputRow({
  label,
  value,
  onChange,
  autoCapitalize,
  keyboardType,
  multiline,
  divider = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'number-pad';
  multiline?: boolean;
  divider?: boolean;
}) {
  const t = useThemeV2();
  if (multiline) {
    return (
      <View
        style={[
          styles.multiInputWrap,
          divider
            ? {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              }
            : undefined,
        ]}
      >
        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          multiline
          placeholderTextColor={t.colors.tertiary}
          style={{
            color: t.colors.label,
            ...t.type.body,
            paddingTop: 6,
            paddingBottom: 0,
            margin: 0,
            minHeight: 60,
            textAlignVertical: 'top',
          }}
        />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.inputRow,
        divider
          ? {
              borderBottomColor: t.colors.separator,
              borderBottomWidth: t.hairline,
            }
          : undefined,
      ]}
    >
      <Text variant="callout" color="label" style={{ minWidth: 88 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        placeholderTextColor={t.colors.tertiary}
        style={{
          flex: 1,
          textAlign: 'right',
          paddingVertical: 0,
          margin: 0,
          color: t.colors.label,
          ...t.type.body,
        }}
      />
    </View>
  );
}

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
          paddingTop: insets.top + 8,
          borderBottomColor: t.colors.separator,
          borderBottomWidth: t.hairline,
        },
      ]}
    >
      <CircleBtn
        icon="chevron-back"
        onPress={onBack}
        tint={t.colors.label}
      />
      <Text
        variant="headline"
        color="label"
        style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {right ?? <View style={{ width: 32 }} />}
    </View>
  );
}

function CircleBtn({
  icon,
  onPress,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint: string;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.circleBtn,
        {
          backgroundColor: t.colors.surface,
          borderRadius: 999,
          borderColor:
            t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          borderWidth: t.hairline,
        },
        t.shadows.resting,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={16} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  circleBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {},

  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  monthCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  summaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },

  // Edit sheet inputs
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 48,
  },
  multiInputWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  payUnitBlock: {},
  payUnitRow: {
    flexDirection: 'row',
    gap: 7,
  },
  payUnitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
