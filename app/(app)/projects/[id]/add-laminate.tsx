/**
 * Add Laminate — v2 design.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "Add laminate" · Save
 *   2. Photo block (staged image OR camera/gallery picker)
 *   3. FormGroup "Identity" — Room (RoomPickerSheet) · Brand
 *   4. FormGroup "Spec" — Code · Finish · Edge band
 *   5. FormGroup "Notes" — multiline
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useState } from 'react';
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
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createLaminate } from '@/src/features/laminates/laminates';
import { useLaminates } from '@/src/features/laminates/useLaminates';
import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { RoomPickerSheet } from '@/src/features/laminates/RoomPickerSheet';
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

export default function AddLaminateScreen() {
  useGuardedRoute({ capability: 'laminate.write' });
  const t = useThemeV2();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { roomNames: existingRooms } = useLaminates(projectId);

  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [stagedPhoto, setStagedPhoto] = useState<StagedFile | null>(null);
  const [savePhase, setSavePhase] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
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

  const selectedRoom = watch('roomName');

  const stagePicked = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    setSubmitError(undefined);
    setStagedPhoto({
      id: 'photo',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
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
    if (!user || !orgId || !projectId) return;
    setSubmitError(undefined);
    try {
      let photoPublicUrl: string | undefined;
      let photoKey: string | undefined;
      let photoSize = 0;
      let photoContentType = '';
      if (stagedPhoto) {
        setSavePhase('Uploading photo…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [stagedPhoto],
          kind: 'laminate',
          refId: projectId,
          compress: 'balanced',
        });
        if (failed.length > 0) {
          setSubmitError(`Photo upload failed: ${failed[0].error}`);
          setSavePhase(undefined);
          return;
        }
        const ok = uploaded[0];
        photoPublicUrl = ok.publicUrl;
        photoKey = ok.key;
        photoSize = ok.sizeBytes;
        photoContentType = ok.contentType;
      }

      setSavePhase('Saving laminate…');
      const laminateId = await createLaminate({
        projectId,
        orgId,
        roomName: data.roomName,
        brand: data.brand,
        finish: data.finish,
        edgeBandCode: data.edgeBandCode?.trim() || undefined,
        laminateCode: data.laminateCode || undefined,
        photoUrl: photoPublicUrl,
        photoStoragePath: photoKey,
        notes: data.notes || undefined,
        createdBy: user.uid,
      });

      if (photoKey) {
        void recordStorageEvent({
          projectId,
          kind: 'laminate',
          refId: laminateId,
          key: photoKey,
          sizeBytes: photoSize,
          contentType: photoContentType,
          action: 'upload',
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

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="Add laminate"
        cancelLabel="Cancel"
        saveLabel={savePhase ?? 'Save'}
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
          {/* Photo */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              LAMINATE PHOTO
            </Text>
            {stagedPhoto ? (
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
                  source={{ uri: stagedPhoto.localUri }}
                  style={styles.photo}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => setStagedPhoto(null)}
                  hitSlop={6}
                  style={[
                    styles.photoClose,
                    { backgroundColor: 'rgba(255,255,255,0.92)' },
                  ]}
                >
                  <Ionicons name="close-circle" size={22} color={t.palette.red.base} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.photoBtnRow}>
                <PhotoBtn icon="camera-outline" label="Camera" onPress={takePhoto} />
                <PhotoBtn icon="image-outline" label="Gallery" onPress={pickPhoto} />
              </View>
            )}
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

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <RoomPickerSheet
        open={showRoomPicker}
        selected={selectedRoom}
        existingRooms={existingRooms}
        commonRooms={COMMON_ROOMS}
        onPick={(r) => setValue('roomName', r, { shouldValidate: true })}
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
      <Ionicons name={icon} size={22} color={t.palette.blue.base} />
      <Text
        variant="footnote"
        style={{
          color: t.palette.blue.base,
          fontWeight: '700',
          marginTop: 4,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 60 },

  photoWrap: { overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: 220 },
  photoClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 12,
  },
  photoBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
  },
});
