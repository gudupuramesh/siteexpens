/**
 * Add Task — v2 design.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "New milestone" · Save
 *   2. Title hero card — large editable title + status pill row
 *   3. FormGroup "Details" — Category (SelectSheet) · Description (multiline)
 *   4. FormGroup "Schedule" — Start date · End date (DateTimeSheet pickers)
 *   5. FormGroup "Assignee" — Party row (opens PartyPickerModal)
 *   6. Reference photos block — staged thumbnails + "Add photo" tile
 *
 * Photos are staged locally on pick — R2 upload happens during Save so
 * backing out leaves no orphans in the bucket. Default start date is
 * suggested from the latest existing milestone (day after) clamped to
 * today.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { startOfLocalDay } from '@/src/features/dpr/dprDay';
import { createTask } from '@/src/features/tasks/tasks';
import { createTaskCategory } from '@/src/features/tasks/taskCategories';
import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import {
  commitStagedFiles,
  makeStagedFile,
  type StagedFile,
} from '@/src/lib/commitStagedFiles';
import { useTaskCategories } from '@/src/features/tasks/useTaskCategories';
import { type TaskCategory, type TaskStatus, type Task } from '@/src/features/tasks/types';
import { useTasks } from '@/src/features/tasks/useTasks';
import { PartyPickerModal } from '@/src/ui/PartyPickerModal';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { formatDate } from '@/src/lib/format';
import { useThemeV2 } from '@/src/theme/v2';

import { CategorySheet } from '@/src/features/tasks/CategorySheet';

const STATUS_OPTIONS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'not_started', label: 'Not started' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
];

const schema = z.object({
  title: z.string().trim().min(2, 'Title required'),
  description: z.string().optional(),
  status: z.string().min(1, 'Select status'),
  category: z.string().min(1, 'Select category'),
});

type FormData = z.infer<typeof schema>;

function addCalendarDaysStart(d: Date, days: number): Date {
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  n.setDate(n.getDate() + days);
  return n;
}

function suggestedNextTaskStart(existing: Task[], today: Date): Date {
  const todayStart = startOfLocalDay(today).getTime();
  if (existing.length === 0) return new Date(todayStart);
  let best = -Infinity;
  for (const t of existing) {
    const end = t.endDate?.toDate();
    const start = t.startDate?.toDate();
    if (end) best = Math.max(best, startOfLocalDay(end).getTime());
    else if (start) best = Math.max(best, startOfLocalDay(start).getTime());
  }
  if (best === -Infinity) return new Date(todayStart);
  const after = addCalendarDaysStart(new Date(best), 1);
  const afterStart = startOfLocalDay(after).getTime();
  return new Date(Math.max(afterStart, todayStart));
}

export default function AddTaskScreen() {
  useGuardedRoute({ capability: 'task.write' });
  const t = useThemeV2();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [submitError, setSubmitError] = useState<string>();
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const userTouchedStartRef = useRef(false);
  const defaultStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: existingTasks, loading: tasksLoading } = useTasks(projectId);

  useEffect(() => {
    userTouchedStartRef.current = false;
    if (defaultStartTimeoutRef.current) {
      clearTimeout(defaultStartTimeoutRef.current);
      defaultStartTimeoutRef.current = null;
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || userTouchedStartRef.current) return;
    if (defaultStartTimeoutRef.current) clearTimeout(defaultStartTimeoutRef.current);
    defaultStartTimeoutRef.current = setTimeout(() => {
      defaultStartTimeoutRef.current = null;
      if (userTouchedStartRef.current || tasksLoading) return;
      setStartDate(suggestedNextTaskStart(existingTasks, new Date()));
    }, 280);
    return () => {
      if (defaultStartTimeoutRef.current) {
        clearTimeout(defaultStartTimeoutRef.current);
        defaultStartTimeoutRef.current = null;
      }
    };
  }, [projectId, tasksLoading, existingTasks]);

  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedToName, setAssignedToName] = useState('');
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [savePhase, setSavePhase] = useState<string>();
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const { data: categoryOptions } = useTaskCategories(orgId);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      status: 'not_started',
      category: 'general',
    },
    mode: 'onChange',
  });

  const selectedStatus = watch('status') as TaskStatus;
  const selectedCategory = watch('category') as TaskCategory;
  const selectedCategoryLabel =
    categoryOptions.find((c) => c.key === selectedCategory)?.label ?? 'General';

  async function addCategoryNow() {
    const label = newCategory.trim();
    if (!label || !orgId || !user?.uid) return;
    setAddingCategory(true);
    try {
      await createTaskCategory({ orgId, label, createdBy: user.uid });
      setNewCategory('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setAddingCategory(false);
    }
  }

  async function pickPhotos() {
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
    if (res.canceled) return;
    const newEntries = res.assets.map((a) =>
      makeStagedFile({
        localUri: a.uri,
        contentType: a.mimeType || guessImageMimeType(a.uri),
      }),
    );
    setStaged((prev) => [...prev, ...newEntries]);
  }

  function removePhoto(id: string) {
    setStaged((prev) => prev.filter((p) => p.id !== id));
  }

  async function onSubmit(data: FormData) {
    if (!user || !orgId || !projectId) return;
    setSubmitError(undefined);
    try {
      let uploadedFiles: { publicUrl: string; key: string; sizeBytes: number; contentType: string }[] = [];
      let failedCount = 0;
      if (staged.length > 0) {
        setSavePhase(`Uploading 0 of ${staged.length}…`);
        const { uploaded, failed } = await commitStagedFiles({
          files: staged,
          kind: 'task_photo',
          refId: projectId,
          compress: 'balanced',
          onProgress: (done, total) => setSavePhase(`Uploading ${done} of ${total}…`),
        });
        uploadedFiles = uploaded;
        failedCount = failed.length;
        if (uploaded.length === 0 && failed.length > 0) {
          setSubmitError(
            `All ${failed.length} photo(s) failed to upload. Check your connection and try Save again.`,
          );
          setSavePhase(undefined);
          return;
        }
      }

      setSavePhase('Saving milestone…');
      const taskId = await createTask({
        orgId,
        projectId,
        title: data.title,
        description: data.description ?? '',
        status: data.status as TaskStatus,
        category: data.category as TaskCategory,
        startDate,
        endDate,
        assignedTo,
        assignedToName,
        photoUris: uploadedFiles.map((u) => u.publicUrl),
        createdBy: user.uid,
      });

      for (const u of uploadedFiles) {
        void recordStorageEvent({
          projectId,
          kind: 'task_photo',
          refId: taskId,
          key: u.key,
          sizeBytes: u.sizeBytes,
          contentType: u.contentType,
          action: 'upload',
        });
      }

      if (failedCount > 0) {
        Alert.alert(
          'Some uploads failed',
          `${failedCount} of ${staged.length} photo${staged.length === 1 ? '' : 's'} failed to upload. The milestone was saved with the rest.`,
        );
      }
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="New milestone"
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={isSubmitting}
        saveDisabled={!isValid || !orgId}
        onCancel={() => router.back()}
        onSave={() => void handleSubmit(onSubmit)()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title hero */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View
              style={[
                styles.titleCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.hero,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                MILESTONE TITLE
              </Text>
              <Controller
                control={control}
                name="title"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="e.g. Install kitchen cabinets"
                    placeholderTextColor={t.colors.tertiary}
                    autoCapitalize="sentences"
                    style={[
                      styles.titleInput,
                      {
                        color: t.colors.label,
                        ...t.type.title3,
                        fontWeight: '700',
                      },
                    ]}
                    multiline
                  />
                )}
              />
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((s) => {
                  const active = selectedStatus === s.key;
                  const tone =
                    s.key === 'completed'
                      ? { fg: t.palette.green.base, bg: t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft }
                      : s.key === 'ongoing'
                        ? { fg: t.palette.blue.base, bg: t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft }
                        : { fg: t.colors.secondary, bg: t.colors.fill3 };
                  return (
                    <Pressable
                      key={s.key}
                      onPress={() => setValue('status', s.key, { shouldValidate: true })}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.statusChip,
                        {
                          backgroundColor: active ? tone.bg : t.colors.fill3,
                          borderRadius: 999,
                          borderColor: active ? tone.fg + '33' : 'transparent',
                          borderWidth: active ? 1 : 0,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: active ? tone.fg : t.colors.tertiary,
                          marginRight: 5,
                        }}
                      />
                      <Text
                        variant="caption2"
                        style={{
                          color: active ? tone.fg : t.colors.secondary,
                          fontWeight: '700',
                          letterSpacing: 0.3,
                        }}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
          {errors.title?.message ? (
            <FieldNote text={errors.title.message} tone={t.palette.red.base} />
          ) : null}

          {/* Details */}
          <FormGroup header="Details">
            <Row
              label="Category"
              value={selectedCategoryLabel}
              chevron
              onPress={() => setShowCategorySheet(true)}
            />
            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Description"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Details about this milestone"
                  multiline
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {errors.category?.message ? (
            <FieldNote text={errors.category.message} tone={t.palette.red.base} />
          ) : null}

          {/* Schedule */}
          <FormGroup header="Schedule">
            <Row
              label="Start date"
              value={formatDate(startDate)}
              chevron
              onPress={() => {
                setShowEndDate(false);
                setShowStartDate(true);
              }}
            />
            <Row
              label="End date"
              value={endDate ? formatDate(endDate) : 'Optional'}
              valueColor={endDate ? undefined : t.colors.tertiary}
              chevron
              onPress={() => {
                setShowStartDate(false);
                setShowEndDate(true);
              }}
              divider={false}
            />
          </FormGroup>

          {/* Assignee */}
          <FormGroup header="Assignee">
            <Row
              label="Party"
              value={assignedToName || 'Unassigned'}
              valueColor={assignedToName ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setShowPartyPicker(true)}
              divider={false}
            />
          </FormGroup>

          {/* Reference photos */}
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              REFERENCE PHOTOS
            </Text>
            <View style={styles.photoRow}>
              {staged.map((p) => (
                <View key={p.id} style={styles.photoThumbWrap}>
                  <Image
                    source={{ uri: p.localUri }}
                    style={[styles.photoThumb, { borderRadius: t.radii.tile }]}
                  />
                  <Pressable
                    onPress={() => removePhoto(p.id)}
                    hitSlop={6}
                    style={[
                      styles.photoClose,
                      { backgroundColor: t.palette.red.base },
                    ]}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={pickPhotos}
                style={({ pressed }) => [
                  styles.photoAdd,
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
                <Ionicons name="add" size={20} color={t.palette.blue.base} />
              </Pressable>
            </View>
          </View>

          {submitError ? (
            <FieldNote text={submitError} tone={t.palette.red.base} />
          ) : null}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date pickers */}
      <DateTimeSheet
        open={showStartDate}
        value={startDate}
        onChange={(d) => {
          userTouchedStartRef.current = true;
          setStartDate(d);
        }}
        onClose={() => setShowStartDate(false)}
        mode="date"
        title="Start date"
      />
      <DateTimeSheet
        open={showEndDate}
        value={endDate ?? new Date()}
        onChange={(d) => setEndDate(d)}
        onClose={() => setShowEndDate(false)}
        mode="date"
        title="End date"
      />

      <PartyPickerModal
        visible={showPartyPicker}
        orgId={orgId}
        projectId={projectId}
        allowUnassign
        onPick={(id, name) => {
          setAssignedTo(id);
          setAssignedToName(name);
          setShowPartyPicker(false);
        }}
        onClose={() => setShowPartyPicker(false)}
      />

      <CategorySheet
        open={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        categoryOptions={categoryOptions}
        selectedCategory={selectedCategory}
        onPick={(k) => setValue('category', k, { shouldValidate: true })}
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        addingCategory={addingCategory}
        onAddCategory={addCategoryNow}
      />

      <SubmitProgressOverlay
        visible={isSubmitting}
        intent="createTask"
        phaseLabel={savePhase}
      />
    </View>
  );
}

function FieldNote({ text, tone }: { text: string; tone: string }) {
  return (
    <Text
      variant="caption2"
      style={{ color: tone, paddingHorizontal: 32, marginTop: 8 }}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 60 },

  // Title hero
  titleCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  titleInput: {
    marginTop: 6,
    paddingVertical: 0,
    margin: 0,
    minHeight: 30,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  // Photos
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumbWrap: {
    position: 'relative',
  },
  photoThumb: {
    width: 72,
    height: 72,
  },
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
  photoAdd: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
