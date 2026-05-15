/**
 * Task detail / preview — v2 design.
 *
 * Read-only view (any project member can post a progress update).
 * Owner sees an Edit pencil in the header, which routes to the
 * edit-task screen.
 *
 * Layout:
 *   1. Header — back · "Milestone" · edit (when owner)
 *   2. Title hero card — large title + category pill + status pill row
 *   3. Progress card — % + colored progress bar
 *   4. FormGroup "Schedule & assignee" — start · due · category · assigned
 *   5. Reference photos grid (when present)
 *   6. Updates feed FormGroup — author + delta + note + photos per row
 *   7. Floating "Post update" button at the bottom
 *
 * Post-update bottom sheet handles draft progress shortcuts + ± stepper +
 * note + camera/gallery photo staging.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { Text } from '@/src/ui/v2/Text';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { formatDate } from '@/src/lib/format';
import { useThemeV2 } from '@/src/theme/v2';

const PROGRESS_SHORTCUTS = [0, 25, 50, 75, 100] as const;

const STATUS_OPTIONS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'not_started', label: 'Not started' },
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
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { id: projectId, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const { data: task, loading } = useTask(taskId);
  const { data: updates } = useTaskUpdates(taskId);

  const [showPostModal, setShowPostModal] = useState(false);
  const [draftProgress, setDraftProgress] = useState<number>(0);
  const [draftText, setDraftText] = useState('');
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  function openPhotoViewer(images: string[], startIndex = 0) {
    setViewerImages(images);
    setViewerIndex(startIndex);
  }

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
            `All ${failed.length} photo(s) failed to upload. Tap Post update again to retry.`,
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

  // Loading
  if (loading && !task) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="Milestone" />
        <View style={styles.centered}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="Milestone" />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Milestone not found.</Text>
        </View>
      </View>
    );
  }

  const categoryLabel = getCategoryLabel(task.category);
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  // Status tone for the header pill row
  const statusTones: Record<TaskStatus, { fg: string; bg: string }> = {
    // 90/10 discipline: only the active in-progress state earns colour
    // (blue, interactive). Not-started + Completed both go neutral — the
    // labels carry the meaning.
    not_started: { fg: t.colors.secondary, bg: t.colors.fill3 },
    ongoing: {
      fg: t.palette.blue.base,
      bg: t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
    },
    completed: { fg: t.colors.secondary, bg: t.colors.fill3 },
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <Header
        onBack={() => router.back()}
        title="Milestone"
        right={
          isOwner ? (
            <CircleBtn
              icon="create-outline"
              onPress={() =>
                router.push(`/(app)/projects/${projectId}/edit-task/${task.id}` as never)
              }
              tint={t.palette.blue.base}
            />
          ) : null
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title hero */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
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
            <View
              style={[
                styles.categoryPill,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                  borderRadius: 999,
                },
              ]}
            >
              <Text
                variant="caption2"
                style={{
                  color: t.palette.blue.base,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                }}
              >
                {categoryLabel.toUpperCase()}
              </Text>
            </View>
            <Text
              variant="title2"
              color="label"
              style={{ marginTop: 8, fontWeight: '700' }}
            >
              {task.title}
            </Text>
            {task.description ? (
              <Text
                variant="footnote"
                color="secondary"
                style={{ marginTop: 6, lineHeight: 19 }}
              >
                {task.description}
              </Text>
            ) : null}

            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5, marginTop: 14 }}
            >
              STATUS · TAP TO CHANGE
            </Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((s) => {
                const active = task.status === s.key;
                const tone = statusTones[s.key];
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => changeStatus(s.key)}
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

        {/* Progress card */}
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <View
            style={[
              styles.progressCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.card,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            <View style={styles.progressTop}>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                PROGRESS
              </Text>
              <Text
                variant="title3"
                style={{
                  color: t.palette.blue.base,
                  fontWeight: '700',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {progressPct}%
              </Text>
            </View>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: t.colors.fill3 },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressPct}%`,
                    backgroundColor:
                      t.palette.blue.base,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Schedule & Assignee */}
        <FormGroup header="Schedule & assignee">
          <Row
            label="Start"
            value={task.startDate ? formatDate(task.startDate.toDate()) : 'Not set'}
            valueColor={task.startDate ? undefined : t.colors.tertiary}
          />
          <Row
            label="Due"
            value={task.endDate ? formatDate(task.endDate.toDate()) : 'Not set'}
            valueColor={task.endDate ? undefined : t.colors.tertiary}
          />
          <Row label="Category" value={categoryLabel} />
          <Row
            label="Assigned"
            value={task.assignedToName || 'Unassigned'}
            valueColor={task.assignedToName ? undefined : t.colors.tertiary}
            divider={false}
          />
        </FormGroup>

        {/* Reference photos */}
        {(task.photoUris ?? []).length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              REFERENCE PHOTOS
            </Text>
            <View style={styles.photoGrid}>
              {task.photoUris.map((uri, i) => (
                <Pressable key={uri} onPress={() => openPhotoViewer(task.photoUris, i)}>
                  <Image
                    source={{ uri }}
                    style={[
                      styles.photoThumb,
                      {
                        backgroundColor: t.colors.fill3,
                        borderRadius: t.radii.tile,
                      },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Updates feed */}
        <View style={{ marginTop: 22 }}>
          <Text
            variant="caption2"
            color="secondary"
            style={{
              letterSpacing: 0.5,
              paddingHorizontal: 32,
              paddingBottom: 8,
            }}
          >
            UPDATES · {updates.length}
          </Text>
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {updates.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.card,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={24}
                  color={t.colors.tertiary}
                />
                <Text
                  variant="footnote"
                  color="secondary"
                  style={{ marginTop: 8, textAlign: 'center' }}
                >
                  No updates yet. Post the first progress update below.
                </Text>
              </View>
            ) : (
              updates.map((u) => (
                <View
                  key={u.id}
                  style={[
                    styles.updateCard,
                    {
                      backgroundColor: cardBg,
                      borderRadius: t.radii.card,
                      borderColor: cardBorder,
                      borderWidth: t.hairline,
                    },
                  ]}
                >
                  <View style={styles.updateHeader}>
                    <View
                      style={[
                        styles.updateAvatar,
                        {
                          backgroundColor:
                            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                        },
                      ]}
                    >
                      <Text
                        variant="caption1"
                        style={{
                          color: t.palette.blue.base,
                          fontWeight: '700',
                        }}
                      >
                        {u.authorName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        variant="footnote"
                        color="label"
                        style={{ fontWeight: '700' }}
                        numberOfLines={1}
                      >
                        {u.authorName}
                      </Text>
                      <Text variant="caption2" color="tertiary" style={{ marginTop: 1 }}>
                        {formatUpdateTime(u.createdAt ? u.createdAt.toDate() : null)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.updateProgressPill,
                        {
                          // Progress pill — interactive blue throughout per
                          // 90/10. The number alone tells you 100% vs less.
                          backgroundColor:
                            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                          borderRadius: 999,
                        },
                      ]}
                    >
                      <Ionicons
                        name="trending-up"
                        size={11}
                        color={t.palette.blue.base}
                      />
                      <Text
                        variant="caption2"
                        style={{
                          color: t.palette.blue.base,
                          fontWeight: '700',
                          letterSpacing: 0.3,
                          marginLeft: 4,
                        }}
                      >
                        {u.progress}%
                      </Text>
                    </View>
                  </View>
                  {u.text ? (
                    <Text
                      variant="callout"
                      color="label"
                      style={{ marginTop: 10, lineHeight: 21 }}
                    >
                      {u.text}
                    </Text>
                  ) : null}
                  {(u.photoUris ?? []).length > 0 ? (
                    <View style={styles.updatePhotoGrid}>
                      {u.photoUris.map((uri, i) => (
                        <Pressable
                          key={uri}
                          onPress={() => openPhotoViewer(u.photoUris, i)}
                        >
                          <Image
                            source={{ uri }}
                            style={[
                              styles.updatePhoto,
                              {
                                backgroundColor: t.colors.fill3,
                                borderRadius: t.radii.tile,
                              },
                            ]}
                          />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating Post Update button */}
      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + 12,
            backgroundColor: t.colors.surface,
            borderTopColor: t.colors.separator,
            borderTopWidth: t.hairline,
          },
        ]}
      >
        <Pressable
          onPress={openPostModal}
          style={({ pressed }) => [
            styles.postBtn,
            {
              backgroundColor: t.palette.blue.base,
              borderRadius: t.radii.field,
              shadowColor: t.palette.blue.base,
              shadowOpacity: 0.25,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 5,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text
            variant="footnote"
            style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}
          >
            Post update
          </Text>
        </Pressable>
      </View>

      {/* Post Update sheet */}
      <PostUpdateSheet
        open={showPostModal}
        onClose={() => !posting && setShowPostModal(false)}
        draftProgress={draftProgress}
        setDraftProgress={setDraftProgress}
        draftText={draftText}
        setDraftText={setDraftText}
        draftPhotos={draftPhotos}
        removeDraftPhoto={removeDraftPhoto}
        pickPhotos={pickPhotos}
        takePhoto={takePhoto}
        posting={posting}
        postPhase={postPhase}
        onSubmit={submitUpdate}
      />

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
    </View>
  );
}

// ── Header ────────────────────────────────────────────────────────────

function Header({
  onBack,
  title,
  right,
}: {
  onBack: () => void;
  title: string;
  right?: React.ReactNode;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          borderBottomColor: t.colors.separator,
          borderBottomWidth: t.hairline,
        },
      ]}
    >
      <CircleBtn
        icon="chevron-back"
        onPress={onBack}
        tint={t.colors.label}
      />
      <Text
        variant="headline"
        color="label"
        style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {right ?? <View style={{ width: 32 }} />}
    </View>
  );
}

function CircleBtn({
  icon,
  onPress,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint: string;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [
        styles.circleBtn,
        {
          backgroundColor: t.colors.surface,
          borderRadius: 999,
          borderColor:
            t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          borderWidth: t.hairline,
        },
        t.shadows.resting,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={16} color={tint} />
    </Pressable>
  );
}

// ── Post update sheet ─────────────────────────────────────────────────

function PostUpdateSheet({
  open,
  onClose,
  draftProgress,
  setDraftProgress,
  draftText,
  setDraftText,
  draftPhotos,
  removeDraftPhoto,
  pickPhotos,
  takePhoto,
  posting,
  postPhase,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  draftProgress: number;
  setDraftProgress: (n: number) => void;
  draftText: string;
  setDraftText: (s: string) => void;
  draftPhotos: StagedFile[];
  removeDraftPhoto: (id: string) => void;
  pickPhotos: () => void;
  takePhoto: () => void;
  posting: boolean;
  postPhase?: string;
  onSubmit: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 16,
              maxHeight: '90%',
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />
          <View
            style={[
              styles.sheetHeader,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={onClose} hitSlop={8} style={styles.sheetSideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>Cancel</Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[styles.sheetTitle, { fontWeight: '600' }]}
              numberOfLines={1}
            >
              Post update
            </Text>
            <Pressable
              onPress={onSubmit}
              hitSlop={8}
              disabled={posting}
              style={({ pressed }) => [
                styles.sheetSideBtn,
                { alignItems: 'flex-end' },
                (posting || pressed) && { opacity: 0.5 },
              ]}
            >
              {posting ? (
                <ActivityIndicator size="small" color={t.palette.blue.base} />
              ) : (
                <Text
                  variant="body"
                  style={{ color: t.palette.blue.base, fontWeight: '700' }}
                >
                  Post
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 14 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Progress */}
            <View>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                NEW PROGRESS · {draftProgress}%
              </Text>
              <View style={styles.shortcutRow}>
                {PROGRESS_SHORTCUTS.map((p) => {
                  const active = draftProgress === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setDraftProgress(p)}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.shortcutChip,
                        {
                          backgroundColor: active
                            ? t.palette.blue.base
                            : t.colors.fill3,
                          borderRadius: 999,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Text
                        variant="caption2"
                        style={{
                          color: active ? '#fff' : t.colors.label,
                          fontWeight: '700',
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {p}%
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={() => setDraftProgress(Math.max(0, draftProgress - 5))}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    {
                      backgroundColor: t.colors.fill3,
                      borderRadius: 999,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="remove" size={16} color={t.colors.label} />
                </Pressable>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: t.colors.fill3, flex: 1 },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${draftProgress}%`,
                        backgroundColor: t.palette.blue.base,
                      },
                    ]}
                  />
                </View>
                <Pressable
                  onPress={() => setDraftProgress(Math.min(100, draftProgress + 5))}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    {
                      backgroundColor: t.colors.fill3,
                      borderRadius: 999,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="add" size={16} color={t.colors.label} />
                </Pressable>
              </View>
            </View>

            {/* Note */}
            <View>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                NOTE (OPTIONAL)
              </Text>
              <TextInput
                value={draftText}
                onChangeText={setDraftText}
                placeholder="What did you complete? Any blockers?"
                placeholderTextColor={t.colors.tertiary}
                multiline
                style={[
                  styles.noteInput,
                  {
                    backgroundColor: t.colors.fill3,
                    borderRadius: t.radii.field,
                    color: t.colors.label,
                    ...t.type.body,
                  },
                ]}
              />
            </View>

            {/* Photos */}
            <View>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                PHOTOS (OPTIONAL)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.draftPhotoRow}>
                  {draftPhotos.map((p) => (
                    <View key={p.id} style={styles.draftThumbWrap}>
                      <Image
                        source={{ uri: p.localUri }}
                        style={[styles.draftPhoto, { borderRadius: t.radii.tile }]}
                      />
                      <Pressable
                        onPress={() => removeDraftPhoto(p.id)}
                        hitSlop={6}
                        style={[
                          styles.draftClose,
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
                      styles.draftAddBtn,
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
                    <Ionicons name="images-outline" size={18} color={t.palette.blue.base} />
                    <Text
                      variant="caption2"
                      style={{
                        color: t.palette.blue.base,
                        fontWeight: '700',
                        marginTop: 2,
                      }}
                    >
                      Gallery
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={takePhoto}
                    style={({ pressed }) => [
                      styles.draftAddBtn,
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
                    <Ionicons name="camera-outline" size={18} color={t.palette.blue.base} />
                    <Text
                      variant="caption2"
                      style={{
                        color: t.palette.blue.base,
                        fontWeight: '700',
                        marginTop: 2,
                      }}
                    >
                      Camera
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>

            {postPhase ? (
              <Text variant="caption1" color="secondary" style={{ textAlign: 'center' }}>
                {postPhase}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  circleBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {},

  // Title hero
  titleCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  // Progress card
  progressCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  progressTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Photos
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumb: {
    width: 84,
    height: 84,
  },

  // Updates
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  updateCard: {
    padding: 12,
  },
  updateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  updateAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateProgressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  updatePhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  updatePhoto: {
    width: 80,
    height: 80,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },

  // Post update sheet
  sheet: {
    paddingTop: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetSideBtn: {
    minWidth: 70,
  },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
  },

  shortcutRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  shortcutChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  stepBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noteInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 6,
  },

  draftPhotoRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  draftThumbWrap: {
    position: 'relative',
  },
  draftPhoto: {
    width: 72,
    height: 72,
  },
  draftClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftAddBtn: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
