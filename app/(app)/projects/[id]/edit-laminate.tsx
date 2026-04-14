/**
 * Edit Laminate screen. Pre-fills form from existing laminate data.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { updateLaminate, deleteLaminate } from '@/src/features/laminates/laminates';
import { useLaminates } from '@/src/features/laminates/useLaminates';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

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
  edgeBandCode: z.string().trim().min(1, 'Edge band code required'),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function EditLaminateScreen() {
  const params = useLocalSearchParams<{ id: string; lamId: string }>();
  const projectId = params.id;
  const lamId = params.lamId;
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: allLaminates, roomNames: existingRooms } = useLaminates(projectId);

  const lam = useMemo(
    () => allLaminates.find((l) => l.id === lamId),
    [allLaminates, lamId],
  );

  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoChanged, setPhotoChanged] = useState(false);
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

  // Pre-fill when laminate loads
  useEffect(() => {
    if (lam) {
      reset({
        roomName: lam.roomName,
        brand: lam.brand,
        laminateCode: lam.laminateCode || '',
        finish: lam.finish,
        edgeBandCode: lam.edgeBandCode,
        notes: lam.notes || '',
      });
      if (lam.photoUrl && !photoChanged) {
        setPhotoUri(lam.photoUrl);
      }
    }
  }, [lam, reset, photoChanged]);

  const selectedRoom = watch('roomName');

  const allRooms = [...new Set([...existingRooms, ...COMMON_ROOMS])];
  const filteredRooms = roomSearch
    ? allRooms.filter((r) => r.toLowerCase().includes(roomSearch.toLowerCase()))
    : allRooms;

  // ── Photo picker ──

  const pickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to upload laminate images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoChanged(true);
    }
  }, []);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take laminate photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoChanged(true);
    }
  }, []);

  // ── Submit ──

  async function onSubmit(data: FormData) {
    if (!lamId) return;
    setSubmitError(undefined);
    try {
      await updateLaminate(lamId, {
        roomName: data.roomName,
        brand: data.brand,
        finish: data.finish,
        edgeBandCode: data.edgeBandCode,
        laminateCode: data.laminateCode || undefined,
        photoUrl: photoChanged ? (photoUri || undefined) : undefined,
        notes: data.notes || undefined,
      });
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  async function onDelete() {
    Alert.alert('Delete Laminate', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLaminate(lamId);
            router.back();
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  }

  if (!lam) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="meta" color="textMuted">Loading...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>
          Edit Laminate
        </Text>
        <Pressable onPress={onDelete} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="trash-outline" size={20} color={color.danger} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Photo */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            LAMINATE PHOTO
          </Text>
          {photoUri ? (
            <View style={styles.photoPreview}>
              <Image source={{ uri: photoUri }} style={styles.photoImage} resizeMode="cover" />
              <Pressable
                onPress={() => { setPhotoUri(undefined); setPhotoChanged(true); }}
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
            <Text variant="body" color={selectedRoom ? 'text' : 'textFaint'} style={styles.flex}>
              {selectedRoom || 'Select room'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={color.textMuted} />
          </Pressable>

          {/* Brand */}
          <Controller control={control} name="brand" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Brand *" placeholder="e.g. Merino, Greenlam, Century" autoCapitalize="words" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.brand?.message} />
          )} />

          {/* Laminate Code */}
          <Controller control={control} name="laminateCode" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Laminate Code" placeholder="e.g. 22003 RGL, ST-15" autoCapitalize="characters" value={value ?? ''} onChangeText={onChange} onBlur={onBlur} />
          )} />

          {/* Finish */}
          <Controller control={control} name="finish" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Finish *" placeholder="e.g. Matte, Gloss, Suede, Texture" autoCapitalize="words" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.finish?.message} />
          )} />

          {/* Edge Band Code */}
          <Controller control={control} name="edgeBandCode" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Edge Band Code *" placeholder="e.g. EB-22003, Matching" autoCapitalize="characters" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.edgeBandCode?.message} />
          )} />

          {/* Notes */}
          <Controller control={control} name="notes" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Notes" placeholder="Any additional details..." multiline value={value ?? ''} onChangeText={onChange} onBlur={onBlur} />
          )} />

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>{submitError}</Text>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Button
            label="Update Laminate"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isValid || (!isDirty && !photoChanged)}
          />
        </View>
      </KeyboardAvoidingView>

      {/* ── Room Picker Modal ── */}
      <Modal visible={showRoomPicker} animationType="slide" transparent onRequestClose={() => setShowRoomPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowRoomPicker(false)}><View /></Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text variant="bodyStrong" color="text" style={styles.modalTitle}>Select Room</Text>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={color.textMuted} />
            <TextInput
              placeholder="Search or type new room..."
              placeholderTextColor={color.textFaint}
              value={roomSearch}
              onChangeText={setRoomSearch}
              style={styles.searchInput}
              autoFocus
            />
          </View>

          {existingRooms.length > 0 && !roomSearch && (
            <View style={styles.roomSectionHeader}>
              <Text variant="caption" color="textMuted">PROJECT ROOMS</Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalList}>
            {!roomSearch && existingRooms.map((r) => (
              <Pressable
                key={`existing_${r}`}
                onPress={() => { setValue('roomName', r, { shouldValidate: true, shouldDirty: true }); setShowRoomPicker(false); setRoomSearch(''); }}
                style={({ pressed }) => [styles.roomOption, selectedRoom === r && styles.roomOptionActive, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="home" size={16} color={selectedRoom === r ? color.primary : color.textMuted} />
                <Text variant="body" color={selectedRoom === r ? 'primary' : 'text'} style={selectedRoom === r ? { fontWeight: '600' } : undefined}>{r}</Text>
                {selectedRoom === r && <Ionicons name="checkmark-circle" size={18} color={color.primary} style={{ marginLeft: 'auto' }} />}
              </Pressable>
            ))}

            {!roomSearch && existingRooms.length > 0 && (
              <View style={styles.roomSectionHeader}>
                <Text variant="caption" color="textMuted">COMMON ROOMS</Text>
              </View>
            )}

            {filteredRooms.filter((r) => roomSearch || !existingRooms.includes(r)).map((r) => (
              <Pressable
                key={r}
                onPress={() => { setValue('roomName', r, { shouldValidate: true, shouldDirty: true }); setShowRoomPicker(false); setRoomSearch(''); }}
                style={({ pressed }) => [styles.roomOption, selectedRoom === r && styles.roomOptionActive, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="home-outline" size={16} color={selectedRoom === r ? color.primary : color.textMuted} />
                <Text variant="body" color={selectedRoom === r ? 'primary' : 'text'} style={selectedRoom === r ? { fontWeight: '600' } : undefined}>{r}</Text>
                {selectedRoom === r && <Ionicons name="checkmark-circle" size={18} color={color.primary} style={{ marginLeft: 'auto' }} />}
              </Pressable>
            ))}
          </ScrollView>

          {roomSearch.trim() && !allRooms.some((r) => r.toLowerCase() === roomSearch.toLowerCase()) && (
            <Pressable
              onPress={() => { setValue('roomName', roomSearch.trim(), { shouldValidate: true, shouldDirty: true }); setShowRoomPicker(false); setRoomSearch(''); }}
              style={styles.addCustomRoom}
            >
              <Ionicons name="add-circle-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">Add "{roomSearch.trim()}" as room</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: screenInset, paddingBottom: space.xs, backgroundColor: color.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: screenInset, paddingTop: space.md, paddingBottom: space.xxl },
  sectionLabel: { marginTop: space.sm, marginBottom: space.xs },

  photoActions: { flexDirection: 'row', gap: space.sm },
  photoBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.lg, borderRadius: radius.sm, borderWidth: 1, borderColor: color.primary, borderStyle: 'dashed', backgroundColor: color.primarySoft },
  photoPreview: { width: '100%', height: 200, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: color.bgGrouped },
  photoImage: { width: '100%', height: 200 },
  photoRemove: { position: 'absolute', top: space.xs, right: space.xs },

  dropdown: { flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: color.bgGrouped, borderRadius: radius.sm, borderWidth: 1, borderColor: color.border, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
  dropdownActive: { borderColor: color.primary, backgroundColor: color.primarySoft },

  footer: { paddingHorizontal: screenInset, paddingVertical: space.sm, backgroundColor: color.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.sm, paddingBottom: space.xxl, maxHeight: '70%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.border, alignSelf: 'center', marginBottom: space.sm },
  modalTitle: { textAlign: 'center', marginBottom: space.sm },
  modalList: { paddingHorizontal: screenInset, maxHeight: 350 },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginHorizontal: screenInset, marginBottom: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: color.bgGrouped, borderWidth: 1, borderColor: color.border },
  searchInput: { flex: 1, fontSize: 15, color: color.text, paddingVertical: Platform.OS === 'ios' ? space.xs : 0 },

  roomSectionHeader: { paddingVertical: space.xs, paddingHorizontal: screenInset },
  roomOption: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator },
  roomOptionActive: { backgroundColor: color.primarySoft, borderRadius: radius.sm },
  addCustomRoom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, paddingVertical: space.md, marginHorizontal: screenInset, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.separator },
});
