/**
 * Create Project screen. Collects the project's basic information and
 * writes it to Firestore. The photo is stored as a local device URI for
 * Phase 1 — R2 upload via a presigned Cloud Function lands in the files
 * PR; until then the image is only visible on the device that picked it.
 *
 * Fields: photo, name, start date, end date, site address, value (₹).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
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
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createProject } from '@/src/features/projects/projects';
import { formatDate } from '@/src/lib/format';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80, 'Name is too long'),
    startDate: z.date(),
    endDate: z.date().nullable(),
    siteAddress: z.string().trim().min(3, 'Enter a site address'),
    value: z
      .string()
      .trim()
      .regex(/^\d+$/, 'Enter a number'),
    photoUri: z.string().nullable(),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

type FormValues = z.input<typeof schema>;

export default function NewProjectScreen() {
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? null;

  const [submitError, setSubmitError] = useState<string | undefined>();
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);

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
      startDate: new Date(),
      endDate: null,
      siteAddress: '',
      value: '',
      photoUri: null,
    },
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  const photoUri = watch('photoUri');

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to add a project photo.');
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
    // On Android the picker is a modal dialog — we always dismiss on
    // any event. On iOS it's inline so we keep it open until the user
    // explicitly dismisses via the modal's own affordance.
    if (Platform.OS === 'android') {
      setDatePicker(null);
    }
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
      });
      router.replace(`/(app)/projects/${id}` as never);
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav bar */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text variant="title" color="text" style={styles.navGlyph}>{'‹'}</Text>
        </Pressable>
        <Text variant="title" color="text" style={styles.navTitle}>
          New project
        </Text>
        <View style={styles.navButton} />
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
          {/* Photo picker tile */}
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
                <Text variant="title" color="primary">
                  +
                </Text>
                <Text variant="meta" color="textMuted" style={styles.photoHint}>
                  Add project photo
                </Text>
              </View>
            )}
          </Pressable>

          {/* Fields */}
          <View style={styles.field}>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Project name"
                  placeholder="e.g. Sharma Residence, Kondapur"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  editable={!isSubmitting}
                  error={errors.name?.message}
                />
              )}
            />
          </View>

          <View style={styles.rowFields}>
            <View style={[styles.field, styles.rowFieldHalf]}>
              <Text variant="caption" color="textMuted" style={styles.fauxLabel}>
                START DATE
              </Text>
              <Pressable
                onPress={() => setDatePicker('start')}
                style={styles.fauxField}
              >
                <Text variant="body" color="text">
                  {formatDate(startDate)}
                </Text>
              </Pressable>
            </View>
            <View style={[styles.field, styles.rowFieldHalf]}>
              <Text variant="caption" color="textMuted" style={styles.fauxLabel}>
                END DATE
              </Text>
              <Pressable
                onPress={() => setDatePicker('end')}
                style={styles.fauxField}
              >
                <Text variant="body" color={endDate ? 'text' : 'textFaint'}>
                  {endDate ? formatDate(endDate) : 'Optional'}
                </Text>
              </Pressable>
              {errors.endDate ? (
                <Text variant="caption" color="danger" style={styles.inlineError}>
                  {errors.endDate.message}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.field}>
            <Controller
              control={control}
              name="siteAddress"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Site location / address"
                  placeholder="Plot no., street, area, city"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="sentences"
                  multiline
                  editable={!isSubmitting}
                  error={errors.siteAddress?.message}
                />
              )}
            />
          </View>

          <View style={styles.field}>
            <Controller
              control={control}
              name="value"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Project value (₹)"
                  placeholder="0"
                  leading="₹"
                  value={value}
                  onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  editable={!isSubmitting}
                  error={errors.value?.message ?? submitError}
                />
              )}
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hairline,
  },
  navButtonPressed: {
    opacity: 0.7,
  },
  navGlyph: {
    fontSize: 26,
    lineHeight: 26,
    marginLeft: -2,
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    paddingHorizontal: screenInset,
    paddingBottom: space.xxxl,
  },
  photoTile: {
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    overflow: 'hidden',
    marginTop: space.base,
    marginBottom: space.xl,
    ...shadow.hairline,
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    marginTop: space.xs,
  },
  field: {
    marginBottom: space.lg,
  },
  rowFields: {
    flexDirection: 'row',
    gap: space.base,
  },
  rowFieldHalf: {
    flex: 1,
  },
  fauxLabel: {
    marginBottom: space.sm,
    letterSpacing: 0.4,
  },
  fauxField: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  inlineError: {
    marginTop: space.sm,
  },
  footer: {
    paddingHorizontal: screenInset,
    paddingBottom: space.lg,
    paddingTop: space.md,
    backgroundColor: color.bgGrouped,
  },
});
