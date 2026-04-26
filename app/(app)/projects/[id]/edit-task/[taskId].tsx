/**
 * Edit Task — owner-only. Loads the live task, lets the owner patch its
 * definition (title/description/status/priority/dates/assignee/reference photos).
 * Progress % is NOT edited here — members post a TaskUpdate for that instead.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { deleteTask, updateTask } from '@/src/features/tasks/tasks';
import { createTaskCategory } from '@/src/features/tasks/taskCategories';
import { useTask } from '@/src/features/tasks/useTasks';
import { useTaskCategories } from '@/src/features/tasks/useTaskCategories';
import { type TaskCategory, type TaskPriority, type TaskStatus } from '@/src/features/tasks/types';
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

export default function EditTaskScreen() {
  const { id: projectId, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: task, loading } = useTask(taskId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('not_started');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState<TaskCategory>('general');
  const [startDate, setStartDate] = useState<Date | null>(null);
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
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const { data: categoryOptions } = useTaskCategories(orgId);

  // Hydrate once the task loads.
  useEffect(() => {
    if (hydrated || !task) return;
    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setPriority(task.priority);
    setCategory(task.category ?? 'general');
    setStartDate(task.startDate ? task.startDate.toDate() : null);
    setEndDate(task.endDate ? task.endDate.toDate() : null);
    setAssignedTo(task.assignedTo);
    setAssignedToName(task.assignedToName);
    setPhotoUris(task.photoUris ?? []);
    setHydrated(true);
  }, [task, hydrated]);

  const isOwner = !!user && !!task && task.createdBy === user.uid;

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

  const pickPhotos = async () => {
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
  };

  const onSave = async () => {
    if (!task) return;
    if (!title.trim()) {
      Alert.alert('Title required');
      return;
    }
    setSaving(true);
    try {
      await updateTask(task.id, {
        title: title.trim(),
        description,
        status,
        priority,
        category,
        startDate,
        endDate,
        assignedTo,
        assignedToName,
        photoUris,
      });
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!task) return;
    Alert.alert('Delete task?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(task.id);
            // Pop twice: out of edit screen and out of the detail screen.
            router.back();
            router.back();
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  };

  if (loading && !task) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (!task) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <Text variant="meta" color="textMuted">Task not found.</Text>
        </View>
      </Screen>
    );
  }

  if (!isOwner) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="arrow-back" size={20} color={color.text} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text variant="caption" color="textMuted" style={styles.navEyebrow}>TIMELINE</Text>
            <Text variant="bodyStrong" color="text" style={styles.navTitle}>Edit Task</Text>
          </View>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.loading}>
          <Ionicons name="lock-closed-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={{ marginTop: space.sm }}>
            Only the task owner can edit
          </Text>
          <Text variant="meta" color="textMuted" align="center" style={{ marginTop: space.xs }}>
            You can still post progress updates from the task screen.
          </Text>
        </View>
      </Screen>
    );
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
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Edit Task</Text>
        </View>
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
          {/* Category */}
          <Text variant="caption" color="textMuted" style={styles.label}>CATEGORY</Text>
          <Pressable onPress={() => setShowCategorySheet(true)} style={styles.assignBtn}>
            <Ionicons name="layers-outline" size={18} color={color.textMuted} />
            <Text variant="body" color="text" style={styles.flex}>
              {categoryOptions.find((c) => c.key === category)?.label ?? 'General'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={color.textFaint} />
          </Pressable>

          <TextField
            label="Task Title"
            value={title}
            onChangeText={setTitle}
            autoCapitalize="sentences"
            square
            strongBorder
          />

          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            square
            strongBorder
          />

          {/* Status */}
          <Text variant="caption" color="textMuted" style={styles.label}>STATUS</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((s) => {
              const active = status === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setStatus(s.key)}
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
                <Text variant="body" color="text">
                  {startDate ? formatDate(startDate) : 'Not set'}
                </Text>
              </Pressable>
              {showStartDate && (
                <DateTimePicker
                  value={startDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => {
                    setShowStartDate(Platform.OS === 'ios');
                    if (d) setStartDate(d);
                  }}
                />
              )}
            </View>
            <View style={styles.dateField}>
              <Text variant="caption" color="textMuted" style={styles.label}>END DATE</Text>
              <Pressable onPress={() => setShowEndDate(true)} style={styles.dateBtn}>
                <Text variant="body" color="text">
                  {endDate ? formatDate(endDate) : 'Not set'}
                </Text>
              </Pressable>
              {showEndDate && (
                <DateTimePicker
                  value={endDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => {
                    setShowEndDate(Platform.OS === 'ios');
                    if (d) setEndDate(d);
                  }}
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

          {/* Reference photos */}
          <Text variant="caption" color="textMuted" style={styles.label}>REFERENCE PHOTOS</Text>
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
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Save Timeline" onPress={onSave} loading={saving} />
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
                const active = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => {
                      setCategory(c.key);
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
  flex: { flex: 1, minWidth: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: screenInset },
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
  chipActive: { backgroundColor: color.primary, borderColor: color.primary },
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
