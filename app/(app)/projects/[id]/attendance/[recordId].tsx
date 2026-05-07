import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { Button } from '@/src/ui/Button';
import { KeyboardFormLayout } from '@/src/ui/KeyboardFormLayout';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

function getMonthKey(dateString: string): string {
  return dateString.slice(0, 7); // YYYY-MM
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

/** "2026-04-26" → "Sun, 26 Apr" — short, scannable per-day label. */
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
          db
            .collection('attendance')
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
        () => {
          setAttendanceRows([]);
        },
      );
    return unsub;
  }, [projectId, labourId, record, orgId]);

  const summarizeRows = useCallback((rows: AttendanceRecord[]) => {
    let present = 0;
    let half = 0;
    let absent = 0;
    let units = 0;
    let hours = 0;
    let payable = 0;
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

  // Derive months from the actual attendance data (not a hardcoded last-3
  // window) so any month with marked days surfaces here, sorted newest
  // first. Each month carries its own per-day list so the user can see
  // which dates were marked, not just the totals.
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
        // Newest day first inside each month (so the most recent
        // attendance shows at the top of the list).
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
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (!record) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="arrow-back" size={20} color={color.text} />
          </Pressable>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Labour</Text>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.center}>
          <Text variant="meta" color="textMuted">Record not found.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={20} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={{ letterSpacing: 1.1 }}>ATTENDANCE</Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Labour Details</Text>
        </View>
        <Pressable onPress={openEdit} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="create-outline" size={20} color={color.primary} />
        </Pressable>
      </View>

      <KeyboardFormLayout
        headerInset={52}
        contentContainerStyle={styles.scroll}
        scrollViewProps={{ keyboardDismissMode: 'interactive' }}
      >
        <View style={styles.card}>
          <Text variant="caption" color="textMuted">WORKER</Text>
          <Text variant="title" color="text" style={{ marginTop: 4 }}>{record.labourName}</Text>
          <Text variant="meta" color="textMuted" style={{ marginTop: 2 }}>
            {record.labourRole}
            {record.payRate ? ` · ₹${record.payRate}/${record.payUnit === 'hour' ? 'hr' : 'day'}` : ''}
          </Text>
          {!!record.description && (
            <Text variant="meta" color="textMuted" style={{ marginTop: 8 }}>
              {record.description}
            </Text>
          )}
        </View>

        {monthlyBreakdown.length === 0 ? (
          <View style={styles.card}>
            <Text variant="caption" color="textMuted">ATTENDANCE</Text>
            <Text variant="meta" color="textMuted" style={{ marginTop: 8 }}>
              No attendance marked yet for this person on this project.
              Open the Attendance tab and mark Present / Half / Absent
              against any date.
            </Text>
          </View>
        ) : (
          monthlyBreakdown.map(({ key, label, totals, days }) => (
            <View key={key} style={styles.card}>
              <Text variant="caption" color="textMuted">{label.toUpperCase()} TOTAL</Text>
              <View style={styles.summaryGrid}>
                <Chip label={`${totals.present} Present`} tone="success" />
                <Chip label={`${totals.half} Half`} tone="warning" />
                <Chip label={`${totals.absent} Absent`} tone="danger" />
              </View>
              <View style={styles.metaRow}>
                <Text variant="meta" color="textMuted">Days Marked</Text>
                <Text variant="metaStrong" color="text">{totals.days}</Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.metaRow}>
                <Text variant="meta" color="textMuted">Payable Units</Text>
                <Text variant="metaStrong" color="text">{totals.units.toFixed(1)}</Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.metaRow}>
                <Text variant="meta" color="textMuted">Estimated Hours</Text>
                <Text variant="metaStrong" color="text">{totals.hours}</Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.metaRow}>
                <Text variant="meta" color="textMuted">Total Amount</Text>
                <Text variant="metaStrong" color="primary">{formatInr(totals.payable)}</Text>
              </View>

              {/* Per-day breakdown: which dates were marked + status. */}
              <View style={styles.daysHeader}>
                <Text variant="caption" color="textMuted">DAYS</Text>
              </View>
              {days.map((d, i) => (
                <View key={d.id ?? `${d.date}-${i}`}>
                  {i > 0 ? <View style={styles.metaDivider} /> : null}
                  <View style={styles.dayRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="metaStrong" color="text">{formatDayLabel(d.date)}</Text>
                    </View>
                    <StatusPill status={d.status} />
                  </View>
                </View>
              ))}
            </View>
          ))
        )}

        <View style={styles.card}>
          <Text variant="caption" color="textMuted" style={{ marginBottom: 8 }}>ACTIONS</Text>
          <Pressable onPress={onToggleDisable} style={styles.actionRow}>
            <Ionicons
              name={record.disabled ? 'checkmark-circle-outline' : 'pause-circle-outline'}
              size={18}
              color={record.disabled ? color.success : color.warning}
            />
            <Text variant="metaStrong" color="text">
              {record.disabled ? 'Enable this person' : 'Disable this person'}
            </Text>
          </Pressable>
          <View style={styles.metaDivider} />
          <Pressable onPress={onDeleteLabour} style={styles.actionRow}>
            <Ionicons name="trash-outline" size={18} color={color.danger} />
            <Text variant="metaStrong" color="danger">Delete this person from database</Text>
          </Pressable>
        </View>

      </KeyboardFormLayout>

      <Modal
        visible={showEdit}
        transparent
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => !saving && setShowEdit(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={0}
        >
          <Pressable style={styles.overlay} onPress={() => !saving && setShowEdit(false)}>
            <View />
          </Pressable>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text variant="bodyStrong" color="text" style={styles.sheetTitle}>Edit Labour Details</Text>
            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <TextField
              label="Labour Name"
              value={editingName}
              onChangeText={setEditingName}
              square
              strongBorder
            />
            <TextField
              label="Worker Detail"
              value={editingRole}
              onChangeText={setEditingRole}
              square
              strongBorder
            />
            <TextField
              label="Description"
              value={editingDescription}
              onChangeText={setEditingDescription}
              multiline
              square
              strongBorder
            />
            <TextField
              label="Pay Amount"
              value={editingPayRate}
              onChangeText={(t) => setEditingPayRate(t.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              square
              strongBorder
            />
            <Text variant="caption" color="textMuted" style={{ marginTop: 8, marginBottom: 6 }}>
              PAY UNIT
            </Text>
            <View style={styles.unitRow}>
              <Pressable
                onPress={() => setEditingPayUnit('day')}
                style={[styles.unitBtn, editingPayUnit === 'day' && styles.unitBtnActive]}
              >
                <Text variant="caption" style={{ color: editingPayUnit === 'day' ? color.onPrimary : color.text }}>
                  Per day
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setEditingPayUnit('hour')}
                style={[styles.unitBtn, editingPayUnit === 'hour' && styles.unitBtnActive]}
              >
                <Text variant="caption" style={{ color: editingPayUnit === 'hour' ? color.onPrimary : color.text }}>
                  Per hour
                </Text>
              </Pressable>
            </View>
          </ScrollView>
          <View style={styles.sheetFooter}>
            <Button label="Save Changes" onPress={saveEdit} loading={saving} />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger';
}) {
  const cfg = {
    success: { bg: color.successSoft, fg: color.success },
    warning: { bg: color.warningSoft, fg: color.warning },
    danger: { bg: color.dangerSoft, fg: color.danger },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
      <Text variant="caption" style={{ color: cfg.fg }}>{label}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: AttendanceRecord['status'] }) {
  // Covers every member of AttendanceStatus
  // ('present' | 'absent' | 'half_day' | 'paid_leave' | 'week_off').
  const cfg: Record<AttendanceRecord['status'], { bg: string; fg: string; label: string }> = {
    present:    { bg: color.successSoft, fg: color.success,   label: 'PRESENT' },
    half_day:   { bg: color.warningSoft, fg: color.warning,   label: 'HALF' },
    absent:     { bg: color.dangerSoft,  fg: color.danger,    label: 'ABSENT' },
    paid_leave: { bg: color.infoSoft,    fg: color.info,      label: 'LEAVE' },
    week_off:   { bg: color.surfaceAlt,  fg: color.textMuted, label: 'OFF' },
  };
  const entry = cfg[status] ?? { bg: color.surface, fg: color.textMuted, label: String(status ?? '').toUpperCase() };
  return (
    <View style={[styles.statusPill, { backgroundColor: entry.bg }]}>
      <Text variant="caption" style={{ color: entry.fg, letterSpacing: 0.8 }}>
        {entry.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: 2,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navTitle: { textAlign: 'center' },
  scroll: { padding: screenInset, paddingBottom: 80, gap: space.sm },
  card: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    padding: space.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  daysHeader: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  metaDivider: { height: 1, backgroundColor: color.borderStrong },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    paddingTop: 8,
    paddingBottom: 16,
    maxHeight: '82%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.borderStrong,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: { textAlign: 'center', marginBottom: 8 },
  sheetBody: { paddingHorizontal: screenInset, gap: 10, paddingBottom: 8 },
  unitRow: { flexDirection: 'row', gap: 8 },
  unitBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  unitBtnActive: { backgroundColor: color.primary, borderColor: color.primary },
  sheetFooter: {
    paddingHorizontal: screenInset,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
});
