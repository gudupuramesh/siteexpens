/**
 * DPR — Daily Progress Report form. One doc per project+date (`${projectId}_${date}`).
 * Snapshots staff + material-request totals at save time.
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
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

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

export default function DprScreen() {
  const { id: projectId, date: dateStr } = useLocalSearchParams<{ id: string; date: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const { data: project } = useProject(projectId);
  /** Prefer project canon — must match rules `canSeeProject` / org gates. */
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
    () => tasks.map((t) => ({ id: t.id, title: t.title })),
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
        tasks: siteTasks.map((t) => ({
          title: t.title,
          category: getCategoryLabel(t.category),
          assignee: t.assignedToName ?? '',
          start: fmtTaskTs(t.startDate),
          end: t.endDate ? fmtTaskTs(t.endDate) : '—',
          progress: Math.round(Math.max(0, Math.min(100, t.progress ?? 0))),
          statusLabel: taskStatusPill(t, calendarTodayStart).label,
          description: t.description?.trim() ?? '',
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

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navTitleWrap}>
          <Text variant="bodyStrong" color="text">DPR</Text>
          <Text variant="caption" color="textMuted">{prettyDate(dateStr)}</Text>
        </View>
        {existing ? (
          <Pressable onPress={onDelete} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="trash-outline" size={20} color={color.danger} />
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Text variant="caption" color="textMuted" style={styles.label}>TODAY&apos;S SNAPSHOT</Text>
          <View style={styles.snapRow}>
            <View style={styles.snapCard}>
              <Ionicons name="people" size={18} color={color.primary} />
              <Text variant="title" color="text">{attSummary.present}</Text>
              <Text variant="caption" color="textMuted">Staff present</Text>
            </View>
            <View style={styles.snapCard}>
              <Ionicons name="clipboard-outline" size={18} color={color.success} />
              <Text variant="title" color="text">{requestsTodayCount}</Text>
              <Text variant="caption" color="textMuted">Material requested</Text>
            </View>
            <View style={styles.snapCard}>
              <Ionicons name="cash-outline" size={18} color={color.primary} />
              <Text variant="title" color="text" style={{ fontSize: 14 }}>
                {formatInr(requestsTodayValue)}
              </Text>
              <Text variant="caption" color="textMuted">Material value</Text>
            </View>
          </View>

          <Text variant="caption" color="textMuted" style={styles.label}>
            STAFF ROSTER ({staffSorted.length})
          </Text>
          {staffSorted.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text variant="meta" color="textMuted">No attendance marked for this date.</Text>
            </View>
          ) : (
            <>
              {staffSorted.map((r) => {
                const est = estimatedPayForAttendanceRecord(r);
                return (
                  <View key={r.id} style={styles.staffCard}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="bodyStrong" color="text" numberOfLines={1}>
                        {r.labourName}
                      </Text>
                      <Text variant="caption" color="textMuted" numberOfLines={1}>
                        {r.labourRole || '—'} · {formatAttendanceRateLabel(r)}
                      </Text>
                    </View>
                    <View style={styles.staffCardRight}>
                      <View style={[styles.miniPill, { backgroundColor: color.surfaceAlt }]}>
                        <Text variant="caption" color="text">
                          {attendanceStatusLabel(r.status)}
                        </Text>
                      </View>
                      <Text variant="caption" color="text" style={{ marginTop: 6 }}>
                        {formatEstimatedPayLabel(est)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {staffPayTotal != null ? (
                <Text variant="caption" color="textMuted" style={styles.staffTotalLine}>
                  Estimated payroll (rated rows): {formatInr(staffPayTotal)}
                </Text>
              ) : null}
            </>
          )}

          <Text variant="caption" color="textMuted" style={styles.label}>
            MATERIAL REQUESTED (DETAIL)
          </Text>
          {requestsToday.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text variant="meta" color="textMuted">No material requests created this day.</Text>
            </View>
          ) : (
            requestsToday.map((req) => (
              <View key={req.id} style={styles.matCard}>
                <View style={styles.matCardHead}>
                  <Text variant="bodyStrong" color="text" style={{ flex: 1 }} numberOfLines={2}>
                    {req.title}
                  </Text>
                  <View style={[styles.miniPill, { backgroundColor: color.primarySoft }]}>
                    <Text variant="caption" color="primary">
                      {materialRequestStatusLabel(req.status)}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" color="primary" style={{ marginBottom: space.xs }}>
                  {formatInr(req.totalValue ?? 0)}
                </Text>
                {req.items.map((it, idx) => (
                  <Text key={`${req.id}-it-${idx}`} variant="meta" color="textMuted" numberOfLines={3}>
                    • {it.name} · {it.quantity} {it.unit} × {formatInr(it.rate)} ={' '}
                    {formatInr(it.totalCost)}
                  </Text>
                ))}
              </View>
            ))
          )}

          <TextField
            label="Work done today"
            placeholder="Describe what was completed on site today…"
            multiline
            value={workDone}
            onChangeText={setWorkDone}
          />

          <TextField
            label="Issues / delays"
            placeholder="Manpower shortage, material delay, etc."
            multiline
            value={issues}
            onChangeText={setIssues}
          />

          <TextField
            label="Tomorrow's plan"
            placeholder="Planned activities for the next working day"
            multiline
            value={tomorrowPlan}
            onChangeText={setTomorrowPlan}
          />

          <Text variant="caption" color="textMuted" style={styles.label}>
            TODAY&apos;S TASKS (ACTIVE OR UPDATED THIS DAY)
          </Text>
          {siteTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text variant="meta" color="textMuted">No tasks for this date.</Text>
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
                    <Text variant="caption" color="textMuted" numberOfLines={2}>
                      {getCategoryLabel(task.category)}
                      {task.assignedToName ? ` · ${task.assignedToName}` : ''}
                    </Text>
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {fmtTaskTs(task.startDate)} · {task.endDate ? fmtTaskTs(task.endDate) : '—'} ·{' '}
                      {Math.round(pct)}%
                    </Text>
                    {!!task.description?.trim() && (
                      <Text variant="meta" color="textMuted" numberOfLines={4}>
                        {task.description.trim()}
                      </Text>
                    )}
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

          <Text variant="caption" color="textMuted" style={styles.label}>
            TIMELINE UPDATES (THIS DAY)
          </Text>
          {dayUpdates.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text variant="meta" color="textMuted">No progress posts for this date.</Text>
            </View>
          ) : (
            dayUpdates.map((row) => {
              const prev = previousProgressForUpdate(row, dayUpdates);
              const delta = row.progress - prev;
              const deltaLabel = delta === 0 ? '' : `${delta > 0 ? '+' : ''}${delta}% → `;
              const initial = row.authorName.charAt(0).toUpperCase();
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
                      <Text variant="meta" color="textMuted" numberOfLines={3}>
                        {row.text}
                      </Text>
                    )}
                    {row.photoUris && row.photoUris.length > 0 ? (
                      <ScrollView
                        horizontal
                        nestedScrollEnabled
                        showsHorizontalScrollIndicator={false}
                        style={styles.updatePhotoScroll}
                        contentContainerStyle={styles.updatePhotoScrollInner}
                      >
                        {row.photoUris.map((uri) => (
                          <Image key={uri} source={{ uri }} style={styles.updatePhotoThumb} />
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}

          <Text variant="caption" color="textMuted" style={styles.label}>SITE PHOTOS</Text>
          <View style={styles.photoRow}>
            {existingPhotos.map((url) => (
              <View key={`exist-${url}`} style={styles.photoThumbWrap}>
                <Image source={{ uri: url }} style={styles.photoThumb} />
                <Pressable
                  onPress={() => removeExistingPhoto(url)}
                  style={styles.photoClose}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {staged.map((p) => (
              <View key={p.id} style={styles.photoThumbWrap}>
                <Image source={{ uri: p.localUri }} style={styles.photoThumb} />
                <Pressable
                  onPress={() => removeStagedPhoto(p.id)}
                  style={styles.photoClose}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={pickPhotos} style={styles.photoAdd}>
              <Ionicons name="images-outline" size={20} color={color.primary} />
              <Text variant="caption" color="primary">Gallery</Text>
            </Pressable>
            <Pressable onPress={takePhoto} style={styles.photoAdd}>
              <Ionicons name="camera-outline" size={20} color={color.primary} />
              <Text variant="caption" color="primary">Camera</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {existing ? (
            <Button
              variant="secondary"
              label="Share PDF"
              onPress={onSharePdf}
              loading={pdfBusy}
              disabled={!project}
              style={styles.footerBtn}
            />
          ) : null}
          <Button
            label={savePhase ?? (existing ? 'Update DPR' : 'Save DPR')}
            onPress={onSave}
            loading={saving}
            style={styles.footerBtn}
          />
        </View>
      </KeyboardAvoidingView>

      <SubmitProgressOverlay
        visible={saving}
        intent="saveDpr"
        phaseLabel={savePhase}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: space.xs,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitleWrap: { flex: 1, alignItems: 'center' },
  scroll: { paddingHorizontal: screenInset, paddingTop: space.md, paddingBottom: space.xl },
  label: { marginTop: space.md, marginBottom: space.xs },
  snapRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  snapCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
  },
  emptyCard: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
    marginBottom: space.sm,
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.sm,
    marginBottom: space.xs,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
  },
  staffCardRight: { alignItems: 'flex-end', maxWidth: '42%' },
  miniPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  staffTotalLine: { marginBottom: space.sm },
  matCard: {
    padding: space.sm,
    marginBottom: space.xs,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
  },
  matCardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginBottom: 4,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.sm,
    marginBottom: space.xs,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
  updatePhotoScroll: { marginTop: space.xs, maxHeight: 72 },
  updatePhotoScrollInner: { flexDirection: 'row', gap: 6, paddingRight: space.sm },
  updatePhotoThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: color.surfaceAlt,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: color.bgGrouped },
  photoClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
    gap: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  footerBtn: { flex: 1 },
});
