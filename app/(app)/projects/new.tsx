/**
 * Create Project — InteriorOS-styled form (grouped-list pattern).
 *
 * Sections (top → bottom):
 *   • DETAILS  — name, location, full site address
 *   • TYPE     — typology picker, sub-type picker (with "Other" → text input)
 *   • STATUS   — status picker, progress slider (draggable)
 *   • TIMELINE — start, target handover
 *   • BUDGET   — value (₹)
 *   • PHOTO    — optional cover photo
 *
 * Client + team are intentionally not collected here — they're added
 * later from the project detail screen.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Controller, useForm } from 'react-hook-form';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createProject } from '@/src/features/projects/projects';
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
import { color, fontFamily } from '@/src/theme/tokens';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
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
    photoUri: z.string().nullable(),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

type FormValues = z.input<typeof schema>;

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
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? null;

  const [submitError, setSubmitError] = useState<string>();
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showSubTypePicker, setShowSubTypePicker] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      location: '',
      siteAddress: '',
      typology: undefined,
      subTypeKey: undefined,
      subTypeCustom: '',
      status: 'active',
      progress: 0,
      startDate: new Date(),
      endDate: null,
      value: '',
      photoUri: null,
    },
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const photoUri = watch('photoUri');
  const status = watch('status');
  const typology = watch('typology');
  const subTypeKey = watch('subTypeKey');

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
      Alert.alert('Permission needed', 'Allow photo library access to add a project photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setValue('photoUri', result.assets[0].uri, { shouldValidate: true });
    }
  }

  function handleDateChange(kind: 'start' | 'end', event: DateTimePickerEvent, picked?: Date) {
    if (Platform.OS === 'android') setDatePicker(null);
    if (event.type === 'dismissed' || !picked) return;
    if (kind === 'start') {
      setValue('startDate', picked, { shouldValidate: true });
    } else {
      setValue('endDate', picked, { shouldValidate: true });
    }
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
      const id = await createProject({
        uid: user.uid,
        orgId,
        name: values.name.trim(),
        startDate: values.startDate,
        endDate: values.endDate,
        siteAddress: values.siteAddress.trim(),
        value: parseInt(values.value, 10),
        photoUri: values.photoUri,
        status: values.status,
        location: values.location?.trim() || undefined,
        typology: values.typology,
        subType,
        progress: values.progress,
      });
      router.replace(`/(app)/projects/${id}` as never);
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  const showSubTypeCustom =
    typology === 'other' || subTypeKey === 'other';

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={color.textMuted} />
        </Pressable>
        <View style={styles.navCenter}>
          <RNText style={styles.navEyebrow}>CREATE</RNText>
          <RNText style={styles.navTitle}>New project</RNText>
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
              onPress={() => setDatePicker('start')}
            />
            <PickerRow
              label="Target handover"
              icon="flag-outline"
              value={endDate ? formatPickerDate(endDate) : undefined}
              placeholder="Optional"
              onPress={() => setDatePicker('end')}
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

          {/* PHOTO */}
          <Group header="Cover photo (optional)">
            <Pressable
              onPress={handlePickPhoto}
              style={({ pressed }) => [
                styles.photoTile,
                pressed && { opacity: 0.85 },
              ]}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photoImg} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="image-outline" size={22} color={color.textFaint} />
                  <RNText style={styles.photoHint}>Tap to add a project photo</RNText>
                </View>
              )}
            </Pressable>
          </Group>

          {submitError ? (
            <RNText style={[styles.fieldError, { paddingHorizontal: 16, marginTop: 4 }]}>
              {submitError}
            </RNText>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            label="Create project"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!orgId}
          />
        </View>
      </KeyboardAvoidingView>

      {datePicker ? (
        <DateTimePicker
          value={datePicker === 'start' ? startDate : (endDate ?? startDate)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
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

  // Slider row inside the Status group
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

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
});
