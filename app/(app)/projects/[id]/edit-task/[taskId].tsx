/**
 * Edit Task — v2 design.
 *
 * Owner-only. Loads the live task and lets the owner patch its definition
 * (title/description/status/dates/category/assignee/reference photos).
 * Progress % is NOT edited here — members post a TaskUpdate for that.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "Edit milestone" · Save
 *   2. Title hero card — editable title + status pill row
 *   3. FormGroup "Details" — Category · Description
 *   4. FormGroup "Schedule" — Start date · End date
 *   5. FormGroup "Assignee" — Party row
 *   6. Reference photos block (existing + staged) with red close badges
 *   7. Delete button at bottom (red.soft pill)
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { guessImageMimeType } from '@/src/lib/r2Upload';
import {
  commitStagedFiles,
  makeStagedFile,
  type StagedFile,
} from '@/src/lib/commitStagedFiles';
import { createTaskCategory } from '@/src/features/tasks/taskCategories';
import { useTask } from '@/src/features/tasks/useTasks';
import { useTaskCategories } from '@/src/features/tasks/useTaskCategories';
import { type TaskCategory, type TaskPriority, type TaskStatus } from '@/src/features/tasks/types';
import { PartyPickerModal } from '@/src/ui/PartyPickerModal';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { CategorySheet } from '@/src/features/tasks/CategorySheet';
import { formatDate } from '@/src/lib/format';
import { useThemeV2 } from '@/src/theme/v2';

const STATUS_OPTIONS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'not_started', label: 'Not started' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
];

export default function EditTaskScreen() {
  useGuardedRoute({ capability: 'task.write' });
  const t = useThemeV2();
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
      let newUploadedUrls: string[] = [];
      let failedCount = 0;
      if (staged.length > 0) {
        setSavePhase(`Uploading 0 of ${staged.length}…`);
        const { uploaded, failed } = await commitStagedFiles({
          files: staged,
          kind: 'task_photo',
          refId: task.id,
          projectId,
          compress: 'balanced',
          onProgress: (done, total) => setSavePhase(`Uploading ${done} of ${total}…`),
        });
        newUploadedUrls = uploaded.map((u) => u.publicUrl);
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

      setSavePhase('Saving milestone…');
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

      if (failedCount > 0) {
        Alert.alert(
          'Some uploads failed',
          `${failedCount} of ${staged.length} new photo(s) failed. The milestone was saved with the rest.`,
        );
      }
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
    Alert.alert('Delete milestone?', 'This cannot be undone.', [
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

  // Loading
  if (loading && !task) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit milestone"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="footnote" color="secondary">Loading…</Text>
        </View>
      </View>
    );
  }
  if (!task) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit milestone"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="footnote" color="secondary">Milestone not found.</Text>
        </View>
      </View>
    );
  }
  if (!isOwner) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Cannot edit"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={[styles.centered, { padding: 32 }]}>
          <Ionicons name="lock-closed-outline" size={32} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
            Only the milestone owner can edit
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center' }}
          >
            You can still post progress updates from the milestone screen.
          </Text>
        </View>
      </View>
    );
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const selectedCategoryLabel =
    categoryOptions.find((c) => c.key === category)?.label ?? 'General';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="Edit milestone"
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={saving}
        saveDisabled={!title.trim()}
        onCancel={() => router.back()}
        onSave={onSave}
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
          {/* Title hero */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View
              style={[
                styles.titleCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.hero,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                MILESTONE TITLE
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Install kitchen cabinets"
                placeholderTextColor={t.colors.tertiary}
                autoCapitalize="sentences"
                style={[
                  styles.titleInput,
                  {
                    color: t.colors.label,
                    ...t.type.title3,
                    fontWeight: '700',
                  },
                ]}
                multiline
              />
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((s) => {
                  const active = status === s.key;
                  const tone =
                    s.key === 'completed'
                      ? { fg: t.palette.green.base, bg: t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft }
                      : s.key === 'ongoing'
                        ? { fg: t.palette.blue.base, bg: t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft }
                        : { fg: t.colors.secondary, bg: t.colors.fill3 };
                  return (
                    <Pressable
                      key={s.key}
                      onPress={() => setStatus(s.key)}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.statusChip,
                        {
                          backgroundColor: active ? tone.bg : t.colors.fill3,
                          borderRadius: 999,
                          borderColor: active ? tone.fg + '33' : 'transparent',
                          borderWidth: active ? 1 : 0,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <View
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: active ? tone.fg : t.colors.tertiary,
                          marginRight: 5,
                        }}
                      />
                      <Text
                        variant="caption2"
                        style={{
                          color: active ? tone.fg : t.colors.secondary,
                          fontWeight: '700',
                          letterSpacing: 0.3,
                        }}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Details */}
          <FormGroup header="Details">
            <Row
              label="Category"
              value={selectedCategoryLabel}
              chevron
              onPress={() => setShowCategorySheet(true)}
            />
            <InputRow
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Details about this milestone"
              multiline
              divider={false}
            />
          </FormGroup>

          {/* Schedule */}
          <FormGroup header="Schedule">
            <Row
              label="Start date"
              value={startDate ? formatDate(startDate) : 'Not set'}
              valueColor={startDate ? undefined : t.colors.tertiary}
              chevron
              onPress={() => {
                setShowEndDate(false);
                setShowStartDate(true);
              }}
            />
            <Row
              label="End date"
              value={endDate ? formatDate(endDate) : 'Optional'}
              valueColor={endDate ? undefined : t.colors.tertiary}
              chevron
              onPress={() => {
                setShowStartDate(false);
                setShowEndDate(true);
              }}
              divider={false}
            />
          </FormGroup>

          {/* Assignee */}
          <FormGroup header="Assignee">
            <Row
              label="Party"
              value={assignedToName || 'Unassigned'}
              valueColor={assignedToName ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setShowPartyPicker(true)}
              divider={false}
            />
          </FormGroup>

          {/* Reference photos */}
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              REFERENCE PHOTOS
            </Text>
            <View style={styles.photoRow}>
              {existingPhotos.map((url) => (
                <View key={url} style={styles.photoThumbWrap}>
                  <Image
                    source={{ uri: url }}
                    style={[styles.photoThumb, { borderRadius: t.radii.tile }]}
                  />
                  <Pressable
                    onPress={() => removeExistingPhoto(url)}
                    hitSlop={6}
                    style={[
                      styles.photoClose,
                      { backgroundColor: t.palette.red.base },
                    ]}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {staged.map((p) => (
                <View key={p.id} style={styles.photoThumbWrap}>
                  <Image
                    source={{ uri: p.localUri }}
                    style={[styles.photoThumb, { borderRadius: t.radii.tile }]}
                  />
                  <Pressable
                    onPress={() => removeStagedPhoto(p.id)}
                    hitSlop={6}
                    style={[
                      styles.photoClose,
                      { backgroundColor: t.palette.red.base },
                    ]}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              <Pressable
                onPress={pickPhotos}
                style={({ pressed }) => [
                  styles.photoAdd,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                    borderRadius: t.radii.tile,
                    borderColor: t.palette.blue.base + '33',
                    borderWidth: t.hairline,
                    borderStyle: 'dashed',
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="add" size={20} color={t.palette.blue.base} />
              </Pressable>
            </View>
          </View>

          {/* Delete */}
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
                style={{
                  color: t.palette.red.base,
                  fontWeight: '700',
                  marginLeft: 6,
                }}
              >
                Delete milestone
              </Text>
            </Pressable>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <DateTimeSheet
        open={showStartDate}
        value={startDate ?? new Date()}
        onChange={(d) => setStartDate(d)}
        onClose={() => setShowStartDate(false)}
        mode="date"
        title="Start date"
      />
      <DateTimeSheet
        open={showEndDate}
        value={endDate ?? new Date()}
        onChange={(d) => setEndDate(d)}
        onClose={() => setShowEndDate(false)}
        mode="date"
        title="End date"
      />

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

      <CategorySheet
        open={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        categoryOptions={categoryOptions}
        selectedCategory={category}
        onPick={(k) => setCategory(k as TaskCategory)}
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        addingCategory={addingCategory}
        onAddCategory={addCategoryNow}
      />

      <SubmitProgressOverlay
        visible={saving}
        intent="updateTask"
        phaseLabel={savePhase}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 60 },

  titleCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  titleInput: {
    marginTop: 6,
    paddingVertical: 0,
    margin: 0,
    minHeight: 30,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumbWrap: {
    position: 'relative',
  },
  photoThumb: {
    width: 72,
    height: 72,
  },
  photoClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
