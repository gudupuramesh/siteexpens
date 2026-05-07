/**
 * Add Laminate — select room, enter brand, finish, edge band code,
 * laminate code, and upload a photo.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from "@/src/features/org/useGuardedRoute";
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createLaminate } from '@/src/features/laminates/laminates';
import { useLaminates } from '@/src/features/laminates/useLaminates';
import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';
import { Button } from '@/src/ui/Button';
import { useKeyboardVerticalOffset } from '@/src/ui/KeyboardFormLayout';
import { useKeyboardHeightWhile } from '@/src/ui/useKeyboardHeightWhile';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

// Common room names for quick selection
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
  // Optional — many laminates ship without a separate edge-band SKU.
  edgeBandCode: z.string().trim().optional().or(z.literal('')),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function AddLaminateScreen() {
  useGuardedRoute({ capability: 'laminate.write' });
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { roomNames: existingRooms } = useLaminates(projectId);

  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  // Photo is staged locally on pick — R2 upload only happens during
  // Save, so abandoning the form leaves nothing in the bucket.
  const [stagedPhoto, setStagedPhoto] = useState<StagedFile | null>(null);
  const [savePhase, setSavePhase] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const roomKeyboardHeight = useKeyboardHeightWhile(showRoomPicker);
  const keyboardVerticalOffset = useKeyboardVerticalOffset(0);

  const closeRoomPicker = useCallback(() => {
    Keyboard.dismiss();
    setShowRoomPicker(false);
    setRoomSearch('');
  }, []);

  const roomListMaxHeight = useMemo(() => {
    const headerBlock = 200;
    if (roomKeyboardHeight > 0) {
      return Math.max(140, windowHeight - roomKeyboardHeight - headerBlock - 16);
    }
    return Math.min(380, windowHeight * 0.44);
  }, [windowHeight, roomKeyboardHeight]);
  // iOS handles keyboard insets natively on the ScrollView (auto-scroll +
  // contentInset). Android relies on KeyboardAvoidingView padding behavior.
  const KeyboardWrap = Platform.OS === 'ios' ? View : KeyboardAvoidingView;
  const keyboardWrapProps =
    Platform.OS === 'ios'
      ? { style: styles.flex }
      : {
          style: styles.flex,
          behavior: 'padding' as const,
          keyboardVerticalOffset,
        };

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

  // Combine existing rooms + common rooms, deduplicated
  const allRooms = [...new Set([...existingRooms, ...COMMON_ROOMS])];
  const filteredRooms = roomSearch
    ? allRooms.filter((r) => r.toLowerCase().includes(roomSearch.toLowerCase()))
    : allRooms;

  // ── Photo picker ──
  // Picking just stores the local URI. Upload happens during Save
  // (see onSubmit) so backing out without saving creates no orphans.

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

  // ── Submit ──

  async function onSubmit(data: FormData) {
    if (!user || !orgId || !projectId) return;
    setSubmitError(undefined);
    try {
      // Step 1 — upload the staged photo (if any) to R2.
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

      // Step 2 — create the laminate doc.
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

      // Step 3 — record storage event (best effort).
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
      // Snapshot-propagation buffer (see add-transaction.tsx).
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="close" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>
          Add Laminate
        </Text>
        <View style={styles.navBtn} />
      </View>

      <KeyboardWrap {...keyboardWrapProps}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
        >
          {/* Photo */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            LAMINATE PHOTO
          </Text>
          {stagedPhoto ? (
            <View style={styles.photoPreview}>
              <Image
                source={{ uri: stagedPhoto.localUri }}
                style={styles.photoImage}
                resizeMode="cover"
              />
              <Pressable
                onPress={() => setStagedPhoto(null)}
                style={styles.photoRemove}
              >
                <Ionicons name="close-circle" size={24} color={color.danger} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoActions}>
              <Pressable onPress={takePhoto} style={styles.photoBtn}>
                <Ionicons name="camera-outline" size={24} color={color.primary} />
                <Text variant="meta" color="primary">Camera</Text>
              </Pressable>
              <Pressable onPress={pickPhoto} style={styles.photoBtn}>
                <Ionicons name="image-outline" size={24} color={color.primary} />
                <Text variant="meta" color="primary">Gallery</Text>
              </Pressable>
            </View>
          )}

          {/* Room */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            ROOM *
          </Text>
          <Pressable
            onPress={() => setShowRoomPicker(true)}
            style={[styles.dropdown, selectedRoom ? styles.dropdownActive : undefined]}
          >
            <Ionicons name="home-outline" size={18} color={selectedRoom ? color.primary : color.textMuted} />
            <Text
              variant="body"
              color={selectedRoom ? 'text' : 'textFaint'}
              style={styles.flex}
            >
              {selectedRoom || 'Select room'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={color.textMuted} />
          </Pressable>
          {errors.roomName?.message && (
            <Text variant="caption" color="danger" style={{ marginTop: 4 }}>
              {errors.roomName.message}
            </Text>
          )}

          {/* Brand */}
          <Controller
            control={control}
            name="brand"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Brand *"
                placeholder="e.g. Merino, Greenlam, Century"
                autoCapitalize="words"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.brand?.message}
              />
            )}
          />

          {/* Laminate Code */}
          <Controller
            control={control}
            name="laminateCode"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Laminate Code"
                placeholder="e.g. 22003 RGL, ST-15"
                autoCapitalize="characters"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          {/* Finish */}
          <Controller
            control={control}
            name="finish"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Finish *"
                placeholder="e.g. Matte, Gloss, Suede, Texture"
                autoCapitalize="words"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.finish?.message}
              />
            )}
          />

          {/* Edge Band Code */}
          <Controller
            control={control}
            name="edgeBandCode"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Edge Band Code"
                placeholder="Optional — e.g. EB-22003, Matching"
                autoCapitalize="characters"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.edgeBandCode?.message}
              />
            )}
          />

          {/* Notes */}
          <Controller
            control={control}
            name="notes"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Notes"
                placeholder="Any additional details..."
                multiline
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>
              {submitError}
            </Text>
          )}

          {/* Save inside scroll so Notes + CTA can scroll above the keyboard */}
          <View style={styles.footer}>
            <Button
              label={savePhase ?? 'Save Laminate'}
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              disabled={!isValid || !orgId}
            />
          </View>
        </ScrollView>
      </KeyboardWrap>

      {/* ── Room Picker Modal ── */}
      <Modal
        visible={showRoomPicker}
        animationType="slide"
        transparent
        onRequestClose={closeRoomPicker}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeRoomPicker} accessibilityRole="button" />
          <View
            style={[
              styles.modalSheet,
              {
                marginBottom:
                  roomKeyboardHeight > 0
                    ? roomKeyboardHeight
                    : Math.max(insets.bottom, space.sm),
              },
            ]}
          >
          <View style={styles.modalHandle} />
          <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
            Select Room
          </Text>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={color.textMuted} />
            <TextInput
              placeholder="Search or type new room..."
              placeholderTextColor={color.textFaint}
              value={roomSearch}
              onChangeText={setRoomSearch}
              style={styles.searchInput}
              autoFocus
              returnKeyType="search"
            />
          </View>

          {/* Existing project rooms header */}
          {existingRooms.length > 0 && !roomSearch && (
            <View style={styles.roomSectionHeader}>
              <Text variant="caption" color="textMuted">PROJECT ROOMS</Text>
            </View>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={[styles.modalList, { maxHeight: roomListMaxHeight }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Existing project rooms first */}
            {!roomSearch && existingRooms.map((r) => (
              <Pressable
                key={`existing_${r}`}
                onPress={() => {
                  setValue('roomName', r, { shouldValidate: true });
                  Keyboard.dismiss();
                  closeRoomPicker();
                }}
                style={({ pressed }) => [
                  styles.roomOption,
                  selectedRoom === r && styles.roomOptionActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="home" size={16} color={selectedRoom === r ? color.primary : color.textMuted} />
                <Text
                  variant="body"
                  color={selectedRoom === r ? 'primary' : 'text'}
                  style={selectedRoom === r ? { fontWeight: '600' } : undefined}
                >
                  {r}
                </Text>
                {selectedRoom === r && (
                  <Ionicons name="checkmark-circle" size={18} color={color.primary} style={{ marginLeft: 'auto' }} />
                )}
              </Pressable>
            ))}

            {/* Divider */}
            {!roomSearch && existingRooms.length > 0 && (
              <View style={styles.roomSectionHeader}>
                <Text variant="caption" color="textMuted">COMMON ROOMS</Text>
              </View>
            )}

            {/* Common / filtered rooms */}
            {filteredRooms
              .filter((r) => roomSearch || !existingRooms.includes(r))
              .map((r) => (
                <Pressable
                  key={r}
                  onPress={() => {
                    setValue('roomName', r, { shouldValidate: true });
                    Keyboard.dismiss();
                    closeRoomPicker();
                  }}
                  style={({ pressed }) => [
                    styles.roomOption,
                    selectedRoom === r && styles.roomOptionActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="home-outline" size={16} color={selectedRoom === r ? color.primary : color.textMuted} />
                  <Text
                    variant="body"
                    color={selectedRoom === r ? 'primary' : 'text'}
                    style={selectedRoom === r ? { fontWeight: '600' } : undefined}
                  >
                    {r}
                  </Text>
                  {selectedRoom === r && (
                    <Ionicons name="checkmark-circle" size={18} color={color.primary} style={{ marginLeft: 'auto' }} />
                  )}
                </Pressable>
              ))}
          </ScrollView>

          {/* Add custom room */}
          {roomSearch.trim() && !allRooms.some((r) => r.toLowerCase() === roomSearch.toLowerCase()) && (
            <Pressable
              onPress={() => {
                setValue('roomName', roomSearch.trim(), { shouldValidate: true });
                Keyboard.dismiss();
                closeRoomPicker();
              }}
              style={styles.addCustomRoom}
            >
              <Ionicons name="add-circle-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">
                Add "{roomSearch.trim()}" as room
              </Text>
            </Pressable>
          )}
          </View>
        </View>
      </Modal>
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
  navTitle: { flex: 1, textAlign: 'center' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },

  sectionLabel: {
    marginTop: space.sm,
    marginBottom: space.xs,
  },

  // Photo
  photoActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  photoBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    // Match the New File form's Image/PDF picker — white surface
    // with a primary border, not a primary-soft fill. The dashed
    // outline is dropped because the New File form uses a solid
    // border there too.
    backgroundColor: color.bg,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: color.bgGrouped,
  },
  photoImage: {
    width: '100%',
    height: 200,
  },
  photoRemove: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
  },
  // Translucent overlay shown while the picked photo uploads to R2.
  photoUploadOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Dropdown
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    minHeight: 52,
  },
  dropdownActive: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },

  // Footer (inside ScrollView — scrolls with form above keyboard)
  footer: {
    marginTop: space.lg,
    marginHorizontal: -screenInset,
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.lg,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },

  // Modal — bottom sheet lifted by keyboard via marginBottom + listeners
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    maxHeight: '88%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: space.sm,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: space.sm,
  },
  modalList: {
    paddingHorizontal: screenInset,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: screenInset,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: color.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },

  roomSectionHeader: {
    paddingVertical: space.xs,
    paddingHorizontal: screenInset,
  },
  roomOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  roomOptionActive: {
    backgroundColor: color.primarySoft,
    borderRadius: radius.sm,
  },
  addCustomRoom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    marginHorizontal: screenInset,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
});
