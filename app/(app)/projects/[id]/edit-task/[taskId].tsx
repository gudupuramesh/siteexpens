/**
 * Edit Task — owner-only. Loads the live task, lets the owner patch its
 * definition (title/description/status/priority/dates/assignee/reference photos).
 * Progress % is NOT edited here — members post a TaskUpdate for that instead.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from "@/src/features/org/useGuardedRoute";
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
import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import {
  commitStagedFiles,
  makeStagedFile,
  type StagedFile,
} from '@/src/lib/commitStagedFiles';
import { deleteR2Object } from '@/src/lib/r2Delete';
import { createTaskCategory } from '@/src/features/tasks/taskCategories';
import { useTask } from '@/src/features/tasks/useTasks';
import { useTaskCategories } from '@/src/features/tasks/useTaskCategories';
import { type TaskCategory, type TaskPriority, type TaskStatus } from '@/src/features/tasks/types';
import { Button } from '@/src/ui/Button';
import { DatePickerModal } from '@/src/ui/DatePickerModal';
import { PartyPickerModal } from '@/src/ui/PartyPickerModal';
import { Screen } from '@/src/ui/Screen';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
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
  useGuardedRoute({ capability: 'task.write' });
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
  // Photos: existing URLs from the task doc + newly-staged local
  // files. Existing URLs are kept as-is (we don't re-upload them).
  // Staged files upload during Save.
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [savePhase, setSavePhase] = useState<string>();
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
    setExistingPhotos(task.photoUris ?? []);
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
      quality: 0.85,
    });
    if (res.canceled) return;
    // Stage locally — upload during Save.
    const newEntries = res.assets.map((a) =>
      makeStagedFile({
        localUri: a.uri,
        contentType: a.mimeType || guessImageMimeType(a.uri),
      }),
    );
    setStaged((prev) => [...prev, ...newEntries]);
  };

  function removeExistingPhoto(url: string) {
    setExistingPhotos((prev) => prev.filter((u) => u !== url));
  }
  function removeStagedPhoto(id: string) {
    setStaged((prev) => prev.filter((p) => p.id !== id));
  }

  const onSave = async () => {
    if (!task || !projectId) return;
    if (!title.trim()) {
      Alert.alert('Title required');
      return;
    }
    setSaving(true);
    try {
      // Step 1 — upload any newly-staged photos.
      let newUploadedUrls: string[] = [];
      let failedCount = 0;
      let uploadedKeys: { key: string; sizeBytes: number; contentType: string }[] = [];
      if (staged.length > 0) {
        setSavePhase(`Uploading 0 of ${staged.length}…`);
        const { uploaded, failed } = await commitStagedFiles({
          files: staged,
          kind: 'task_photo',
          refId: task.id,
          projectId,
          compress: 'balanced',
          onProgress: (done, total) => {
            setSavePhase(`Uploading ${done} of ${total}…`);
          },
        });
        newUploadedUrls = uploaded.map((u) => u.publicUrl);
        uploadedKeys = uploaded.map((u) => ({
          key: u.key,
          sizeBytes: u.sizeBytes,
          contentType: u.contentType,
        }));
        failedCount = failed.length;
        if (uploaded.length === 0 && failed.length > 0) {
          Alert.alert(
            'Uploads failed',
            `All ${failed.length} new photo(s) failed to upload. Tap Save again to retry.`,
          );
          setSavePhase(undefined);
          setSaving(false);
          return;
        }
      }

      // Step 2 — combine kept-existing + newly-uploaded URLs.
      setSavePhase('Saving task…');
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
        photoUris: [...existingPhotos, ...newUploadedUrls],
      });
      // recordStorageEvent already fired inside commitStagedFiles
      // (because we passed projectId), so nothing more to do here.

      if (failedCount > 0) {
        Alert.alert(
          'Some uploads failed',
          `${failedCount} of ${staged.length} new photo(s) failed. The task was saved with the rest.`,
        );
      }
      // Wait briefly so the parent screen's onSnapshot listener catches
      // the just-updated task before navigation completes.
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
      setSavePhase(undefined);
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
            // We don't have R2 keys for existing task photos in the
            // current schema (Task only stores URLs, not keys), so
            // we can't precisely delete them here — a future orphan
            // sweep handles those. Note: any newly-staged files in
            // this session were never uploaded (upload-on-save), so
            // there's nothing to clean up for them either.
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
              <Pressable
                onPress={() => {
                  setShowEndDate(false);
                  setShowStartDate(true);
                }}
                style={styles.dateBtn}
              >
                <Text variant="body" color="text">
                  {startDate ? formatDate(startDate) : 'Not set'}
                </Text>
              </Pressable>
              <DatePickerModal
                visible={showStartDate}
                value={startDate ?? new Date()}
                onClose={() => setShowStartDate(false)}
                onConfirm={(d) => setStartDate(d)}
              />
            </View>
            <View style={styles.dateField}>
              <Text variant="caption" color="textMuted" style={styles.label}>END DATE</Text>
              <Pressable
                onPress={() => {
                  setShowStartDate(false);
                  setShowEndDate(true);
                }}
                style={styles.dateBtn}
              >
                <Text variant="body" color="text">
                  {endDate ? formatDate(endDate) : 'Not set'}
                </Text>
              </Pressable>
              <DatePickerModal
                visible={showEndDate}
                value={endDate ?? new Date()}
                onClose={() => setShowEndDate(false)}
                onConfirm={(d) => setEndDate(d)}
              />
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

          {/* Reference photos — existing (R2 URLs) shown first, then
              newly-staged local files. Both are removable. Upload of
              the staged ones happens during Save. */}
          <Text variant="caption" color="textMuted" style={styles.label}>REFERENCE PHOTOS</Text>
          <View style={styles.photoRow}>
            {existingPhotos.map((url) => (
              <View key={`exist-${url}`} style={styles.photoThumbWrap}>
                <Image source={{ uri: url }} style={styles.photoThumb} />
                <Pressable
                  onPress={() => removeExistingPhoto(url)}
                  style={styles.photoClose}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {staged.map((p) => (
              <View key={p.id} style={styles.photoThumbWrap}>
                <Image source={{ uri: p.localUri }} style={styles.photoThumb} />
                <Pressable
                  onPress={() => removeStagedPhoto(p.id)}
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
          <Button
            label={savePhase ?? 'Save Timeline'}
            onPress={onSave}
            loading={saving}
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

      <SubmitProgressOverlay
        visible={saving}
        intent="updateTask"
        phaseLabel={savePhase}
      />
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
    borderRadius: radius.sm,
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
    borderRadius: radius.sm,
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
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoThumbWrap: { position: 'relative' },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
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
  // Status overlay on each photo thumb during R2 upload (or error).
  photoOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
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
    borderRadius: radius.sm,
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
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    color: color.text,
  },
  newCategoryBtn: {
    width: 72,
    minHeight: 42,
    borderRadius: radius.sm,
    backgroundColor: color.primary,
    borderWidth: 1,
    borderColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
