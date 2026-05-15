/**
 * Create Project — v2 design.
 *
 * Layout (top → bottom):
 *   1. SheetHeader: Cancel · "New project" · Create
 *   2. KeyboardAvoidingView + ScrollView so keyboard never overlaps inputs
 *      a. Cover photo card (tap to pick — image preview or placeholder)
 *      b. FormGroup "Details"  — Name · Location · Site (multiline)
 *      c. FormGroup "Type"     — Typology · Sub-type (conditional) · Custom
 *      d. FormGroup "Status"   — Status · Progress slider
 *      e. FormGroup "Timeline" — Start date · Target handover
 *      f. FormGroup "Budget"   — Project value (₹)
 *
 * Pickers use v2 SelectSheet (typology / sub-type / status) and v2
 * DateTimeSheet (with proper Done button).
 *
 * Cover photo is staged locally on pick — no R2 upload happens until the
 * user taps Create project. This prevents orphans when the user backs
 * out without saving.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
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

import { useAuth } from '@/src/features/auth/useAuth';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createProject, PlanLimitError } from '@/src/features/projects/projects';
import { usePaywall } from '@/src/features/billing/usePaywall';
import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';
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
    photoUri: z.string().nullable(),
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

export default function NewProjectScreen() {
  // Belt-and-braces route guard. UI hides the projects-list FAB for
  // roles without `project.create`, but a deep link / stale nav
  // stack could still land here — bounce them home.
  useGuardedRoute({ capability: 'project.create' });

  const t = useThemeV2();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? null;
  const { openPaywall } = usePaywall();

  const initialStartDate = useMemo(() => startOfLocalDay(new Date()), []);

  const [submitError, setSubmitError] = useState<string>();
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showSubTypePicker, setShowSubTypePicker] = useState(false);
  const [stagedCover, setStagedCover] = useState<StagedFile | null>(null);
  const [coverError, setCoverError] = useState<string>();
  const [savePhase, setSavePhase] = useState<string>();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
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
      photoUri: null,
    },
  });

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
    setStagedCover({
      id: 'cover',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    if (!user || !orgId) {
      setSubmitError('You need to be signed in with an organization.');
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
      // Step 1 — upload cover photo if picked.
      let coverPublicUrl: string | null = null;
      let coverKey: string | null = null;
      let coverSize = 0;
      let coverContentType = '';
      if (stagedCover) {
        setSavePhase('Uploading cover…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [stagedCover],
          kind: 'project_cover',
          refId: user.uid,
          compress: 'balanced',
        });
        if (failed.length > 0) {
          setSubmitError(`Cover photo upload failed: ${failed[0].error}`);
          setSavePhase(undefined);
          return;
        }
        const ok = uploaded[0];
        coverPublicUrl = ok.publicUrl;
        coverKey = ok.key;
        coverSize = ok.sizeBytes;
        coverContentType = ok.contentType;
      }

      // Step 2 — create the project doc.
      setSavePhase('Saving project…');
      const teamNum =
        values.team && values.team.trim().length > 0
          ? parseInt(values.team, 10)
          : undefined;
      const id = await createProject({
        uid: user.uid,
        orgId,
        name: values.name.trim(),
        startDate: values.startDate,
        endDate: values.endDate,
        siteAddress: values.siteAddress.trim(),
        value: parseInt(values.value, 10),
        photoUri: coverPublicUrl,
        photoR2Key: coverKey,
        status: values.status,
        location: values.location?.trim() || undefined,
        typology: values.typology,
        subType,
        progress: values.progress,
        client: values.client?.trim() || undefined,
        team: teamNum,
      });

      // Step 3 — attribute the cover upload to project storage. Best-effort.
      if (coverKey) {
        void recordStorageEvent({
          projectId: id,
          kind: 'project_cover',
          refId: id,
          key: coverKey,
          sizeBytes: coverSize,
          contentType: coverContentType,
          action: 'upload',
        });
      }
      router.replace(`/(app)/projects/${id}` as never);
    } catch (err) {
      if (err instanceof PlanLimitError) {
        openPaywall({ reason: 'plan_limit_projects' });
        setSavePhase(undefined);
        return;
      }
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  const showSubTypeCustom =
    typology === 'other' || subTypeKey === 'other';

  // Date picker — keep the picked value within bounds (today / startDate).
  const todayStart = startOfLocalDay(new Date());
  const handoverMinimum = new Date(
    Math.max(startOfLocalDay(startDate).getTime(), todayStart.getTime()),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="New project"
        cancelLabel="Cancel"
        saveLabel="Create"
        saveLoading={isSubmitting}
        saveDisabled={!orgId}
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
              {stagedCover ? (
                <>
                  <Image
                    source={{ uri: stagedCover.localUri }}
                    style={styles.photoImg}
                    resizeMode="cover"
                  />
                  <View
                    style={[
                      styles.photoBadge,
                      { backgroundColor: 'rgba(0,0,0,0.55)' },
                    ]}
                  >
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
            {coverError ? (
              <Text
                variant="caption2"
                style={{ color: t.palette.red.base, marginTop: 6, paddingHorizontal: 4 }}
              >
                {coverError}
              </Text>
            ) : null}
          </View>

          {/* Details */}
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
            <FieldError
              text={errors.name?.message ?? errors.siteAddress?.message ?? ''}
            />
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
          {errors.value?.message || errors.team?.message ? (
            <FieldError text={errors.value?.message ?? errors.team?.message ?? ''} />
          ) : null}

          {submitError ? (
            <FieldError text={submitError} />
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date pickers — bottom sheet with Done button */}
      <DateTimeSheet
        open={datePicker === 'start'}
        value={startDate}
        onChange={(d) => {
          const n = startOfLocalDay(d);
          setValue(
            'startDate',
            new Date(Math.max(n.getTime(), todayStart.getTime())),
            { shouldValidate: true },
          );
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

      {/* Pickers — typology / sub-type / status */}
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
        intent="createProject"
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

  // Slider row inside the Status group — keeps the v1 Slider but in v2-styled row
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 12,
    minHeight: 56,
  },
});
