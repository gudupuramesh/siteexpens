/**
 * Edit Project — InteriorOS-styled form, pre-filled from the existing
 * project doc.
 *
 * Mirrors the structure of `new.tsx` (DETAILS / TYPE / STATUS /
 * TIMELINE / BUDGET / COVER PHOTO) so the user has the same mental
 * model when editing as when creating. Differences from new:
 *   - Form starts pre-populated via useProject(id)
 *   - Cover photo can be REPLACED (new pick) or REMOVED (existing
 *     cleared); old R2 key gets deleted after save succeeds
 *   - Save calls updateProject with only the changed fields; helper
 *     handles per-field clearing via FieldValue.delete()
 *
 * The new "Client" + "Team size" rows that weren't in the create form
 * are also editable here — they were originally meant to be filled in
 * later from the project detail screen (see new.tsx header comment).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from "@/src/features/org/useGuardedRoute";
import * as ImagePicker from 'expo-image-picker';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { useProject } from '@/src/features/projects/useProject';
import { updateProject } from '@/src/features/projects/projects';
import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';
import { deleteR2Object } from '@/src/lib/r2Delete';
import {
  PROJECT_STATUS_OPTIONS,
  PROJECT_SUB_TYPES,
  PROJECT_TYPOLOGIES,
  type ProjectStatus,
  type ProjectTypology,
} from '@/src/features/projects/types';
import { Screen } from '@/src/ui/Screen';
import {
  Group,
  InputRow,
  PickerRow,
  PrimaryButton,
  SelectModal,
  Slider,
} from '@/src/ui/io';
import { Spinner } from '@/src/ui/Spinner';
import { color, fontFamily } from '@/src/theme/tokens';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    location: z.string().trim().max(60).optional(),
    siteAddress: z.string().trim().min(3, 'Enter a site address'),
    client: z.string().trim().max(80).optional(),
    typology: z.enum(['residential', 'commercial', 'hospitality', 'industrial', 'other']).optional(),
    subTypeKey: z.string().optional(),
    subTypeCustom: z.string().trim().max(60).optional(),
    status: z.enum(['active', 'on_hold', 'completed', 'archived']),
    progress: z.number().min(0).max(100),
    startDate: z.date(),
    endDate: z.date().nullable(),
    value: z.string().trim().regex(/^\d+$/, 'Enter a number'),
    team: z.string().trim().regex(/^\d*$/, 'Enter a number').optional(),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: 'Handover must be on or after the project start date',
    path: ['endDate'],
  });

type FormValues = z.input<typeof schema>;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatPickerDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(key: ProjectStatus): string {
  return PROJECT_STATUS_OPTIONS.find((s) => s.key === key)?.label ?? key;
}

function typologyLabel(key: ProjectTypology): string {
  return PROJECT_TYPOLOGIES.find((s) => s.key === key)?.label ?? key;
}

/** Match a free-text subType string back to its option key, so the
 *  form can pre-select the picker on hydration. Falls back to 'other'
 *  if the stored string doesn't match any preset (which means it was
 *  entered via the "Other → describe" path originally). */
function reverseLookupSubType(
  typology: ProjectTypology | undefined,
  subType: string | undefined,
): { key: string | undefined; custom: string | undefined } {
  if (!typology || !subType) return { key: undefined, custom: undefined };
  const opts = PROJECT_SUB_TYPES[typology] ?? [];
  const match = opts.find(
    (o) => o.label.toLowerCase() === subType.toLowerCase() && o.key !== 'other',
  );
  if (match) return { key: match.key, custom: undefined };
  return { key: 'other', custom: subType };
}

export default function EditProjectScreen() {
  useGuardedRoute({ capability: 'project.edit' });
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading } = useProject(id);

  const [submitError, setSubmitError] = useState<string>();
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);
  const [iosDateDraft, setIosDateDraft] = useState<Date>(() => startOfLocalDay(new Date()));
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showSubTypePicker, setShowSubTypePicker] = useState(false);

  // Cover-photo state has three modes:
  //   - existingPhoto = the live URL from Firestore (no replacement)
  //   - stagedCover   = a freshly-picked local file to upload on save
  //   - null + cleared= the user explicitly removed the cover
  // `clearedExisting` distinguishes "no cover from the start" (no R2
  // delete needed) from "user removed the existing cover" (R2 delete
  // queued on save).
  const [existingPhoto, setExistingPhoto] = useState<{ uri: string; key: string | null } | null>(null);
  const [stagedCover, setStagedCover] = useState<StagedFile | null>(null);
  const [clearedExisting, setClearedExisting] = useState(false);
  const [savePhase, setSavePhase] = useState<string>();
  /** Hydrated → true once the live doc has been copied into the form
   *  state. Prevents the form from being repeatedly reset if the
   *  snapshot fires multiple times. */
  const hydratedRef = useRef(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      location: '',
      siteAddress: '',
      client: '',
      typology: undefined,
      subTypeKey: undefined,
      subTypeCustom: '',
      status: 'active',
      progress: 0,
      startDate: new Date(),
      endDate: null,
      value: '',
      team: '',
    },
  });

  // Hydrate the form once project loads.
  useEffect(() => {
    if (!project || hydratedRef.current) return;
    const sub = reverseLookupSubType(project.typology, project.subType);
    reset({
      name: project.name,
      location: project.location ?? '',
      siteAddress: project.siteAddress,
      client: project.client ?? '',
      typology: project.typology,
      subTypeKey: sub.key,
      subTypeCustom: sub.custom ?? '',
      status: project.status,
      progress: project.progress ?? 0,
      startDate: project.startDate ? startOfLocalDay(project.startDate.toDate()) : startOfLocalDay(new Date()),
      endDate: project.endDate ? startOfLocalDay(project.endDate.toDate()) : null,
      value: String(project.value ?? 0),
      team: project.team !== undefined ? String(project.team) : '',
    });
    if (project.photoUri) {
      setExistingPhoto({ uri: project.photoUri, key: project.photoR2Key ?? null });
    }
    hydratedRef.current = true;
  }, [project, reset]);

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const status = watch('status');
  const typology = watch('typology');
  const subTypeKey = watch('subTypeKey');

  useEffect(() => {
    const curEnd = getValues('endDate');
    if (!curEnd) return;
    const minTs = startOfLocalDay(startDate).getTime();
    if (startOfLocalDay(curEnd).getTime() < minTs) {
      setValue('endDate', null, { shouldValidate: true });
    }
  }, [startDate, getValues, setValue]);

  const subTypeOptions = useMemo(
    () => (typology ? PROJECT_SUB_TYPES[typology] : []),
    [typology],
  );

  const subTypeDisplay = useMemo(() => {
    if (!subTypeKey) return undefined;
    if (subTypeKey === 'other') return undefined;
    return subTypeOptions.find((s) => s.key === subTypeKey)?.label;
  }, [subTypeKey, subTypeOptions]);

  function pickTypology(t: ProjectTypology) {
    setValue('typology', t, { shouldValidate: true });
    if (subTypeKey && !PROJECT_SUB_TYPES[t].some((s) => s.key === subTypeKey)) {
      setValue('subTypeKey', undefined);
      setValue('subTypeCustom', '');
    }
  }

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to change the cover.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setStagedCover({
      id: 'cover',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
    // Picking a replacement implies the user wants the old one gone.
    if (existingPhoto) setClearedExisting(true);
  }

  function handleClearPhoto() {
    setStagedCover(null);
    if (existingPhoto) {
      // Mark for deletion on save; visually go to "no photo".
      setClearedExisting(true);
    }
  }

  function openDatePicker(kind: 'start' | 'end') {
    const startDay = startOfLocalDay(startDate);
    if (kind === 'start') {
      setIosDateDraft(startDay);
    } else {
      const minTs = startDay.getTime();
      const fallback = startDay;
      if (!endDate) {
        setIosDateDraft(fallback);
      } else {
        setIosDateDraft(new Date(Math.max(startOfLocalDay(endDate).getTime(), minTs)));
      }
    }
    setDatePicker(kind);
  }

  function handleDateChange(kind: 'start' | 'end', event: DateTimePickerEvent, picked?: Date) {
    if (Platform.OS === 'android') setDatePicker(null);
    if (event.type === 'dismissed' || !picked) return;
    if (kind === 'start') {
      setValue('startDate', startOfLocalDay(picked), { shouldValidate: true });
    } else {
      const minTs = startOfLocalDay(startDate).getTime();
      const n = startOfLocalDay(picked);
      setValue('endDate', new Date(Math.max(n.getTime(), minTs)), { shouldValidate: true });
    }
  }

  function confirmIosDatePicker() {
    if (!datePicker) return;
    if (datePicker === 'start') {
      setValue('startDate', startOfLocalDay(iosDateDraft), { shouldValidate: true });
    } else {
      const minTs = startOfLocalDay(startDate).getTime();
      const n = startOfLocalDay(iosDateDraft);
      setValue('endDate', new Date(Math.max(n.getTime(), minTs)), { shouldValidate: true });
    }
    setDatePicker(null);
  }

  async function onSubmit(values: FormValues) {
    if (!id || !project) return;
    setSubmitError(undefined);

    let resolvedSubType: string | undefined;
    if (values.subTypeKey === 'other' || values.typology === 'other') {
      resolvedSubType = values.subTypeCustom?.trim() || undefined;
    } else if (values.subTypeKey && values.typology) {
      resolvedSubType = PROJECT_SUB_TYPES[values.typology].find(
        (s) => s.key === values.subTypeKey,
      )?.label;
    }

    try {
      // Step 1 — upload the new cover (if a replacement was staged).
      let newCoverUrl: string | null = null;
      let newCoverKey: string | null = null;
      let newCoverSize = 0;
      let newCoverContentType = '';
      if (stagedCover) {
        setSavePhase('Uploading cover…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [stagedCover],
          kind: 'project_cover',
          refId: id,
          projectId: id,
          compress: 'balanced',
        });
        if (failed.length > 0) {
          setSubmitError(`Cover photo upload failed: ${failed[0].error}`);
          setSavePhase(undefined);
          return;
        }
        const ok = uploaded[0];
        newCoverUrl = ok.publicUrl;
        newCoverKey = ok.key;
        newCoverSize = ok.sizeBytes;
        newCoverContentType = ok.contentType;
      }

      // Step 2 — write the patch. Only include photo fields when the
      // user actually changed something to avoid stomping unrelated
      // values.
      setSavePhase('Saving…');
      const teamNum = values.team && values.team.trim().length > 0
        ? parseInt(values.team, 10)
        : 0;
      const patch: Parameters<typeof updateProject>[0] = {
        projectId: id,
        name: values.name.trim(),
        location: values.location ?? '',
        siteAddress: values.siteAddress.trim(),
        client: values.client ?? '',
        typology: values.typology,
        subType: resolvedSubType ?? '',
        status: values.status,
        progress: values.progress,
        startDate: values.startDate,
        endDate: values.endDate,
        value: parseInt(values.value, 10),
        team: teamNum,
      };
      if (stagedCover) {
        patch.photoUri = newCoverUrl;
        patch.photoR2Key = newCoverKey;
      } else if (clearedExisting) {
        patch.photoUri = null;
        patch.photoR2Key = null;
      }
      await updateProject(patch);

      // Step 3 — clean up the OLD R2 cover, after the new one is
      // durably referenced. Best-effort.
      if ((stagedCover || clearedExisting) && existingPhoto?.key) {
        void deleteR2Object({
          projectId: id,
          key: existingPhoto.key,
          kind: 'project_cover',
          refId: id,
        });
      }
      // Storage event for the new cover (recordStorageEvent already
      // fires inside uploadToR2 when projectId is set, so this is just
      // a no-op safety net for older code paths).
      if (newCoverKey && newCoverSize > 0) {
        void recordStorageEvent;
        void newCoverContentType;
      }

      // Snapshot-propagation buffer (see add-transaction.tsx).
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  const showSubTypeCustom = typology === 'other' || subTypeKey === 'other';
  const photoVisibleUri = stagedCover
    ? stagedCover.localUri
    : !clearedExisting && existingPhoto
      ? existingPhoto.uri
      : null;

  if (loading || !project) {
    return (
      <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingWrap}>
          <Spinner size={28} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={color.textMuted} />
        </Pressable>
        <View style={styles.navCenter}>
          <RNText style={styles.navEyebrow}>EDIT</RNText>
          <RNText style={styles.navTitle} numberOfLines={1}>
            {project.name}
          </RNText>
        </View>
        <View style={styles.navBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* DETAILS */}
          <Group header="Details">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Name *"
                  placeholder="e.g. Sharma Residence"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  editable={!isSubmitting}
                />
              )}
            />
            {errors.name?.message ? (
              <RNText style={styles.fieldError}>{errors.name.message}</RNText>
            ) : null}

            <Controller
              control={control}
              name="client"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Client"
                  placeholder="e.g. Mr. Sharma"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  editable={!isSubmitting}
                />
              )}
            />

            <Controller
              control={control}
              name="location"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Location"
                  placeholder="e.g. Jubilee Hills"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  editable={!isSubmitting}
                />
              )}
            />

            <Controller
              control={control}
              name="siteAddress"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Site *"
                  placeholder="Plot, street, area, city"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="sentences"
                  multiline
                  editable={!isSubmitting}
                  last
                />
              )}
            />
            {errors.siteAddress?.message ? (
              <RNText style={styles.fieldError}>{errors.siteAddress.message}</RNText>
            ) : null}
          </Group>

          {/* TYPE */}
          <Group header="Type">
            <PickerRow
              label="Typology"
              icon="apps-outline"
              value={typology ? typologyLabel(typology) : undefined}
              placeholder="Choose typology"
              onPress={() => setShowTypePicker(true)}
            />
            {typology && typology !== 'other' ? (
              <PickerRow
                label="Sub-type"
                icon="grid-outline"
                value={subTypeDisplay}
                placeholder={
                  subTypeKey === 'other' ? 'Other (type below)' : 'Choose sub-type'
                }
                onPress={() => setShowSubTypePicker(true)}
                last={!showSubTypeCustom}
              />
            ) : null}
            {showSubTypeCustom ? (
              <Controller
                control={control}
                name="subTypeCustom"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Describe"
                    placeholder="e.g. Boutique studio"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="sentences"
                    editable={!isSubmitting}
                    last
                  />
                )}
              />
            ) : null}
          </Group>

          {/* STATUS */}
          <Group header="Status">
            <PickerRow
              label="Status"
              icon="ellipse-outline"
              value={statusLabel(status)}
              onPress={() => setShowStatusPicker(true)}
            />
            <View style={styles.sliderRow}>
              <View style={styles.sliderLabelCol}>
                <RNText style={styles.sliderLabel}>Progress</RNText>
              </View>
              <View style={styles.sliderCol}>
                <Controller
                  control={control}
                  name="progress"
                  render={({ field: { onChange, value } }) => (
                    <Slider
                      value={typeof value === 'number' ? value : 0}
                      onChange={onChange}
                      step={1}
                    />
                  )}
                />
              </View>
            </View>
          </Group>

          {/* TIMELINE */}
          <Group header="Timeline">
            <PickerRow
              label="Start date"
              icon="calendar-outline"
              value={formatPickerDate(startDate)}
              onPress={() => openDatePicker('start')}
            />
            <PickerRow
              label="Target handover"
              icon="flag-outline"
              value={endDate ? formatPickerDate(endDate) : undefined}
              placeholder="Optional"
              onPress={() => openDatePicker('end')}
              last
            />
            {errors.endDate?.message ? (
              <RNText style={styles.fieldError}>{errors.endDate.message}</RNText>
            ) : null}
          </Group>

          {/* BUDGET */}
          <Group header="Budget">
            <Controller
              control={control}
              name="value"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Value (₹) *"
                  placeholder="0"
                  value={value}
                  onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  editable={!isSubmitting}
                  mono
                  last
                />
              )}
            />
            {errors.value?.message ? (
              <RNText style={styles.fieldError}>{errors.value.message}</RNText>
            ) : null}
          </Group>

          {/* TEAM */}
          <Group header="Team">
            <Controller
              control={control}
              name="team"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Team size"
                  placeholder="0"
                  value={value ?? ''}
                  onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  editable={!isSubmitting}
                  mono
                  last
                />
              )}
            />
          </Group>

          {/* COVER PHOTO — replace or remove. */}
          <Group header="Cover photo (optional)">
            <Pressable
              onPress={handlePickPhoto}
              style={({ pressed }) => [
                styles.photoTile,
                pressed && { opacity: 0.85 },
              ]}
            >
              {photoVisibleUri ? (
                <Image
                  source={{ uri: photoVisibleUri }}
                  style={styles.photoImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="image-outline" size={22} color={color.textFaint} />
                  <RNText style={styles.photoHint}>Tap to add a project photo</RNText>
                </View>
              )}
            </Pressable>
            {photoVisibleUri ? (
              <Pressable
                onPress={handleClearPhoto}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.photoClearBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="close" size={14} color={color.danger} />
                <RNText style={styles.photoClearText}>Remove cover</RNText>
              </Pressable>
            ) : null}
          </Group>

          {submitError ? (
            <RNText style={[styles.fieldError, { paddingHorizontal: 16, marginTop: 4 }]}>
              {submitError}
            </RNText>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label={savePhase ?? 'Save changes'}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
          />
        </View>
      </KeyboardAvoidingView>

      {datePicker && Platform.OS === 'ios' ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setDatePicker(null)}
        >
          <Pressable style={styles.dateModalBackdrop} onPress={() => setDatePicker(null)}>
            <View />
          </Pressable>
          <View style={styles.dateModalSheet}>
            <DateTimePicker
              value={iosDateDraft}
              mode="date"
              display="spinner"
              themeVariant="light"
              minimumDate={datePicker === 'end' ? startOfLocalDay(startDate) : undefined}
              onChange={(_: DateTimePickerEvent, picked?: Date) => {
                if (!picked) return;
                if (datePicker === 'start') {
                  setIosDateDraft(startOfLocalDay(picked));
                } else {
                  const minTs = startOfLocalDay(startDate).getTime();
                  const n = startOfLocalDay(picked);
                  setIosDateDraft(new Date(Math.max(n.getTime(), minTs)));
                }
              }}
            />
            <View style={styles.dateModalActions}>
              <Pressable
                onPress={() => setDatePicker(null)}
                style={({ pressed }) => [styles.dateModalBtnGhost, pressed && { opacity: 0.7 }]}
              >
                <RNText style={styles.dateModalBtnGhostText}>Cancel</RNText>
              </Pressable>
              <Pressable
                onPress={confirmIosDatePicker}
                style={({ pressed }) => [styles.dateModalBtnPrimary, pressed && { opacity: 0.9 }]}
              >
                <RNText style={styles.dateModalBtnPrimaryText}>Done</RNText>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}

      {datePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          value={datePicker === 'start' ? startDate : (endDate ?? startOfLocalDay(startDate))}
          mode="date"
          display="default"
          minimumDate={datePicker === 'end' ? startOfLocalDay(startDate) : undefined}
          onChange={(e, d) => handleDateChange(datePicker, e, d)}
        />
      ) : null}

      <SelectModal
        visible={showTypePicker}
        title="Choose typology"
        options={PROJECT_TYPOLOGIES}
        value={typology}
        onPick={(k) => pickTypology(k as ProjectTypology)}
        onClose={() => setShowTypePicker(false)}
      />

      <SelectModal
        visible={showSubTypePicker}
        title="Choose sub-type"
        options={subTypeOptions}
        value={subTypeKey}
        onPick={(k) => setValue('subTypeKey', k, { shouldValidate: true })}
        onClose={() => setShowSubTypePicker(false)}
      />

      <SelectModal
        visible={showStatusPicker}
        title="Set project status"
        options={PROJECT_STATUS_OPTIONS}
        value={status}
        onPick={(k) => setValue('status', k as ProjectStatus, { shouldValidate: true })}
        onClose={() => setShowStatusPicker(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },

  navBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  navEyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textFaint,
    letterSpacing: 1.4,
  },
  navTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },

  scroll: {
    paddingTop: 18,
    paddingBottom: 40,
  },

  fieldError: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.danger,
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  // Slider row inside the Status group — mirrors new.tsx.
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 60,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.separator,
  },
  sliderLabelCol: {
    width: 110,
    flexShrink: 0,
  },
  sliderLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '500',
    color: color.text,
  },
  sliderCol: {
    flex: 1,
  },

  // Photo tile
  photoTile: {
    height: 180,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.borderStrong,
    overflow: 'hidden',
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoHint: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
  },
  photoClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 8,
    alignSelf: 'flex-start',
  },
  photoClearText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.danger,
  },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },

  dateModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  dateModalSheet: {
    backgroundColor: color.bgGrouped,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 28,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  dateModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  dateModalBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dateModalBtnGhostText: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '600',
    color: color.textMuted,
  },
  dateModalBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: color.primary,
    borderRadius: 10,
  },
  dateModalBtnPrimaryText: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '600',
    color: color.onPrimary,
  },
});
