/**
 * Add Task form. Title, description, status, priority, dates, quantity, unit,
 * assignee (project member picker), photos.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
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
import { createTask } from '@/src/features/tasks/tasks';
import { createTaskCategory } from '@/src/features/tasks/taskCategories';
import { useTaskCategories } from '@/src/features/tasks/useTaskCategories';
import { type TaskCategory, type TaskStatus } from '@/src/features/tasks/types';
import { Button } from '@/src/ui/Button';
import { PartyPickerModal } from '@/src/ui/PartyPickerModal';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { formatDate } from '@/src/lib/format';
import { color, radius, screenInset, space } from '@/src/theme';

const STATUS_OPTIONS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'not_started', label: 'Not Started' },
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

export default function AddTaskScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [submitError, setSubmitError] = useState<string>();
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [assignedTo, setAssignedTo] = useState('');
  const [assignedToName, setAssignedToName] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
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

  const selectedStatus = watch('status');
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
      quality: 0.7,
    });
    if (!res.canceled) {
      setPhotoUris((prev) => [...prev, ...res.assets.map((a) => a.uri)]);
    }
  }

  async function onSubmit(data: FormData) {
    if (!user || !orgId || !projectId) return;
    setSubmitError(undefined);
    try {
      await createTask({
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
        photoUris,
        createdBy: user.uid,
      });
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={20} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>TIMELINE</Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Add Task</Text>
        </View>
        <View style={styles.navBtn} />
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
          {/* Category */}
          <Text variant="caption" color="textMuted" style={styles.label}>CATEGORY</Text>
          <Pressable onPress={() => setShowCategorySheet(true)} style={styles.assignBtn}>
            <Ionicons name="layers-outline" size={18} color={color.textMuted} />
            <Text variant="body" color="text" style={styles.flex}>
              {selectedCategoryLabel}
            </Text>
            <Ionicons name="chevron-down" size={16} color={color.textFaint} />
          </Pressable>
          {errors.category?.message ? (
            <Text variant="caption" color="danger" style={{ marginTop: 4 }}>
              {errors.category.message}
            </Text>
          ) : null}

          <Controller
            control={control}
            name="title"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Task Title"
                placeholder="e.g. Install kitchen cabinets"
                autoCapitalize="sentences"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.title?.message}
                square
                strongBorder
              />
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Description (optional)"
                placeholder="Details about the task"
                multiline
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                square
                strongBorder
              />
            )}
          />

          {/* Status */}
          <Text variant="caption" color="textMuted" style={styles.label}>STATUS</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((s) => {
              const active = selectedStatus === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setValue('status', s.key, { shouldValidate: true })}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text variant="caption" style={{ color: active ? '#fff' : color.text }}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Dates */}
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text variant="caption" color="textMuted" style={styles.label}>START DATE</Text>
              <Pressable onPress={() => setShowStartDate(true)} style={styles.dateBtn}>
                <Text variant="body" color="text">{formatDate(startDate)}</Text>
              </Pressable>
              {showStartDate && (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => { setShowStartDate(Platform.OS === 'ios'); if (d) setStartDate(d); }}
                />
              )}
            </View>
            <View style={styles.dateField}>
              <Text variant="caption" color="textMuted" style={styles.label}>END DATE</Text>
              <Pressable onPress={() => setShowEndDate(true)} style={styles.dateBtn}>
                <Text variant="body" color="text">{endDate ? formatDate(endDate) : 'Not set'}</Text>
              </Pressable>
              {showEndDate && (
                <DateTimePicker
                  value={endDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => { setShowEndDate(Platform.OS === 'ios'); if (d) setEndDate(d); }}
                />
              )}
            </View>
          </View>

          {/* Assignee */}
          <Text variant="caption" color="textMuted" style={styles.label}>ASSIGNED TO</Text>
          <Pressable onPress={() => setShowPartyPicker(true)} style={styles.assignBtn}>
            <Ionicons name="person-circle-outline" size={20} color={color.textMuted} />
            <Text variant="body" color={assignedToName ? 'text' : 'textMuted'} style={styles.flex}>
              {assignedToName || 'Pick a party'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={color.textFaint} />
          </Pressable>

          {/* Photos */}
          <Text variant="caption" color="textMuted" style={styles.label}>PHOTOS</Text>
          <View style={styles.photoRow}>
            {photoUris.map((uri) => (
              <View key={uri} style={styles.photoThumbWrap}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <Pressable
                  onPress={() => setPhotoUris((prev) => prev.filter((u) => u !== uri))}
                  style={styles.photoClose}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={pickPhotos} style={styles.photoAdd}>
              <Ionicons name="add" size={22} color={color.primary} />
            </Pressable>
          </View>

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.xs }}>
              {submitError}
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Create Timeline"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isValid || !orgId}
          />
        </View>
      </KeyboardAvoidingView>

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

      <Modal
        visible={showCategorySheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategorySheet(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowCategorySheet(false)}>
          <View />
        </Pressable>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text variant="bodyStrong" color="text" style={styles.sheetTitle}>
              Select category
            </Text>
            <ScrollView
              style={{ maxHeight: 360 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.newCategoryRow}>
                <TextInput
                  value={newCategory}
                  onChangeText={setNewCategory}
                  placeholder="Add new category"
                  placeholderTextColor={color.textFaint}
                  style={styles.newCategoryInput}
                />
                <Pressable
                  onPress={addCategoryNow}
                  disabled={!newCategory.trim() || addingCategory}
                  style={({ pressed }) => [
                    styles.newCategoryBtn,
                    (!newCategory.trim() || addingCategory) && { opacity: 0.5 },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text variant="metaStrong" style={{ color: color.onPrimary }}>
                    ADD
                  </Text>
                </Pressable>
              </View>

              {categoryOptions.map((c) => {
                const active = selectedCategory === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => {
                      setValue('category', c.key, { shouldValidate: true });
                      setShowCategorySheet(false);
                    }}
                    style={[styles.sheetOption, active && styles.sheetOptionActive]}
                  >
                    <Text variant="body" color="text">
                      {c.label}
                    </Text>
                    {active ? <Ionicons name="checkmark" size={16} color={color.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
    paddingTop: 2,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navEyebrow: { letterSpacing: 1.2 },
  navTitle: { textAlign: 'center' },
  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: 12,
    paddingBottom: space.xl,
    backgroundColor: color.bgGrouped,
  },
  label: { marginTop: space.md, marginBottom: space.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  chipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  dateRow: { flexDirection: 'row', gap: space.sm },
  dateField: { flex: 1 },
  dateBtn: {
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoThumbWrap: { position: 'relative' },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.none,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  photoClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  footer: {
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: screenInset,
    paddingTop: 8,
    paddingBottom: 20,
  },
  sheetHandle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.borderStrong,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetTitle: { marginBottom: 10 },
  sheetOption: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: radius.none,
    paddingHorizontal: space.sm,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetOptionActive: {
    backgroundColor: color.primarySoft,
  },
  newCategoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  newCategoryInput: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: radius.none,
    paddingHorizontal: space.sm,
    color: color.text,
  },
  newCategoryBtn: {
    width: 72,
    minHeight: 42,
    borderRadius: radius.none,
    backgroundColor: color.primary,
    borderWidth: 1,
    borderColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
