/**
 * Edit Laminate — v2 design.
 *
 * Same shape as add-laminate, pre-filled. Existing photo can be replaced
 * (stage → upload → swap doc → delete old R2 key) or cleared. Adds a
 * red.soft "Delete laminate" button.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { updateLaminate, deleteLaminate } from '@/src/features/laminates/laminates';
import { guessImageMimeType } from '@/src/lib/r2Upload';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';
import { deleteR2Object } from '@/src/lib/r2Delete';
import { useLaminates } from '@/src/features/laminates/useLaminates';
import { RoomPickerSheet } from '@/src/features/laminates/RoomPickerSheet';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const COMMON_ROOMS = [
  'Living Room', 'Master Bedroom', 'Bedroom 2', 'Bedroom 3',
  'Kitchen', 'Bathroom', 'Kids Room', 'Study Room',
  'Dining Room', 'Hall', 'Pooja Room', 'Balcony',
  'Wardrobe', 'TV Unit', 'Shoe Rack', 'Crockery Unit',
];

const schema = z.object({
  roomName: z.string().trim().min(1, 'Room name required'),
  brand: z.string().trim().min(1, 'Brand required'),
  laminateCode: z.string().trim().optional().or(z.literal('')),
  finish: z.string().trim().min(1, 'Finish required'),
  edgeBandCode: z.string().trim().optional().or(z.literal('')),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function EditLaminateScreen() {
  useGuardedRoute({ capability: 'laminate.write' });
  const t = useThemeV2();
  const params = useLocalSearchParams<{ id: string; lamId: string }>();
  const projectId = params.id;
  const lamId = params.lamId;
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: allLaminates, roomNames: existingRooms, loading } = useLaminates(projectId);

  const lam = useMemo(
    () => allLaminates.find((l) => l.id === lamId),
    [allLaminates, lamId],
  );

  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | undefined>();
  const [existingPhotoKey, setExistingPhotoKey] = useState<string | undefined>();
  const [stagedReplacement, setStagedReplacement] = useState<StagedFile | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [savePhase, setSavePhase] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isValid, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      roomName: '',
      brand: '',
      laminateCode: '',
      finish: '',
      edgeBandCode: '',
      notes: '',
    },
    mode: 'onChange',
  });

  // Pre-fill the form ONCE per laminate. Same pattern as edit-transaction:
  // `lam` is a Firestore snapshot result whose object reference changes on
  // every re-emit (auth refresh, peer write, retry, etc.). Keying on
  // `lam.id` keeps the user's mid-edit input from being snapped back to
  // the saved value when an unrelated snapshot fires.
  const hydratedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!lam) return;
    if (hydratedForId.current === lam.id) return;
    hydratedForId.current = lam.id;
    reset({
      roomName: lam.roomName,
      brand: lam.brand,
      laminateCode: lam.laminateCode || '',
      finish: lam.finish,
      edgeBandCode: lam.edgeBandCode,
      notes: lam.notes || '',
    });
    if (lam.photoUrl && !stagedReplacement && !photoCleared && !existingPhotoUrl) {
      setExistingPhotoUrl(lam.photoUrl);
      setExistingPhotoKey(lam.photoStoragePath);
    }
  }, [lam?.id, lam, reset, stagedReplacement, photoCleared, existingPhotoUrl]);

  const selectedRoom = watch('roomName');

  const stagePicked = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    setStagedReplacement({
      id: 'replacement',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
    setPhotoCleared(false);
  }, []);

  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload laminate images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) stagePicked(result.assets[0]);
  }, [stagePicked]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take laminate photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!result.canceled && result.assets[0]) stagePicked(result.assets[0]);
  }, [stagePicked]);

  async function onSubmit(data: FormData) {
    if (!lamId || !projectId) return;
    setSubmitError(undefined);
    try {
      let newPhotoUrl: string | undefined;
      let newPhotoKey: string | undefined;
      if (stagedReplacement) {
        setSavePhase('Uploading photo…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [stagedReplacement],
          kind: 'laminate',
          refId: projectId,
          projectId,
          compress: 'balanced',
        });
        if (failed.length > 0) {
          setSubmitError(`Photo upload failed: ${failed[0].error}`);
          setSavePhase(undefined);
          return;
        }
        newPhotoUrl = uploaded[0].publicUrl;
        newPhotoKey = uploaded[0].key;
      }

      let photoUrl: string | undefined;
      let photoStoragePath: string | undefined;
      if (newPhotoUrl) {
        photoUrl = newPhotoUrl;
        photoStoragePath = newPhotoKey;
      } else if (photoCleared) {
        photoUrl = '';
        photoStoragePath = '';
      }

      setSavePhase('Saving laminate…');
      await updateLaminate(lamId, {
        roomName: data.roomName,
        brand: data.brand,
        finish: data.finish,
        edgeBandCode: data.edgeBandCode?.trim() || undefined,
        laminateCode: data.laminateCode || undefined,
        photoUrl,
        photoStoragePath,
        notes: data.notes || undefined,
      });

      const shouldDeleteOld =
        existingPhotoKey
        && (newPhotoKey || photoCleared)
        && existingPhotoKey !== newPhotoKey;
      if (shouldDeleteOld && existingPhotoKey) {
        void deleteR2Object({
          projectId,
          key: existingPhotoKey,
          kind: 'laminate',
          refId: projectId,
          sizeBytes: 0,
          contentType: 'image/jpeg',
        });
      }
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  async function onDelete() {
    Alert.alert('Delete laminate', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const photoKey = lam?.photoStoragePath;
            await deleteLaminate(lamId);
            if (photoKey && projectId) {
              void deleteR2Object({
                projectId,
                key: photoKey,
                kind: 'laminate',
                refId: projectId,
                sizeBytes: 0,
                contentType: 'image/jpeg',
              });
            }
            router.back();
            router.back();
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  }

  // Loading
  if (loading && !lam) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit laminate"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.center}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }
  if (!lam) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit laminate"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.center}>
          <Text variant="body" color="secondary">Laminate not found.</Text>
        </View>
      </View>
    );
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const showingNew = stagedReplacement !== null;
  const showingExisting = !showingNew && !photoCleared && !!existingPhotoUrl;
  const previewUri = showingNew ? stagedReplacement!.localUri : existingPhotoUrl;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="Edit laminate"
        cancelLabel="Cancel"
        saveLabel={savePhase ?? 'Save'}
        saveLoading={isSubmitting}
        saveDisabled={!isValid || (!isDirty && !stagedReplacement && !photoCleared) || !orgId}
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
          {/* Photo */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              LAMINATE PHOTO
            </Text>
            {previewUri && (showingNew || showingExisting) ? (
              <View
                style={[
                  styles.photoWrap,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.card,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <Image
                  source={{ uri: previewUri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => {
                    if (showingNew) {
                      setStagedReplacement(null);
                    } else {
                      setPhotoCleared(true);
                    }
                  }}
                  hitSlop={6}
                  style={[
                    styles.photoClose,
                    { backgroundColor: 'rgba(255,255,255,0.92)' },
                  ]}
                >
                  <Ionicons name="close-circle" size={22} color={t.palette.red.base} />
                </Pressable>
                {showingNew ? (
                  <View
                    style={[
                      styles.photoBadge,
                      {
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        borderRadius: 999,
                      },
                    ]}
                  >
                    <Text
                      variant="caption2"
                      style={{ color: '#fff', fontWeight: '700', letterSpacing: 0.4 }}
                    >
                      NEW · UNSAVED
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View
                style={[
                  styles.emptyPhoto,
                  {
                    backgroundColor: t.colors.fill3,
                    borderRadius: t.radii.card,
                  },
                ]}
              >
                <Ionicons name="image-outline" size={28} color={t.colors.tertiary} />
                <Text variant="caption1" color="tertiary" style={{ marginTop: 6 }}>
                  No photo
                </Text>
              </View>
            )}
            <View style={styles.photoBtnRow}>
              <PhotoBtn icon="camera-outline" label="Camera" onPress={takePhoto} />
              <PhotoBtn icon="image-outline" label="Gallery" onPress={pickPhoto} />
            </View>
          </View>

          {/* Identity */}
          <FormGroup header="Identity">
            <Row
              label="Room"
              value={selectedRoom || 'Pick a room'}
              valueColor={selectedRoom ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setShowRoomPicker(true)}
            />
            <Controller
              control={control}
              name="brand"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Brand"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Merino, Greenlam"
                  autoCapitalize="words"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {(errors.roomName?.message || errors.brand?.message) ? (
            <FieldNote
              text={errors.roomName?.message ?? errors.brand?.message ?? ''}
              tone={t.palette.red.base}
            />
          ) : null}

          {/* Spec */}
          <FormGroup header="Specification">
            <Controller
              control={control}
              name="laminateCode"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Code"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. 22003 RGL"
                  autoCapitalize="characters"
                />
              )}
            />
            <Controller
              control={control}
              name="finish"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Finish"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Matte, Gloss, Suede"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="edgeBandCode"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Edge band"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Optional · EB-22003"
                  autoCapitalize="characters"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {errors.finish?.message ? (
            <FieldNote text={errors.finish.message} tone={t.palette.red.base} />
          ) : null}

          {/* Notes */}
          <FormGroup header="Notes">
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Note"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Additional details"
                  multiline
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {submitError ? (
            <FieldNote text={submitError} tone={t.palette.red.base} />
          ) : null}

          <View style={{ paddingHorizontal: 16, marginTop: 26 }}>
            <Pressable
              onPress={onDelete}
              hitSlop={6}
              style={({ pressed }) => [
                styles.deleteBtn,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                  borderRadius: t.radii.field,
                  borderColor: t.palette.red.base + '33',
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="trash-outline" size={16} color={t.palette.red.base} />
              <Text
                variant="footnote"
                style={{ color: t.palette.red.base, fontWeight: '700', marginLeft: 6 }}
              >
                Delete laminate
              </Text>
            </Pressable>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <RoomPickerSheet
        open={showRoomPicker}
        selected={selectedRoom}
        existingRooms={existingRooms}
        commonRooms={COMMON_ROOMS}
        onPick={(r) => setValue('roomName', r, { shouldValidate: true, shouldDirty: true })}
        onClose={() => setShowRoomPicker(false)}
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

function PhotoBtn({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.photoBtn,
        {
          backgroundColor:
            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
          borderRadius: t.radii.field,
          borderColor: t.palette.blue.base + '33',
          borderWidth: t.hairline,
          borderStyle: 'dashed',
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={icon} size={16} color={t.palette.blue.base} />
      <Text
        variant="footnote"
        style={{ color: t.palette.blue.base, fontWeight: '700', marginLeft: 6 }}
      >
        Replace · {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 60 },

  photoWrap: { overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: 220 },
  photoClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 12,
  },
  photoBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  emptyPhoto: {
    width: '100%',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
