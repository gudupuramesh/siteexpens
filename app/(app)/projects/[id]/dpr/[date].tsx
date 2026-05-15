/**
 * DPR — Daily Progress Report (v2 design).
 *
 * One doc per project+date (`${projectId}_${date}`). Snapshots staff +
 * material-request totals at save time so the doc reads cleanly later
 * even after the underlying data shifts.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Daily report" + pretty date · circular trash btn (when existing)
 *   2. Combined Staff / Materials / Value KPI tile (hairline-divided)
 *   3. FormGroup "Notes" — 3 multiline InputRows (Work done · Issues · Tomorrow's plan)
 *   4. Staff section — surface card with attendance rows + estimated payroll footer
 *   5. Materials section — surface cards per material request with item lines
 *   6. Tasks on this day — surface card with task rows (progress bar + status pill)
 *   7. Timeline updates — author rows with delta + photos
 *   8. Site photos — surface card with thumb grid + Gallery/Camera dashed buttons
 *   9. Footer — Share PDF (existing only) + Save / Update DPR
 *
 * Preserves all data flow: `useDpr`, `useAttendance`, `useMaterialRequests`,
 * `useTasks`, `useProjectTaskUpdatesForDate`, the upsert/delete pipeline,
 * the `commitStagedFiles` R2 upload pipeline, and PDF export via
 * `generateAndShareWebPdf`.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  attendanceStatusLabel,
  estimatedPayForAttendanceRecord,
  formatAttendanceRateLabel,
  formatEstimatedPayLabel,
  sumEstimatedPay,
} from '@/src/features/attendance/dayPayEstimate';
import { useAttendance } from '@/src/features/attendance/useAttendance';
import { useAuth } from '@/src/features/auth/useAuth';
import { deleteDpr, dprDocId, upsertDpr } from '@/src/features/dpr/dpr';
import {
  getCategoryLabel,
  parseDayBounds,
  previousProgressForUpdate,
  startOfLocalDay,
  taskOverlapsSelectedDay,
  taskStatusPill,
} from '@/src/features/dpr/dprDay';
import { buildDprHtml } from '@/src/features/dpr/dprPdfHtml';
import type { MaterialRequestStatus } from '@/src/features/materialRequests/types';
import { useDpr } from '@/src/features/dpr/useDpr';
import { useMaterialRequests } from '@/src/features/materialRequests/useMaterialRequests';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useProject } from '@/src/features/projects/useProject';
import { generateAndShareWebPdf } from '@/src/features/projects/reports/generatePdf';
import type { Task } from '@/src/features/tasks/types';
import { useProjectTaskUpdatesForDate } from '@/src/features/tasks/useProjectTaskUpdatesForDate';
import { useTasks } from '@/src/features/tasks/useTasks';
import { guessImageMimeType } from '@/src/lib/r2Upload';
import {
  commitStagedFiles,
  makeStagedFile,
  type StagedFile,
} from '@/src/lib/commitStagedFiles';
import { formatInr } from '@/src/lib/format';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Text } from '@/src/ui/v2/Text';
import { inrCompact, useThemeV2 } from '@/src/theme/v2';

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function prettyDate(s: string): string {
  try {
    return parseDate(s).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

function fmtTaskTs(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function materialRequestStatusLabel(status: MaterialRequestStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending':
      return 'Pending';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

function statusToneFor(status: MaterialRequestStatus): 'blue' | 'green' | 'orange' | 'red' | 'yellow' {
  switch (status) {
    case 'approved':
      return 'green';
    case 'pending':
      return 'orange';
    case 'rejected':
      return 'red';
    case 'draft':
      return 'yellow';
    default:
      return 'blue';
  }
}

export default function DprScreen() {
  const t = useThemeV2();
  const { id: projectId, date: dateStr } = useLocalSearchParams<{ id: string; date: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const { data: project } = useProject(projectId);
  const orgId = project?.orgId ?? userDoc?.primaryOrgId ?? '';
  const { data: existing, loading } = useDpr(projectId, dateStr);
  const { data: attendanceRecords, summary: attSummary } = useAttendance(
    projectId,
    dateStr,
    orgId || undefined,
  );
  const { data: materialRequests } = useMaterialRequests(projectId);
  const { data: tasks } = useTasks(projectId);

  const taskRefs = useMemo(
    () => tasks.map((task) => ({ id: task.id, title: task.title })),
    [tasks],
  );

  const { data: dayUpdates } = useProjectTaskUpdatesForDate(projectId, dateStr, taskRefs);

  const calendarTodayStart = startOfLocalDay(new Date());
  const bounds = parseDayBounds(dateStr);

  const requestsToday = useMemo(() => {
    const key = dateStr;
    return materialRequests.filter((r) => {
      if (r.status === 'rejected') return false;
      if (!r.createdAt) return false;
      const dk = `${r.createdAt.toDate().getFullYear()}-${String(r.createdAt.toDate().getMonth() + 1).padStart(2, '0')}-${String(r.createdAt.toDate().getDate()).padStart(2, '0')}`;
      return dk === key;
    });
  }, [materialRequests, dateStr]);

  const requestsTodayCount = requestsToday.length;
  const requestsTodayValue = requestsToday.reduce((s, r) => s + (r.totalValue ?? 0), 0);

  const staffSorted = useMemo(
    () => [...attendanceRecords].sort((a, b) => a.labourName.localeCompare(b.labourName)),
    [attendanceRecords],
  );

  const staffPayTotal = useMemo(() => sumEstimatedPay(attendanceRecords), [attendanceRecords]);

  const pdfStaffRows = useMemo(
    () =>
      staffSorted.map((r) => ({
        name: r.labourName,
        role: r.labourRole || '—',
        statusLabel: attendanceStatusLabel(r.status),
        rateLabel: formatAttendanceRateLabel(r),
        estPayLabel: formatEstimatedPayLabel(estimatedPayForAttendanceRecord(r)),
      })),
    [staffSorted],
  );

  const pdfMaterialSections = useMemo(
    () =>
      requestsToday.map((req) => ({
        title: req.title,
        statusLabel: materialRequestStatusLabel(req.status),
        totalLabel: formatInr(req.totalValue ?? 0),
        itemLines: req.items.map(
          (it) =>
            `${it.name} · ${it.quantity} ${it.unit} × ${formatInr(it.rate)} = ${formatInr(it.totalCost)}`,
        ),
      })),
    [requestsToday],
  );

  const staffEstPayTotalLabel =
    staffPayTotal != null ? formatInr(staffPayTotal) : undefined;

  const taskIdsUpdatedToday = useMemo(
    () => new Set(dayUpdates.map((u) => u.taskId)),
    [dayUpdates],
  );

  const siteTasks = useMemo(() => {
    if (!bounds) return [];
    const { dayStart, dayEndExclusive } = bounds;
    const map = new Map<string, Task>();
    for (const task of tasks) {
      if (
        taskOverlapsSelectedDay(task, dayStart, dayEndExclusive) ||
        taskIdsUpdatedToday.has(task.id)
      ) {
        map.set(task.id, task);
      }
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, bounds, taskIdsUpdatedToday]);

  const [workDone, setWorkDone] = useState('');
  const [issues, setIssues] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [savePhase, setSavePhase] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (loading) return;
    if (existing) {
      setWorkDone(existing.workDone ?? '');
      setIssues(existing.issues ?? '');
      setTomorrowPlan(existing.tomorrowPlan ?? '');
      setExistingPhotos(existing.photoUris ?? []);
    }
    setHydrated(true);
  }, [existing, loading, hydrated]);

  const stageAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const newEntries = assets.map((a) =>
      makeStagedFile({
        localUri: a.uri,
        contentType: a.mimeType || guessImageMimeType(a.uri),
      }),
    );
    setStaged((prev) => [...prev, ...newEntries]);
  };

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo access is required to attach images.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (!res.canceled) stageAssets(res.assets);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled) stageAssets(res.assets);
  };

  function removeExistingPhoto(url: string) {
    setExistingPhotos((prev) => prev.filter((u) => u !== url));
  }
  function removeStagedPhoto(id: string) {
    setStaged((prev) => prev.filter((p) => p.id !== id));
  }

  const openTask = (taskId: string) => {
    router.push(`/(app)/projects/${projectId}/task/${taskId}` as never);
  };

  const onSharePdf = async () => {
    if (!existing || !project) {
      Alert.alert('Save first', 'Save the DPR once before sharing a PDF.');
      return;
    }
    setPdfBusy(true);
    try {
      const photoUris = [...existingPhotos, ...staged.map((s) => s.localUri)];
      const html = buildDprHtml({
        projectName: project.name,
        projectAddress: project.siteAddress ?? '',
        reportDateLabel: prettyDate(dateStr),
        generatedOnLabel: new Date().toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        staffPresent: attSummary.present,
        staffTotal: attSummary.total,
        materialRequestedCount: requestsTodayCount,
        materialRequestedValueLabel: formatInr(requestsTodayValue),
        workDone,
        issues,
        tomorrowPlan,
        staffRows: pdfStaffRows,
        ...(staffEstPayTotalLabel ? { staffEstPayTotalLabel } : {}),
        materialSections: pdfMaterialSections,
        tasks: siteTasks.map((task) => ({
          title: task.title,
          category: getCategoryLabel(task.category),
          assignee: task.assignedToName ?? '',
          start: fmtTaskTs(task.startDate),
          end: task.endDate ? fmtTaskTs(task.endDate) : '—',
          progress: Math.round(Math.max(0, Math.min(100, task.progress ?? 0))),
          statusLabel: taskStatusPill(task, calendarTodayStart).label,
          description: task.description?.trim() ?? '',
        })),
        updates: dayUpdates.map((row) => {
          const prev = previousProgressForUpdate(row, dayUpdates);
          const delta = row.progress - prev;
          const deltaPrefix = delta === 0 ? '' : `${delta > 0 ? '+' : ''}${delta}% → `;
          const photos = row.photoUris ?? [];
          return {
            author: row.authorName,
            taskTitle: row.taskTitle,
            deltaPrefix,
            progress: row.progress,
            note: row.text?.trim() ?? '',
            photoCount: photos.length,
            photoUris: photos,
          };
        }),
        photoUris,
      });

      const safeProject = project.name.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 40) || 'Project';
      const res = await generateAndShareWebPdf({
        html,
        filename: `${safeProject}-DPR-${dateStr}`,
        dialogTitle: 'Share DPR PDF',
      });
      if (!res.ok) {
        Alert.alert('PDF', res.reason);
      }
    } catch (err) {
      Alert.alert('PDF', (err as Error).message);
    } finally {
      setPdfBusy(false);
    }
  };

  const onSave = async () => {
    if (!user || !orgId || !projectId || !dateStr) return;
    setSaving(true);
    try {
      let newUploadedUrls: string[] = [];
      let failedCount = 0;
      if (staged.length > 0) {
        setSavePhase(`Uploading 0 of ${staged.length}…`);
        const { uploaded, failed } = await commitStagedFiles({
          files: staged,
          kind: 'dpr',
          refId: dateStr,
          projectId,
          compress: 'balanced',
          onProgress: (done, total) => setSavePhase(`Uploading ${done} of ${total}…`),
        });
        newUploadedUrls = uploaded.map((u) => u.publicUrl);
        failedCount = failed.length;
        if (uploaded.length === 0 && failed.length > 0) {
          Alert.alert(
            'Uploads failed',
            `All ${failed.length} new photo(s) failed to upload. Tap Save again to retry.`,
          );
          setSavePhase(undefined);
          setSaving(false);
          return;
        }
      }

      setSavePhase('Saving DPR…');
      await upsertDpr({
        orgId,
        projectId,
        date: dateStr,
        workDone: workDone.trim(),
        weather: 'other',
        weatherNote: '',
        issues: issues.trim(),
        tomorrowPlan: tomorrowPlan.trim(),
        photoUris: [...existingPhotos, ...newUploadedUrls],
        staffPresent: attSummary.present,
        staffTotal: attSummary.total,
        materialRequestedCount: requestsTodayCount,
        materialRequestedValue: requestsTodayValue,
        materialReceivedCount: 0,
        materialUsedCount: 0,
        createdBy: user.uid,
        isUpdate: !!existing,
      });
      if (failedCount > 0) {
        Alert.alert(
          'Some uploads failed',
          `${failedCount} of ${staged.length} new photo(s) failed. The DPR was saved with the rest.`,
        );
      }
      // Wait briefly so the parent screen's onSnapshot listener catches
      // the just-written DPR doc before navigation completes.
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
      setSavePhase(undefined);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Delete report?', 'This will remove the DPR for this date.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDpr(dprDocId(projectId, dateStr));
            router.back();
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  };

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="label">
            Daily report
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            {prettyDate(dateStr).toUpperCase()}
          </Text>
        </View>
        {existing ? (
          <Pressable
            onPress={onDelete}
            hitSlop={10}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                borderRadius: 999,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="trash-outline" size={16} color={t.palette.red.base} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {/* Snapshot tile */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View
              style={[
                styles.snapCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <SnapCol
                label="STAFF"
                value={`${attSummary.present}/${attSummary.total || 0}`}
                color={t.palette.green.base}
              />
              <View style={[styles.snapDivider, { backgroundColor: t.colors.separator }]} />
              <SnapCol
                label="MATERIAL"
                value={String(requestsTodayCount)}
                color={t.palette.blue.base}
              />
              <View style={[styles.snapDivider, { backgroundColor: t.colors.separator }]} />
              <SnapCol
                label="VALUE"
                value={inrCompact(requestsTodayValue)}
                color={t.palette.orange.base}
              />
            </View>
          </View>

          {/* Notes */}
          <FormGroup header="Notes">
            <InputRow
              label="Work done"
              value={workDone}
              onChangeText={setWorkDone}
              placeholder="Describe what was completed on site today…"
              multiline
            />
            <InputRow
              label="Issues / delays"
              value={issues}
              onChangeText={setIssues}
              placeholder="Manpower shortage, material delay, etc."
              multiline
            />
            <InputRow
              label="Tomorrow's plan"
              value={tomorrowPlan}
              onChangeText={setTomorrowPlan}
              placeholder="Planned activities for the next working day"
              multiline
              divider={false}
            />
          </FormGroup>

          {/* Staff */}
          <Section header="Staff" count={staffSorted.length}>
            {staffSorted.length === 0 ? (
              <EmptyRow text="No attendance marked for this date" icon="people-outline" />
            ) : (
              <>
                {staffSorted.map((r, idx) => {
                  const est = estimatedPayForAttendanceRecord(r);
                  const statusTone = (() => {
                    if (r.status === 'present') return t.palette.green;
                    if (r.status === 'half_day') return t.palette.orange;
                    if (r.status === 'absent') return t.palette.red;
                    // Fallback (e.g. 'leave' or unknown) → orange (pending),
                    // since yellow isn't in our 4-colour palette.
                    return t.palette.orange;
                  })();
                  const last = idx === staffSorted.length - 1 && staffPayTotal == null;
                  return (
                    <View
                      key={r.id}
                      style={[
                        styles.staffRow,
                        { position: 'relative' },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          variant="body"
                          color="label"
                         
                          numberOfLines={1}
                        >
                          {r.labourName}
                        </Text>
                        <Text
                          variant="caption1"
                          color="secondary"
                          style={{ marginTop: 2 }}
                          numberOfLines={1}
                        >
                          {r.labourRole || '—'} · {formatAttendanceRateLabel(r)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                        <View
                          style={[
                            styles.statusPill,
                            {
                              backgroundColor:
                                t.mode === 'dark' ? statusTone.softDark : statusTone.soft,
                              borderRadius: 999,
                            },
                          ]}
                        >
                          <Text
                            variant="caption2"
                            style={{
                              color: statusTone.base,
                              fontWeight: '700',
                              letterSpacing: 0.4,
                            }}
                          >
                            {attendanceStatusLabel(r.status).toUpperCase()}
                          </Text>
                        </View>
                        <Text
                          variant="caption1"
                          color="label"
                          style={{ marginTop: 4, fontWeight: '600' }}
                        >
                          {formatEstimatedPayLabel(est)}
                        </Text>
                      </View>
                      {!last ? (
                        <View
                          style={[
                            styles.rowDivider,
                            { backgroundColor: t.colors.separator, left: 16 },
                          ]}
                        />
                      ) : null}
                    </View>
                  );
                })}
                {staffPayTotal != null ? (
                  <View style={styles.staffTotalRow}>
                    <Text variant="footnote" color="secondary">
                      Estimated payroll
                    </Text>
                    <Text
                      variant="footnote"
                      style={{ color: t.palette.blue.base, fontWeight: '700' }}
                    >
                      {formatInr(staffPayTotal)}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </Section>

          {/* Materials */}
          <Section header="Material requests" count={requestsToday.length}>
            {requestsToday.length === 0 ? (
              <EmptyRow
                text="No material requests created this day"
                icon="cube-outline"
              />
            ) : (
              requestsToday.map((req, idx) => {
                const tone = t.palette[statusToneFor(req.status)];
                const isLast = idx === requestsToday.length - 1;
                return (
                  <View
                    key={req.id}
                    style={[
                      styles.matCard,
                      { position: 'relative' },
                    ]}
                  >
                    <View style={styles.matHead}>
                      <Text
                        variant="body"
                        color="label"
                        style={{ flex: 1, fontWeight: '700' }}
                        numberOfLines={2}
                      >
                        {req.title}
                      </Text>
                      <View
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor:
                              t.mode === 'dark' ? tone.softDark : tone.soft,
                            borderRadius: 999,
                            marginLeft: 8,
                          },
                        ]}
                      >
                        <Text
                          variant="caption2"
                          style={{
                            color: tone.base,
                            fontWeight: '700',
                            letterSpacing: 0.4,
                          }}
                        >
                          {materialRequestStatusLabel(req.status).toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text
                      variant="callout"
                      style={{
                        color: t.palette.blue.base,
                        fontWeight: '700',
                        marginTop: 4,
                      }}
                    >
                      {formatInr(req.totalValue ?? 0)}
                    </Text>
                    <View style={{ marginTop: 8, gap: 4 }}>
                      {req.items.map((it, itemIdx) => (
                        <Text
                          key={`${req.id}-it-${itemIdx}`}
                          variant="caption1"
                          color="secondary"
                          numberOfLines={2}
                        >
                          • {it.name} · {it.quantity} {it.unit} ×{' '}
                          {formatInr(it.rate)} = {formatInr(it.totalCost)}
                        </Text>
                      ))}
                    </View>
                    {!isLast ? (
                      <View
                        style={[
                          styles.rowDivider,
                          { backgroundColor: t.colors.separator, left: 16 },
                        ]}
                      />
                    ) : null}
                  </View>
                );
              })
            )}
          </Section>

          {/* Tasks on this day */}
          <Section header="Tasks on this day" count={siteTasks.length}>
            {siteTasks.length === 0 ? (
              <EmptyRow
                text="No tasks active or updated on this day"
                icon="list-outline"
              />
            ) : (
              siteTasks.map((task, idx) => {
                const pill = taskStatusPill(task, calendarTodayStart);
                const pct = Math.max(0, Math.min(100, task.progress ?? 0));
                const isLast = idx === siteTasks.length - 1;
                return (
                  <Pressable
                    key={task.id}
                    onPress={() => openTask(task.id)}
                    style={({ pressed }) => [
                      styles.taskRow,
                      pressed && { backgroundColor: t.colors.fill3 },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.taskTitleRow}>
                        <Text
                          variant="body"
                          color="label"
                          style={{ flex: 1, fontWeight: '600' }}
                          numberOfLines={1}
                        >
                          {task.title}
                        </Text>
                        <View
                          style={[
                            styles.statusPill,
                            { backgroundColor: pill.bg, borderRadius: 999, marginLeft: 8 },
                          ]}
                        >
                          <Text
                            variant="caption2"
                            style={{ color: pill.fg, fontWeight: '700', letterSpacing: 0.4 }}
                          >
                            {pill.label.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text
                        variant="caption1"
                        color="secondary"
                        style={{ marginTop: 2 }}
                        numberOfLines={2}
                      >
                        {getCategoryLabel(task.category)}
                        {task.assignedToName ? ` · ${task.assignedToName}` : ''}
                        {' · '}
                        {fmtTaskTs(task.startDate)} → {task.endDate ? fmtTaskTs(task.endDate) : '—'}
                      </Text>
                      {!!task.description?.trim() && (
                        <Text
                          variant="caption1"
                          color="secondary"
                          style={{ marginTop: 4 }}
                          numberOfLines={3}
                        >
                          {task.description.trim()}
                        </Text>
                      )}
                      {/* Progress bar */}
                      <View style={styles.progressRow}>
                        <View
                          style={[
                            styles.progressTrack,
                            { backgroundColor: t.colors.fill3, borderRadius: 2 },
                          ]}
                        >
                          <View
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              backgroundColor: t.palette.blue.base,
                              borderRadius: 2,
                            }}
                          />
                        </View>
                        <Text
                          variant="caption1"
                          color="label"
                          style={{
                            marginLeft: 8,
                            minWidth: 32,
                            fontWeight: '600',
                            textAlign: 'right',
                          }}
                        >
                          {Math.round(pct)}%
                        </Text>
                      </View>
                    </View>
                    {!isLast ? (
                      <View
                        style={[
                          styles.rowDivider,
                          { backgroundColor: t.colors.separator, left: 16 },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </Section>

          {/* Timeline updates */}
          <Section header="Timeline updates" count={dayUpdates.length}>
            {dayUpdates.length === 0 ? (
              <EmptyRow
                text="No progress posts for this date"
                icon="chatbubbles-outline"
              />
            ) : (
              dayUpdates.map((row, idx) => {
                const prev = previousProgressForUpdate(row, dayUpdates);
                const delta = row.progress - prev;
                const deltaLabel = delta === 0 ? '' : `${delta > 0 ? '+' : ''}${delta}% → `;
                const initial = (row.authorName.charAt(0) || '?').toUpperCase();
                const isLast = idx === dayUpdates.length - 1;
                return (
                  <Pressable
                    key={`${row.taskId}-${row.id}`}
                    onPress={() => openTask(row.taskId)}
                    style={({ pressed }) => [
                      styles.updateRow,
                      pressed && { backgroundColor: t.colors.fill3 },
                    ]}
                  >
                    <View
                      style={[
                        styles.updateAvatar,
                        {
                          backgroundColor:
                            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                          borderRadius: t.radii.tile,
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
                    <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                      <Text
                        variant="caption1"
                        color="secondary"
                        numberOfLines={1}
                      >
                        {row.authorName}
                      </Text>
                      <Text
                        variant="body"
                        color="label"
                        style={{ fontWeight: '600', marginTop: 1 }}
                        numberOfLines={1}
                      >
                        {row.taskTitle}
                      </Text>
                      <Text
                        variant="caption1"
                        style={{
                          color: t.palette.blue.base,
                          fontWeight: '700',
                          marginTop: 2,
                        }}
                      >
                        {deltaLabel}
                        {row.progress}%
                      </Text>
                      {!!row.text?.trim() && (
                        <Text
                          variant="caption1"
                          color="secondary"
                          style={{ marginTop: 4 }}
                          numberOfLines={3}
                        >
                          {row.text}
                        </Text>
                      )}
                      {row.photoUris && row.photoUris.length > 0 ? (
                        <ScrollView
                          horizontal
                          nestedScrollEnabled
                          showsHorizontalScrollIndicator={false}
                          style={{ marginTop: 8, maxHeight: 64 }}
                          contentContainerStyle={{
                            flexDirection: 'row',
                            gap: 6,
                            paddingRight: 8,
                          }}
                        >
                          {row.photoUris.map((uri) => (
                            <Image
                              key={uri}
                              source={{ uri }}
                              style={[
                                styles.updatePhoto,
                                { borderRadius: t.radii.tile },
                              ]}
                            />
                          ))}
                        </ScrollView>
                      ) : null}
                    </View>
                    {!isLast ? (
                      <View
                        style={[
                          styles.rowDivider,
                          { backgroundColor: t.colors.separator, left: 60 },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </Section>

          {/* Site photos */}
          <Section
            header="Site photos"
            count={existingPhotos.length + staged.length}
          >
            <View style={styles.photoArea}>
              <View style={styles.photoRow}>
                {existingPhotos.map((url) => (
                  <View key={`exist-${url}`} style={styles.photoThumbWrap}>
                    <Image
                      source={{ uri: url }}
                      style={[
                        styles.photoThumb,
                        { borderRadius: t.radii.tile },
                      ]}
                    />
                    <Pressable
                      onPress={() => removeExistingPhoto(url)}
                      style={[
                        styles.photoClose,
                        { backgroundColor: t.palette.red.base },
                      ]}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {staged.map((p) => (
                  <View key={p.id} style={styles.photoThumbWrap}>
                    <Image
                      source={{ uri: p.localUri }}
                      style={[
                        styles.photoThumb,
                        { borderRadius: t.radii.tile },
                      ]}
                    />
                    <Pressable
                      onPress={() => removeStagedPhoto(p.id)}
                      style={[
                        styles.photoClose,
                        { backgroundColor: t.palette.red.base },
                      ]}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                <PhotoBtn
                  label="Gallery"
                  icon="images-outline"
                  onPress={() => void pickPhotos()}
                />
                <PhotoBtn
                  label="Camera"
                  icon="camera-outline"
                  onPress={() => void takePhoto()}
                />
              </View>
            </View>
          </Section>
        </ScrollView>

        {/* Footer */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: t.colors.surface,
              borderTopColor: t.colors.separator,
              borderTopWidth: t.hairline,
            },
          ]}
        >
          {existing ? (
            <Pressable
              onPress={() => void onSharePdf()}
              disabled={pdfBusy || !project}
              style={({ pressed }) => [
                styles.footerBtn,
                {
                  backgroundColor: cardBg,
                  borderRadius: 999,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
                (pdfBusy || !project) && { opacity: 0.5 },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={16}
                color={t.colors.label}
              />
              <Text
                variant="callout"
                color="label"
                style={{ fontWeight: '700', marginLeft: 8 }}
              >
                {pdfBusy ? 'Building…' : 'Share PDF'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void onSave()}
            disabled={saving}
            style={({ pressed }) => [
              styles.footerBtn,
              {
                backgroundColor: t.palette.blue.base,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
              saving && { opacity: 0.7 },
            ]}
          >
            <Text
              variant="callout"
              style={{ color: '#fff', fontWeight: '700' }}
            >
              {savePhase ?? (existing ? 'Update report' : 'Save report')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SubmitProgressOverlay
        visible={saving}
        intent="saveDpr"
        phaseLabel={savePhase}
      />
    </View>
  );
}

function Section({
  header,
  count,
  children,
}: {
  header: string;
  count: number;
  children: React.ReactNode;
}) {
  const t = useThemeV2();
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
    <View style={{ marginTop: 24 }}>
      <View style={styles.sectionHeader}>
        <Text variant="caption2" color="secondary" style={{ letterSpacing: 0.4 }}>
          {header.toUpperCase()}
        </Text>
        <Text variant="caption2" color="tertiary">
          {count}
        </Text>
      </View>
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.group,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function SnapCol({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.snapCol}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text
        variant="title3"
        style={{ color, marginTop: 4, fontWeight: '700' }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

function EmptyRow({
  text,
  icon,
}: {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const t = useThemeV2();
  return (
    <View style={styles.emptyRow}>
      <Ionicons name={icon} size={20} color={t.colors.tertiary} />
      <Text
        variant="callout"
        color="secondary"
        style={{ marginLeft: 10, flex: 1 }}
      >
        {text}
      </Text>
    </View>
  );
}

function PhotoBtn({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.photoBtn,
        {
          backgroundColor:
            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
          borderRadius: t.radii.tile,
          borderColor: t.palette.blue.base + '33',
          borderWidth: t.hairline,
          borderStyle: 'dashed',
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={icon} size={20} color={t.palette.blue.base} />
      <Text
        variant="caption2"
        style={{
          color: t.palette.blue.base,
          fontWeight: '700',
          marginTop: 2,
          letterSpacing: 0.4,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Snap card
  snapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  snapCol: { flex: 1, alignItems: 'center' },
  snapDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 10,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 7,
  },
  sectionCard: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },

  // Staff row
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 60,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  staffTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },

  // Material card
  matCard: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  matHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Task row
  taskRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    overflow: 'hidden',
  },

  // Update row
  updateRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
  },
  updateAvatar: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatePhoto: {
    width: 56,
    height: 56,
  },

  // Empty row inside section card
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 56,
  },

  // Divider
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  // Photos
  photoArea: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 80, height: 80 },
  photoClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtn: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    gap: 8,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});
