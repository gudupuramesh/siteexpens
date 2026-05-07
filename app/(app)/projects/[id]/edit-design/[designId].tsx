/**
 * Edit File — rename, recategorise, or replace the file.
 *
 * Two distinct change paths run through one Save button:
 *   - Metadata only (title / category / description): a single
 *     Firestore update, no R2 work.
 *   - Replace file: stage the new pick locally → commit to R2 →
 *     update the doc with the new file fields → delete the OLD R2
 *     key (best-effort). Same pattern as edit-laminate / edit-
 *     transaction.
 *
 * If the user saves with no changes at all, we still call
 * updateDesign (it bumps updatedAt only) — small write, simpler logic.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from "@/src/features/org/useGuardedRoute";
import { useEffect, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';

/** Same lazy load pattern as add-design.tsx — keeps the screen alive
 *  if the dev client doesn't yet have expo-document-picker compiled
 *  in. Image swap still works without a rebuild. */
type DocumentPickerModule = typeof import('expo-document-picker');
let _docPickerCache: DocumentPickerModule | null | undefined;
function loadDocumentPicker(): DocumentPickerModule | null {
  if (_docPickerCache !== undefined) return _docPickerCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _docPickerCache = require('expo-document-picker') as DocumentPickerModule;
  } catch {
    _docPickerCache = null;
  }
  return _docPickerCache;
}

import { useDesign } from '@/src/features/designs/useDesigns';
import { updateDesign } from '@/src/features/designs/designs';
import {
  FILE_CATEGORIES,
  type FileCategory,
} from '@/src/features/designs/types';
import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import {
  commitStagedFiles,
  makeStagedFile,
  type StagedFile,
} from '@/src/lib/commitStagedFiles';
import { deleteR2Object } from '@/src/lib/r2Delete';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, screenInset, space } from '@/src/theme';

export default function EditDesignScreen() {
  useGuardedRoute({ capability: 'design.write' });
  const { id: projectId, designId } = useLocalSearchParams<{
    id: string;
    designId: string;
  }>();

  const { data: design, loading } = useDesign(designId);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FileCategory | null>(null);
  const [description, setDescription] = useState('');
  /** Newly-picked replacement file. null = keep the existing one. */
  const [newFile, setNewFile] = useState<StagedFile | null>(null);
  /** Once true, hide the existing file preview because the user
   *  picked a replacement (and `newFile` holds the new staged one). */
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savePhase, setSavePhase] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();

  // Hydrate from the live doc once it loads.
  useEffect(() => {
    if (design && !hydrated) {
      setTitle(design.title);
      setCategory(design.category ?? 'other');
      setDescription(design.description ?? '');
      setHydrated(true);
    }
  }, [design, hydrated]);

  const canSubmit = useMemo(() => {
    if (!hydrated || submitting) return false;
    if (title.trim().length === 0) return false;
    if (category === null) return false;
    return true;
  }, [hydrated, submitting, title, category]);

  // ── Pickers — replace the staged file ────────────────────────────

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to swap the file.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (res.canceled || res.assets.length === 0) return;
    const a = res.assets[0];
    setNewFile(
      makeStagedFile({
        localUri: a.uri,
        name: a.fileName ?? undefined,
        contentType: a.mimeType || guessImageMimeType(a.uri),
      }),
    );
  }

  async function pickPdf() {
    const DocumentPicker = loadDocumentPicker();
    if (!DocumentPicker) {
      Alert.alert(
        'PDF picker not installed',
        'The dev client needs to be rebuilt to swap a PDF. Run `npx expo run:android` from your project folder. Image swaps work without rebuilding.',
      );
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || res.assets.length === 0) return;
    const a = res.assets[0];
    setNewFile(
      makeStagedFile({
        localUri: a.uri,
        name: a.name,
        contentType: a.mimeType || 'application/pdf',
      }),
    );
  }

  function clearReplacement() {
    setNewFile(null);
  }

  // ── Submit ────────────────────────────────────────────────────────

  async function onSubmit() {
    if (!projectId || !designId || !design || !category) return;
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      let uploadedFile: StagedFile | null = newFile;
      let uploadedFields:
        | {
            url: string;
            key: string;
            contentType: string;
            sizeBytes: number;
            name?: string;
          }
        | undefined;

      // Step 1 — only upload when the user staged a replacement.
      if (uploadedFile) {
        setSavePhase('Uploading…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [uploadedFile],
          kind: 'design',
          refId: designId,
          // Pass projectId so the storage event for the NEW upload
          // fires inside uploadToR2 (we already have the design id).
          projectId,
          compress: 'balanced',
        });
        if (uploaded.length === 0) {
          const msg = failed[0]?.error ?? 'Unknown error';
          setSubmitError(`Upload failed: ${msg}. Tap Save to retry.`);
          setSavePhase(undefined);
          setSubmitting(false);
          return;
        }
        const up = uploaded[0];
        uploadedFields = {
          url: up.publicUrl,
          key: up.key,
          contentType: up.contentType,
          sizeBytes: up.sizeBytes,
          name: up.name,
        };
        // recordStorageEvent already fired inside uploadToR2 because
        // we passed projectId. No need to fire it again here.
        void recordStorageEvent;
      }

      // Step 2 — persist the metadata + (optional) file change.
      setSavePhase('Saving…');
      await updateDesign(designId, {
        title: title.trim(),
        category,
        description: description.trim(),
        file: uploadedFields,
      });

      // Step 3 — clean up the old R2 key (only when we replaced it).
      if (uploadedFields && design.fileKey) {
        void deleteR2Object({
          projectId,
          key: design.fileKey,
          kind: 'design',
          refId: designId,
          sizeBytes: design.fileSizeBytes,
          contentType: design.fileContentType,
        });
      }

      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
      setSavePhase(undefined);
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  if (loading && !design) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (!design) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text variant="meta" color="textMuted">File not found.</Text>
        </View>
      </Screen>
    );
  }

  const showingNew = newFile !== null;
  const previewIsPdf = showingNew
    ? newFile!.contentType === 'application/pdf'
    : design.fileContentType === 'application/pdf';
  const previewUri = showingNew ? newFile!.localUri : design.fileUrl;
  const previewName = showingNew
    ? newFile!.name ?? (previewIsPdf ? 'PDF file' : 'Image')
    : design.fileName ?? (previewIsPdf ? 'PDF file' : 'Image');

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="close" size={22} color={color.textMuted} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>
            FILES
          </Text>
          <Text variant="bodyStrong" color="text">Edit file</Text>
        </View>
        <View style={styles.navBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="caption" color="textMuted" style={styles.label}>
            CATEGORY
          </Text>
          {/* Horizontal scroll so every chip stays reachable when
              the row outgrows the screen width. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScroll}
            keyboardShouldPersistTaps="handled"
          >
            {FILE_CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    variant="caption"
                    style={{ color: active ? '#fff' : color.text }}
                  >
                    {c.label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text variant="caption" color="textMuted" style={styles.label}>
            NAME
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Electrical Layout"
            placeholderTextColor={color.textFaint}
            style={styles.input}
            maxLength={80}
          />

          <Text variant="caption" color="textMuted" style={styles.label}>
            NOTE (OPTIONAL)
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Brief / scope / what's in this file…"
            placeholderTextColor={color.textFaint}
            style={[styles.input, styles.inputMultiline]}
            multiline
            maxLength={500}
          />

          <Text variant="caption" color="textMuted" style={styles.label}>
            FILE
          </Text>
          <View style={previewStyles.wrap}>
            <View style={previewStyles.thumb}>
              {previewIsPdf ? (
                <View style={previewStyles.pdfPlaceholder}>
                  <Ionicons name="document-text-outline" size={32} color={color.danger} />
                  <Text style={previewStyles.pdfBadge}>PDF</Text>
                </View>
              ) : (
                <Image
                  source={{ uri: previewUri }}
                  style={previewStyles.thumbImg}
                  resizeMode="cover"
                />
              )}
            </View>
            <View style={previewStyles.info}>
              <Text variant="bodyStrong" color="text" numberOfLines={1}>
                {previewName}
              </Text>
              <Text variant="caption" color="textMuted">
                {showingNew ? 'New file (unsaved)' : 'Current file'}
              </Text>
              {showingNew ? (
                <Pressable onPress={clearReplacement} style={previewStyles.removeBtn} hitSlop={6}>
                  <Ionicons name="arrow-undo" size={14} color={color.textMuted} />
                  <Text variant="caption" color="textMuted">Keep current</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.pickerRow}>
            <Pressable onPress={pickImage} style={styles.pickerBtn}>
              <Ionicons name="image-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" style={{ color: color.primary }}>
                Replace with image
              </Text>
            </Pressable>
            <Pressable onPress={pickPdf} style={styles.pickerBtn}>
              <Ionicons name="document-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" style={{ color: color.primary }}>
                Replace with PDF
              </Text>
            </Pressable>
          </View>

          {submitError ? (
            <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>
              {submitError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={savePhase ?? 'Save changes'}
            onPress={onSubmit}
            loading={submitting}
            disabled={!canSubmit}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  navEyebrow: { letterSpacing: 1.1 },

  scroll: { padding: screenInset, paddingBottom: 200, gap: 6 },
  label: { marginTop: space.sm, marginBottom: 4, letterSpacing: 0.6 },
  input: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontFamily: fontFamily.sans,
    fontSize: 15,
    color: color.text,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },

  pickerRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.primary,
  },

  // Single-line scrollable chip row — see add-design.tsx for the
  // matching pattern in the create flow.
  chipScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
    paddingRight: space.sm,
  },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  chipActive: {
    borderColor: color.primary,
    backgroundColor: color.primary,
  },

  footer: {
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: 18,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
});

const previewStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    marginTop: 4,
  },
  thumb: {
    width: 72,
    height: 72,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  pdfPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pdfBadge: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.danger,
    letterSpacing: 1.2,
  },
  info: { flex: 1, gap: 4, minWidth: 0 },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
