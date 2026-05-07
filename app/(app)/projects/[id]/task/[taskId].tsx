/**
 * Task detail — read-only view.
 *  • Any project member can post a progress update (note + photos + new %).
 *  • Only the task owner (createdBy === currentUser.uid) sees the "Edit"
 *    pencil in the header, which routes to the edit-task screen.
 *
 * The `progress` field on the task mirrors the most recent TaskUpdate.progress,
 * updated transactionally in `addTaskUpdate`.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
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
import { addTaskUpdate, updateTaskStatus } from '@/src/features/tasks/tasks';
import { useTask } from '@/src/features/tasks/useTasks';
import { useTaskUpdates } from '@/src/features/tasks/useTaskUpdates';
import { DEFAULT_TASK_CATEGORIES, type TaskStatus } from '@/src/features/tasks/types';
import { guessImageMimeType } from '@/src/lib/r2Upload';
import {
  commitStagedFiles,
  makeStagedFile,
  type StagedFile,
} from '@/src/lib/commitStagedFiles';
import { ImageViewer } from '@/src/ui/ImageViewer';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { Text } from '@/src/ui/Text';
import { formatDate } from '@/src/lib/format';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

const STATUS_CFG: Record<TaskStatus, { bg: string; fg: string; label: string }> = {
  not_started: { bg: color.dangerSoft, fg: color.danger, label: 'Not Started' },
  ongoing: { bg: color.warningSoft, fg: color.warning, label: 'Ongoing' },
  completed: { bg: color.successSoft, fg: color.success, label: 'Completed' },
};

const PROGRESS_SHORTCUTS = [0, 25, 50, 75, 100] as const;

const STATUS_OPTIONS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'not_started', label: 'Not Started' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
];

function formatUpdateTime(d: Date | null): string {
  if (!d) return '';
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatDate(d);
}

function getCategoryLabel(key: string | undefined): string {
  if (!key) return 'General';
  const fromDefault = DEFAULT_TASK_CATEGORIES.find((c) => c.key === key)?.label;
  if (fromDefault) return fromDefault;
  return key
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

export default function TaskDetailScreen() {
  const { id: projectId, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const { data: task, loading } = useTask(taskId);
  const { data: updates } = useTaskUpdates(taskId);

  const [showPostModal, setShowPostModal] = useState(false);
  const [draftProgress, setDraftProgress] = useState<number>(0);
  const [draftText, setDraftText] = useState('');
  // Image preview state — one viewer can show any photo group
  // (the task's reference photos or any update's photo array).
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  function openPhotoViewer(images: string[], startIndex = 0) {
    setViewerImages(images);
    setViewerIndex(startIndex);
  }

  // Draft photos for the post-update modal — staged locally, uploaded
  // only when the user taps Post. Backing out of the modal without
  // posting leaves zero R2 objects.
  const [draftPhotos, setDraftPhotos] = useState<StagedFile[]>([]);
  const [postPhase, setPostPhase] = useState<string>();
  const [posting, setPosting] = useState(false);

  const isOwner = !!user && !!task && task.createdBy === user.uid;
  const progressPct = task?.progress ?? 0;

  const openPostModal = () => {
    setDraftProgress(task?.progress ?? 0);
    setDraftText('');
    setDraftPhotos([]);
    setShowPostModal(true);
  };

  // Stage picks locally — upload happens during Post Update.
  const stageDraftAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
    const newEntries = assets.map((a) =>
      makeStagedFile({
        localUri: a.uri,
        contentType: a.mimeType || guessImageMimeType(a.uri),
      }),
    );
    setDraftPhotos((prev) => [...prev, ...newEntries]);
  };

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
    if (!res.canceled) stageDraftAssets(res.assets);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Camera access is required.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (!res.canceled) stageDraftAssets(res.assets);
  };

  function removeDraftPhoto(id: string) {
    setDraftPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  const changeStatus = async (next: TaskStatus) => {
    if (!task || next === task.status) return;
    try {
      Haptics.selectionAsync();
      await updateTaskStatus(task.id, next);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    }
  };

  const submitUpdate = async () => {
    if (!task || !user) return;
    setPosting(true);
    try {
      // Step 1 — upload any staged photos.
      let uploadedUrls: string[] = [];
      let failedCount = 0;
      if (draftPhotos.length > 0 && projectId) {
        setPostPhase(`Uploading 0 of ${draftPhotos.length}…`);
        const { uploaded, failed } = await commitStagedFiles({
          files: draftPhotos,
          kind: 'task_update',
          refId: task.id,
          projectId,
          compress: 'balanced',
          onProgress: (done, total) => setPostPhase(`Uploading ${done} of ${total}…`),
        });
        uploadedUrls = uploaded.map((u) => u.publicUrl);
        failedCount = failed.length;
        if (uploaded.length === 0 && failed.length > 0) {
          Alert.alert(
            'Uploads failed',
            `All ${failed.length} photo(s) failed to upload. Tap Post Update again to retry.`,
          );
          setPostPhase(undefined);
          setPosting(false);
          return;
        }
      }
      setPostPhase('Posting update…');
      await addTaskUpdate(task.id, {
        authorId: user.uid,
        authorName: userDoc?.displayName ?? 'Member',
        progress: draftProgress,
        text: draftText.trim(),
        photoUris: uploadedUrls,
      });
      if (failedCount > 0) {
        Alert.alert(
          'Some uploads failed',
          `${failedCount} of ${draftPhotos.length} photo(s) failed. The update was posted with the rest.`,
        );
      }
      setShowPostModal(false);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setPosting(false);
      setPostPhase(undefined);
    }
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
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="arrow-back" size={20} color={color.text} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text variant="caption" color="textMuted" style={styles.navEyebrow}>TIMELINE</Text>
            <Text variant="bodyStrong" color="text" style={styles.navTitle}>Task</Text>
          </View>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.loading}>
          <Text variant="meta" color="textMuted">Task not found.</Text>
        </View>
      </Screen>
    );
  }

  const categoryLabel = getCategoryLabel(task.category);

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={20} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>TIMELINE</Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Task</Text>
        </View>
        {isOwner ? (
          <Pressable
            onPress={() => router.push(`/(app)/projects/${projectId}/edit-task/${task.id}` as never)}
            hitSlop={12}
            style={styles.navBtn}
          >
            <Ionicons name="create-outline" size={20} color={color.primary} />
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title card ── */}
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text variant="title" color="text" style={styles.flex}>
              {task.title}
            </Text>
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <Text variant="caption" color="primary">{categoryLabel.toUpperCase()}</Text>
            </View>
          </View>
          {!!task.description && (
            <Text variant="body" color="text" style={{ marginTop: space.sm }}>
              {task.description}
            </Text>
          )}

          <Text variant="caption" color="textMuted" style={styles.statusLabel}>
            STATUS · TAP TO CHANGE
          </Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((s) => {
              const active = task.status === s.key;
              const cfg = STATUS_CFG[s.key];
              return (
                <Pressable
                  key={s.key}
                  onPress={() => changeStatus(s.key)}
                  style={[
                    styles.statusChip,
                    active && { backgroundColor: cfg.bg, borderColor: cfg.fg },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: active ? cfg.fg : color.border },
                    ]}
                  />
                  <Text
                    variant="caption"
                    style={{ color: active ? cfg.fg : color.textMuted }}
                  >
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Progress card ── */}
        <View style={styles.card}>
          <View style={styles.progressHeader}>
            <Text variant="caption" color="textMuted">PROGRESS</Text>
            <Text variant="title" color="text">{progressPct}%</Text>
          </View>
          <View style={styles.progressBg}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPct}%`,
                  backgroundColor: progressPct >= 100 ? color.success : color.primary,
                },
              ]}
            />
          </View>
        </View>

        {/* ── Meta card ── */}
        <View style={styles.card}>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={16} color={color.textMuted} />
            <Text variant="caption" color="textMuted" style={styles.metaLabel}>Start</Text>
            <Text variant="meta" color="text">
              {task.startDate ? formatDate(task.startDate.toDate()) : 'Not set'}
            </Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaRow}>
            <Ionicons name="flag-outline" size={16} color={color.textMuted} />
            <Text variant="caption" color="textMuted" style={styles.metaLabel}>Due</Text>
            <Text variant="meta" color="text">
              {task.endDate ? formatDate(task.endDate.toDate()) : 'Not set'}
            </Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaRow}>
            <Ionicons name="layers-outline" size={16} color={color.textMuted} />
            <Text variant="caption" color="textMuted" style={styles.metaLabel}>Category</Text>
            <Text variant="meta" color="text">{categoryLabel}</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaRow}>
            <Ionicons name="person-outline" size={16} color={color.textMuted} />
            <Text variant="caption" color="textMuted" style={styles.metaLabel}>Assigned</Text>
            <Text variant="meta" color={task.assignedToName ? 'text' : 'textMuted'}>
              {task.assignedToName || 'Unassigned'}
            </Text>
          </View>
        </View>

        {/* ── Reference photos ── */}
        {(task.photoUris ?? []).length > 0 && (
          <View style={styles.card}>
            <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
              REFERENCE PHOTOS
            </Text>
            <View style={styles.photoGrid}>
              {task.photoUris.map((uri, i) => (
                <Pressable
                  key={uri}
                  onPress={() => openPhotoViewer(task.photoUris, i)}
                >
                  <Image source={{ uri }} style={styles.photoThumb} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── Updates feed ── */}
        <View style={styles.card}>
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            UPDATES ({updates.length})
          </Text>

          {updates.length === 0 ? (
            <View style={styles.updatesEmpty}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={color.textFaint} />
              <Text variant="meta" color="textMuted" align="center">
                No updates yet. Post the first progress update below.
              </Text>
            </View>
          ) : (
            updates.map((u) => (
              <View key={u.id} style={styles.updateRow}>
                <View style={styles.updateAvatar}>
                  <Text variant="metaStrong" style={{ color: color.onPrimary }}>
                    {u.authorName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.updateHeader}>
                    <Text variant="metaStrong" color="text">{u.authorName}</Text>
                    <Text variant="caption" color="textMuted">
                      {formatUpdateTime(u.createdAt ? u.createdAt.toDate() : null)}
                    </Text>
                  </View>
                  <View style={styles.updateProgressPill}>
                    <Ionicons name="trending-up" size={12} color={color.primary} />
                    <Text variant="caption" color="primary">Progress {u.progress}%</Text>
                  </View>
                  {!!u.text && (
                    <Text variant="body" color="text" style={{ marginTop: 4 }}>
                      {u.text}
                    </Text>
                  )}
                  {(u.photoUris ?? []).length > 0 && (
                    <View style={styles.updatePhotoGrid}>
                      {u.photoUris.map((uri, i) => (
                        <Pressable
                          key={uri}
                          onPress={() => openPhotoViewer(u.photoUris, i)}
                        >
                          <Image source={{ uri }} style={styles.updatePhoto} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Floating Post Update button ── */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={openPostModal}
          style={({ pressed }) => [styles.postBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={16} color={color.onPrimary} />
          <Text variant="metaStrong" style={{ color: color.onPrimary }}>
            POST UPDATE
          </Text>
        </Pressable>
      </View>

      {/* ── Post Update modal ── */}
      <Modal
        visible={showPostModal}
        animationType="slide"
        transparent
        onRequestClose={() => !posting && setShowPostModal(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => !posting && setShowPostModal(false)}
        >
          <View />
        </Pressable>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text variant="bodyStrong" color="text" style={styles.sheetTitle}>
              Post Progress Update
            </Text>

            <Text variant="caption" color="textMuted" style={styles.sheetLabel}>
              NEW PROGRESS — {draftProgress}%
            </Text>
            <View style={styles.shortcutRow}>
              {PROGRESS_SHORTCUTS.map((p) => {
                const active = draftProgress === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setDraftProgress(p)}
                    style={[styles.shortcutChip, active && styles.shortcutChipActive]}
                  >
                    <Text
                      variant="metaStrong"
                      style={{ color: active ? color.onPrimary : color.text }}
                    >
                      {p}%
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => setDraftProgress((p) => Math.max(0, p - 5))}
                style={styles.stepBtn}
                hitSlop={6}
              >
                <Ionicons name="remove" size={18} color={color.text} />
              </Pressable>
              <View style={styles.progressBg}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${draftProgress}%`, backgroundColor: color.primary },
                  ]}
                />
              </View>
              <Pressable
                onPress={() => setDraftProgress((p) => Math.min(100, p + 5))}
                style={styles.stepBtn}
                hitSlop={6}
              >
                <Ionicons name="add" size={18} color={color.text} />
              </Pressable>
            </View>

            <Text variant="caption" color="textMuted" style={styles.sheetLabel}>
              NOTE (OPTIONAL)
            </Text>
            <TextInput
              value={draftText}
              onChangeText={setDraftText}
              placeholder="What did you complete? Any blockers?"
              placeholderTextColor={color.textFaint}
              style={styles.noteInput}
              multiline
            />

            <Text variant="caption" color="textMuted" style={styles.sheetLabel}>
              PHOTOS (OPTIONAL)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.draftPhotoRow}>
                {draftPhotos.map((p) => (
                  <View key={p.id} style={styles.photoThumbWrap}>
                    <Image source={{ uri: p.localUri }} style={styles.draftPhoto} />
                    <Pressable
                      onPress={() => removeDraftPhoto(p.id)}
                      style={styles.photoClose}
                      hitSlop={6}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={pickPhotos} style={styles.photoAdd}>
                  <Ionicons name="images-outline" size={20} color={color.primary} />
                  <Text variant="caption" color="primary">Gallery</Text>
                </Pressable>
                <Pressable onPress={takePhoto} style={styles.photoAdd}>
                  <Ionicons name="camera-outline" size={20} color={color.primary} />
                  <Text variant="caption" color="primary">Camera</Text>
                </Pressable>
              </View>
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Button
                label={postPhase ?? 'Post Update'}
                onPress={submitUpdate}
                loading={posting}
                disabled={posting}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Single shared full-screen viewer — works for the task's
          reference photos AND any update's photo array, indexed by
          openPhotoViewer(). Pinch / pan / swipe between images. */}
      <ImageViewer
        images={viewerImages}
        index={viewerIndex}
        visible={viewerImages.length > 0}
        onClose={() => setViewerImages([])}
      />

      <SubmitProgressOverlay
        visible={posting}
        intent="updateTask"
        phaseLabel={postPhase}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  navCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navEyebrow: { letterSpacing: 1.2 },
  navTitle: { textAlign: 'center' },
  scroll: { padding: screenInset, paddingBottom: 96, gap: space.sm },

  card: {
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    padding: space.md,
    gap: space.xs,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  categoryBadge: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusLabel: { marginTop: space.md, marginBottom: space.xs },
  statusRow: { flexDirection: 'row', gap: space.xs },
  statusChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  progressBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4 },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
  },
  metaLabel: { flex: 1, marginLeft: 4 },
  metaDivider: {
    height: 1,
    backgroundColor: color.borderStrong,
  },

  sectionLabel: { marginBottom: space.xs },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },

  updatesEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    gap: space.xs,
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    marginTop: space.xs,
  },
  updateAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  updateProgressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  updatePhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
  },
  updatePhoto: {
    width: 84,
    height: 84,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  postBtn: {
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: color.primary,
    borderWidth: 1,
    borderColor: color.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.borderStrong,
    alignSelf: 'center',
    marginBottom: space.sm,
  },
  sheetTitle: { textAlign: 'center', marginBottom: space.sm },
  sheetLabel: { marginTop: space.sm, marginBottom: space.xs },
  shortcutRow: { flexDirection: 'row', gap: space.xs },
  shortcutChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  shortcutChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.sm,
  },
  stepBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  noteInput: {
    fontSize: 15,
    color: color.text,
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  draftPhotoRow: { flexDirection: 'row', gap: space.xs },
  draftPhoto: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  // Status overlay shown on top of each draft thumb during upload.
  draftPhotoOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoThumbWrap: { position: 'relative' },
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
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
    gap: 2,
  },
  sheetFooter: { marginTop: space.md },
});
