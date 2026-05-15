/**
 * Edit Project — v2 design.
 *
 * Mirrors `new.tsx` exactly so the user has the same mental model when
 * editing as when creating. Same components, same FormGroups, same
 * field order, same sheet pickers — only the header label and the
 * data-flow change:
 *
 *   • Pre-fills the form from the existing project doc on first load
 *     (with a hydration ref guard so Firestore snapshot churn doesn't
 *     wipe in-flight edits — same pattern we use on edit-transaction).
 *   • Cover photo can be REPLACED (new pick) or REMOVED (existing
 *     cleared) — the old R2 key gets deleted after save succeeds.
 *   • Save calls `updateProject` with only the changed fields; the
 *     helper handles per-field clearing via `FieldValue.delete()`.
 *
 * Layout (top → bottom) — identical to new.tsx:
 *   1. SheetHeader: Cancel · "Edit project" · Save
 *   2. Cover photo card (preview / replace / remove)
 *   3. FormGroup "Details"  — Name · Client · Location · Site
 *   4. FormGroup "Type"     — Typology · Sub-type (conditional)
 *   5. FormGroup "Status"   — Status · Progress slider
 *   6. FormGroup "Timeline" — Start date · Target handover
 *   7. FormGroup "Budget"   — Project value · Team size
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { z } from 'zod';

import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { Slider } from '@/src/ui/io';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { useThemeV2 } from '@/src/theme/v2';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    client: z.string().trim().max(80).optional(),
    location: z.string().trim().max(60).optional(),
    siteAddress: z.string().trim().min(3, 'Enter a site address'),
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

/** Try to find which sub-type key matches the project's stored subType
 *  label, so the picker shows the right pre-selected option. */
function reverseLookupSubType(
  typology: ProjectTypology | undefined,
  storedSubType: string | undefined,
): { key: string | undefined; custom: string } {
  if (!typology || !storedSubType) return { key: undefined, custom: '' };
  if (typology === 'other') return { key: 'other', custom: storedSubType };
  const opts = PROJECT_SUB_TYPES[typology] ?? [];
  const match = opts.find((o) => o.label === storedSubType);
  if (match) return { key: match.key, custom: '' };
  return { key: 'other', custom: storedSubType };
}

export default function EditProjectScreen() {
  // Route guard — anyone landing here without `project.edit` bounces home.
  useGuardedRoute({ capability: 'project.edit' });

  const t = useThemeV2();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading } = useProject(id);

  const initialStartDate = useMemo(() => startOfLocalDay(new Date()), []);

  const [submitError, setSubmitError] = useState<string>();
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showSubTypePicker, setShowSubTypePicker] = useState(false);
  const [stagedReplacement, setStagedReplacement] = useState<StagedFile | null>(null);
  const [existingPhotoUri, setExistingPhotoUri] = useState<string | null>(null);
  const [existingPhotoKey, setExistingPhotoKey] = useState<string | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [coverError, setCoverError] = useState<string>();
  const [savePhase, setSavePhase] = useState<string>();

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
      client: '',
      location: '',
      siteAddress: '',
      typology: undefined,
      subTypeKey: undefined,
      subTypeCustom: '',
      status: 'active',
      progress: 0,
      startDate: initialStartDate,
      endDate: null,
      value: '',
      team: '',
    },
  });

  // Pre-fill ONCE per project. Same pattern as edit-transaction —
  // Firestore snapshot churn would otherwise wipe in-flight edits.
  const hydratedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!project) return;
    if (hydratedForId.current === project.id) return;
    hydratedForId.current = project.id;
    const sub = reverseLookupSubType(project.typology, project.subType);
    reset({
      name: project.name ?? '',
      client: project.client ?? '',
      location: project.location ?? '',
      siteAddress: project.siteAddress ?? '',
      typology: project.typology,
      subTypeKey: sub.key,
      subTypeCustom: sub.custom,
      status: (project.status as ProjectStatus) ?? 'active',
      progress: project.progress ?? 0,
      startDate: project.startDate ? project.startDate.toDate() : initialStartDate,
      endDate: project.endDate ? project.endDate.toDate() : null,
      value: project.value != null ? String(project.value) : '',
      team: project.team != null ? String(project.team) : '',
    });
    setExistingPhotoUri(project.photoUri ?? null);
    setExistingPhotoKey(project.photoR2Key ?? null);
  }, [project, reset, initialStartDate]);

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const status = watch('status');
  const typology = watch('typology');
  const subTypeKey = watch('subTypeKey');

  // If the user moves the start date forward past the existing handover,
  // wipe the handover so they're forced to re-pick a sensible value.
  useEffect(() => {
    const curEnd = getValues('endDate');
    if (!curEnd) return;
    const minTs = Math.max(
      startOfLocalDay(startDate).getTime(),
      startOfLocalDay(new Date()).getTime(),
    );
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
    if (subTypeKey === 'other') return 'Other';
    return subTypeOptions.find((s) => s.key === subTypeKey)?.label;
  }, [subTypeKey, subTypeOptions]);

  function pickTypology(typ: ProjectTypology) {
    setValue('typology', typ, { shouldValidate: true });
    if (subTypeKey && !PROJECT_SUB_TYPES[typ].some((s) => s.key === subTypeKey)) {
      setValue('subTypeKey', undefined);
      setValue('subTypeCustom', '');
    }
  }

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        'Allow photo library access to add a project photo.',
      );
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
    setCoverError(undefined);
    setStagedReplacement({
      id: 'cover',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
    setPhotoCleared(false);
  }

  function handleClearPhoto() {
    setStagedReplacement(null);
    setPhotoCleared(true);
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    if (!project || !id) {
      setSubmitError('Project not loaded.');
      return;
    }

    let subType: string | undefined;
    if (values.subTypeKey === 'other' || values.typology === 'other') {
      subType = values.subTypeCustom?.trim() || undefined;
    } else if (values.subTypeKey && values.typology) {
      subType = PROJECT_SUB_TYPES[values.typology].find(
        (s) => s.key === values.subTypeKey,
      )?.label;
    }

    try {
      // Step 1 — replace cover if a new photo was staged.
      let newPhotoUri: string | null | undefined;
      let newPhotoKey: string | null | undefined;
      let uploadedSize = 0;
      let uploadedContentType = '';
      if (stagedReplacement) {
        setSavePhase('Uploading cover…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [stagedReplacement],
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
        newPhotoUri = ok.publicUrl;
        newPhotoKey = ok.key;
        uploadedSize = ok.sizeBytes;
        uploadedContentType = ok.contentType;
      } else if (photoCleared) {
        // User explicitly removed the existing photo.
        newPhotoUri = null;
        newPhotoKey = null;
      }

      // Step 2 — patch the project doc.
      setSavePhase('Saving project…');
      const teamNum =
        values.team && values.team.trim().length > 0
          ? parseInt(values.team, 10)
          : undefined;

      const patch: Parameters<typeof updateProject>[0] = {
        projectId: id,
        name: values.name.trim(),
        client: values.client?.trim() ?? '',
        location: values.location?.trim() ?? '',
        siteAddress: values.siteAddress.trim(),
        typology: values.typology,
        subType,
        status: values.status,
        progress: values.progress,
        startDate: values.startDate,
        endDate: values.endDate,
        value: parseInt(values.value, 10),
        team: teamNum,
      };
      if (newPhotoUri !== undefined) patch.photoUri = newPhotoUri;
      if (newPhotoKey !== undefined) patch.photoR2Key = newPhotoKey;
      await updateProject(patch);

      // Step 3 — best-effort cleanup. Delete the old R2 object if the
      // user replaced or removed the cover.
      if (
        existingPhotoKey
        && (stagedReplacement || photoCleared)
        && existingPhotoKey !== newPhotoKey
      ) {
        void deleteR2Object({
          projectId: id,
          key: existingPhotoKey,
          kind: 'project_cover',
          refId: id,
        }).catch(() => undefined);
        void recordStorageEvent({
          projectId: id,
          kind: 'project_cover',
          refId: id,
          key: existingPhotoKey,
          sizeBytes: 0,
          contentType: '',
          action: 'delete',
        });
      }
      if (newPhotoKey) {
        void recordStorageEvent({
          projectId: id,
          kind: 'project_cover',
          refId: id,
          key: newPhotoKey,
          sizeBytes: uploadedSize,
          contentType: uploadedContentType,
          action: 'upload',
        });
      }

      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  const showSubTypeCustom =
    typology === 'other' || subTypeKey === 'other';

  // Date picker — keep within sensible bounds.
  const todayStart = startOfLocalDay(new Date());
  const handoverMinimum = new Date(
    Math.max(startOfLocalDay(startDate).getTime(), todayStart.getTime()),
  );

  // Loading shell — same as edit-transaction's pattern.
  if (loading && !project) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit project"
          cancelLabel="Cancel"
          saveLabel="Save"
          saveDisabled
          onCancel={() => router.back()}
          onSave={() => undefined}
        />
        <View style={styles.centered}>
          <Text variant="footnote" color="secondary">Loading…</Text>
        </View>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit project"
          cancelLabel="Cancel"
          saveLabel="Save"
          saveDisabled
          onCancel={() => router.back()}
          onSave={() => undefined}
        />
        <View style={[styles.centered, { padding: 32 }]}>
          <Ionicons name="alert-circle-outline" size={32} color={t.colors.tertiary} />
          <Text
            variant="callout"
            color="label"
            style={{ marginTop: 12, textAlign: 'center', fontWeight: '600' }}
          >
            Couldn't load this project
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 6, textAlign: 'center', lineHeight: 18 }}
          >
            It may have been deleted, or your access changed. If you were
            just added or your role was updated, sign out and back in to
            refresh your session.
          </Text>
        </View>
      </View>
    );
  }

  const showStagedPhoto = stagedReplacement != null;
  const showExistingPhoto = !showStagedPhoto && !photoCleared && !!existingPhotoUri;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="Edit project"
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={isSubmitting}
        onCancel={() => router.back()}
        onSave={() => void handleSubmit(onSubmit)()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Cover photo */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Pressable
              onPress={handlePickPhoto}
              style={({ pressed }) => [
                styles.photoTile,
                {
                  backgroundColor: t.colors.surface,
                  borderRadius: t.radii.hero,
                  borderColor:
                    t.mode === 'dark'
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(0,0,0,0.04)',
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              {showStagedPhoto ? (
                <>
                  <Image
                    source={{ uri: stagedReplacement!.localUri }}
                    style={styles.photoImg}
                    resizeMode="cover"
                  />
                  <View style={[styles.photoBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                    <Ionicons name="camera" size={13} color="#fff" />
                    <Text
                      variant="caption2"
                      style={{
                        color: '#fff',
                        fontWeight: '700',
                        marginLeft: 4,
                        letterSpacing: 0.4,
                      }}
                    >
                      CHANGE PHOTO
                    </Text>
                  </View>
                </>
              ) : showExistingPhoto ? (
                <>
                  <Image
                    source={{ uri: existingPhotoUri! }}
                    style={styles.photoImg}
                    resizeMode="cover"
                  />
                  <View style={[styles.photoBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                    <Ionicons name="camera" size={13} color="#fff" />
                    <Text
                      variant="caption2"
                      style={{
                        color: '#fff',
                        fontWeight: '700',
                        marginLeft: 4,
                        letterSpacing: 0.4,
                      }}
                    >
                      CHANGE PHOTO
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <View
                    style={[
                      styles.photoIcon,
                      {
                        backgroundColor:
                          t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                      },
                    ]}
                  >
                    <Ionicons
                      name="image-outline"
                      size={22}
                      color={t.palette.blue.base}
                    />
                  </View>
                  <Text
                    variant="callout"
                    color="label"
                    style={{ fontWeight: '700', marginTop: 10 }}
                  >
                    Add cover photo
                  </Text>
                  <Text
                    variant="caption1"
                    color="secondary"
                    style={{ marginTop: 2, textAlign: 'center' }}
                  >
                    Optional — appears on the project card.
                  </Text>
                </View>
              )}
            </Pressable>
            {(showStagedPhoto || showExistingPhoto) ? (
              <Pressable
                onPress={handleClearPhoto}
                hitSlop={6}
                style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 4 }}
              >
                <Text
                  variant="caption2"
                  style={{
                    color: t.palette.red.base,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                  }}
                >
                  REMOVE PHOTO
                </Text>
              </Pressable>
            ) : null}
            {coverError ? (
              <Text
                variant="caption2"
                style={{ color: t.palette.red.base, marginTop: 6, paddingHorizontal: 4 }}
              >
                {coverError}
              </Text>
            ) : null}
          </View>

          {/* Details — same field order as new.tsx */}
          <FormGroup header="Details">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Sharma Residence"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="client"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Client"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Mr. Sharma"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="location"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Location"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Jubilee Hills"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="siteAddress"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Site"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Plot, street, area, city"
                  autoCapitalize="sentences"
                  multiline
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {(errors.name?.message || errors.siteAddress?.message) ? (
            <FieldError text={errors.name?.message ?? errors.siteAddress?.message ?? ''} />
          ) : null}

          {/* Type */}
          <FormGroup header="Type">
            <Row
              label="Typology"
              value={typology ? typologyLabel(typology) : 'Choose'}
              chevron
              onPress={() => setShowTypePicker(true)}
              divider={typology != null && typology !== 'other'}
            />
            {typology && typology !== 'other' ? (
              <Row
                label="Sub-type"
                value={subTypeDisplay ?? 'Choose'}
                chevron
                onPress={() => setShowSubTypePicker(true)}
                divider={showSubTypeCustom}
              />
            ) : null}
            {showSubTypeCustom ? (
              <Controller
                control={control}
                name="subTypeCustom"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Describe"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="e.g. Boutique studio"
                    autoCapitalize="sentences"
                    divider={false}
                  />
                )}
              />
            ) : null}
          </FormGroup>

          {/* Status */}
          <FormGroup header="Status">
            <Row
              label="Status"
              value={statusLabel(status)}
              chevron
              onPress={() => setShowStatusPicker(true)}
            />
            <View style={styles.sliderRow}>
              <Text variant="callout" color="label" style={{ minWidth: 88 }}>
                Progress
              </Text>
              <View style={{ flex: 1 }}>
                <Controller
                  control={control}
                  name="progress"
                  render={({ field: { onChange, value } }) => (
                    <Slider
                      value={typeof value === 'number' ? value : 0}
                      onChange={onChange}
                      step={1}
                      trackColor={t.palette.blue.base}
                    />
                  )}
                />
              </View>
            </View>
          </FormGroup>

          {/* Timeline */}
          <FormGroup header="Timeline">
            <Row
              label="Start date"
              value={formatPickerDate(startDate)}
              chevron
              onPress={() => setDatePicker('start')}
            />
            <Row
              label="Target handover"
              value={endDate ? formatPickerDate(endDate) : 'Optional'}
              valueColor={endDate ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setDatePicker('end')}
              divider={false}
            />
          </FormGroup>
          {errors.endDate?.message ? (
            <FieldError text={errors.endDate.message} />
          ) : null}

          {/* Budget */}
          <FormGroup header="Budget">
            <Controller
              control={control}
              name="value"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Project value"
                  value={value}
                  onChangeText={(txt) => onChange(txt.replace(/\D/g, ''))}
                  onBlur={onBlur}
                  placeholder="₹0"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                />
              )}
            />
            <Controller
              control={control}
              name="team"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Team size"
                  value={value ?? ''}
                  onChangeText={(txt) => onChange(txt.replace(/\D/g, ''))}
                  onBlur={onBlur}
                  placeholder="e.g. 4"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {(errors.value?.message || errors.team?.message) ? (
            <FieldError text={errors.value?.message ?? errors.team?.message ?? ''} />
          ) : null}

          {submitError ? <FieldError text={submitError} /> : null}

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date pickers */}
      <DateTimeSheet
        open={datePicker === 'start'}
        value={startDate}
        onChange={(d) => {
          const n = startOfLocalDay(d);
          setValue('startDate', n, { shouldValidate: true });
        }}
        onClose={() => setDatePicker(null)}
        mode="date"
        title="Start date"
      />
      <DateTimeSheet
        open={datePicker === 'end'}
        value={endDate ?? handoverMinimum}
        onChange={(d) => {
          const n = startOfLocalDay(d);
          setValue(
            'endDate',
            new Date(Math.max(n.getTime(), handoverMinimum.getTime())),
            { shouldValidate: true },
          );
        }}
        onClose={() => setDatePicker(null)}
        mode="date"
        title="Target handover"
      />

      {/* Pickers */}
      <SelectSheet
        open={showTypePicker}
        title="Choose typology"
        options={PROJECT_TYPOLOGIES}
        selected={typology}
        onPick={(k) => pickTypology(k as ProjectTypology)}
        onClose={() => setShowTypePicker(false)}
      />

      <SelectSheet
        open={showSubTypePicker}
        title="Choose sub-type"
        options={subTypeOptions}
        selected={subTypeKey}
        onPick={(k) => setValue('subTypeKey', k, { shouldValidate: true })}
        onClose={() => setShowSubTypePicker(false)}
      />

      <SelectSheet
        open={showStatusPicker}
        title="Set project status"
        options={PROJECT_STATUS_OPTIONS}
        selected={status}
        onPick={(k) => setValue('status', k as ProjectStatus, { shouldValidate: true })}
        onClose={() => setShowStatusPicker(false)}
      />

      <SubmitProgressOverlay
        visible={isSubmitting}
        intent="generic"
        phaseLabel={savePhase}
      />
    </View>
  );
}

function FieldError({ text }: { text: string }) {
  const t = useThemeV2();
  return (
    <Text
      variant="caption2"
      style={{
        color: t.palette.red.base,
        paddingHorizontal: 32,
        marginTop: 8,
      }}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Cover photo
  photoTile: {
    height: 180,
    overflow: 'hidden',
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  photoIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Slider row inside the Status group
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 12,
    minHeight: 56,
  },
});
