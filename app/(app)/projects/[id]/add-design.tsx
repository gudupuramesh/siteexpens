/**
 * Add File — single file per entry.
 *
 * One file, one name, one category. The file (image OR PDF) is staged
 * locally on pick; the actual R2 upload happens during Save (see
 * commitStagedFiles). Picking a file again replaces the previous
 * staged file — there is no array of files.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from "@/src/features/org/useGuardedRoute";
import { useMemo, useState } from 'react';
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

/**
 * `expo-document-picker` is a NATIVE module. If the JS bundle imports
 * it before the matching native code is in the dev-client APK, the
 * whole screen crashes at load with "Cannot find native module
 * 'ExpoDocumentPicker'" — which Expo Router surfaces as an
 * "Unmatched route" because it can't even render the screen.
 *
 * To keep the screen usable across rebuilds we resolve it lazily and
 * fall back to a friendly Alert if it isn't available yet. Image
 * picking still works (expo-image-picker is bundled), so users can
 * test the rest of the flow.
 */
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

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { createDesign } from '@/src/features/designs/designs';
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
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, screenInset, space } from '@/src/theme';

export default function AddDesignScreen() {
  useGuardedRoute({ capability: 'design.write' });
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { members } = useOrgMembers(orgId || undefined);
  const me = useMemo(
    () => members.find((m) => m.uid === user?.uid),
    [members, user?.uid],
  );

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FileCategory | null>(null);
  const [note, setNote] = useState('');
  /** Single staged file — image or PDF. Replacing always overwrites. */
  const [file, setFile] = useState<StagedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savePhase, setSavePhase] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();

  const canSubmit =
    title.trim().length > 0 &&
    category !== null &&
    file !== null &&
    !submitting;

  // ── Pickers — replace any existing staged file ───────────────────

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add an image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (res.canceled || res.assets.length === 0) return;
    const a = res.assets[0];
    setFile(
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
        'The dev client needs to be rebuilt to add PDFs. Run `npx expo run:android` from your project folder. Image uploads work without rebuilding.',
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
    setFile(
      makeStagedFile({
        localUri: a.uri,
        name: a.name,
        contentType: a.mimeType || 'application/pdf',
      }),
    );
  }

  function clearFile() {
    setFile(null);
  }

  // ── Submit ────────────────────────────────────────────────────────

  async function onSubmit() {
    if (!user || !orgId || !projectId || !file || !category) return;
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      // Step 1 — upload the staged file to R2.
      setSavePhase('Uploading…');
      const { uploaded, failed } = await commitStagedFiles({
        files: [file],
        kind: 'design',
        // refId = projectId (the design doc doesn't exist yet). Each
        // upload still gets a unique UUID so per-design grouping isn't
        // strictly required at the path level.
        refId: projectId,
        compress: 'balanced', // PDFs are skipped automatically
      });
      if (uploaded.length === 0) {
        const msg = failed[0]?.error ?? 'Unknown error';
        setSubmitError(`Upload failed: ${msg}. Tap Save to retry.`);
        setSavePhase(undefined);
        setSubmitting(false);
        return;
      }
      const up = uploaded[0];

      // Step 2 — create the doc.
      setSavePhase('Saving…');
      const designId = await createDesign({
        orgId,
        projectId,
        title: title.trim(),
        description: note.trim() || undefined,
        category,
        file: {
          url: up.publicUrl,
          key: up.key,
          contentType: up.contentType,
          sizeBytes: up.sizeBytes,
          name: up.name,
        },
        createdBy: user.uid,
        createdByName: me?.displayName,
      });

      // Step 3 — record the storage event now that we have the design id.
      void recordStorageEvent({
        projectId,
        kind: 'design',
        refId: designId,
        key: up.key,
        sizeBytes: up.sizeBytes,
        contentType: up.contentType,
        action: 'upload',
      });

      router.replace(`/(app)/projects/${projectId}/design/${designId}` as never);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
      setSavePhase(undefined);
    }
  }

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
          <Text variant="bodyStrong" color="text">New file</Text>
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
          {/* Category — required. Drives the chip filter on the
              Files tab and the badge on each row. Horizontal scroll
              so the row stays single-line on small screens and every
              chip (2D, 3D, Layout, MOM, Agreement, Other) is reachable. */}
          <Text variant="caption" color="textMuted" style={styles.label}>
            CATEGORY
          </Text>
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
            value={note}
            onChangeText={setNote}
            placeholder="Brief / scope / what's in this file…"
            placeholderTextColor={color.textFaint}
            style={[styles.input, styles.inputMultiline]}
            multiline
            maxLength={500}
          />

          <Text variant="caption" color="textMuted" style={styles.label}>
            FILE
          </Text>
          {file ? (
            <FilePreview file={file} onRemove={clearFile} />
          ) : (
            <View style={styles.pickerRow}>
              <Pressable onPress={pickImage} style={styles.pickerBtn}>
                <Ionicons name="image-outline" size={18} color={color.primary} />
                <Text variant="metaStrong" style={{ color: color.primary }}>Image</Text>
              </Pressable>
              <Pressable onPress={pickPdf} style={styles.pickerBtn}>
                <Ionicons name="document-outline" size={18} color={color.primary} />
                <Text variant="metaStrong" style={{ color: color.primary }}>PDF</Text>
              </Pressable>
            </View>
          )}

          {submitError ? (
            <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>
              {submitError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={savePhase ?? 'Create file'}
            onPress={onSubmit}
            loading={submitting}
            disabled={!canSubmit}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ── File preview ─────────────────────────────────────────────────────

function FilePreview({ file, onRemove }: { file: StagedFile; onRemove: () => void }) {
  const isPdf = file.contentType === 'application/pdf';
  return (
    <View style={previewStyles.wrap}>
      <View style={previewStyles.thumb}>
        {isPdf ? (
          <View style={previewStyles.pdfPlaceholder}>
            <Ionicons name="document-text-outline" size={32} color={color.danger} />
            <Text style={previewStyles.pdfBadge}>PDF</Text>
          </View>
        ) : (
          <Image
            source={{ uri: file.localUri }}
            style={previewStyles.thumbImg}
            resizeMode="cover"
          />
        )}
      </View>
      <View style={previewStyles.info}>
        <Text variant="bodyStrong" color="text" numberOfLines={1}>
          {file.name ?? (isPdf ? 'PDF file' : 'Image')}
        </Text>
        <Pressable onPress={onRemove} style={previewStyles.removeBtn} hitSlop={6}>
          <Ionicons name="close-circle" size={16} color={color.danger} />
          <Text variant="caption" style={{ color: color.danger }}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    marginTop: space.xs,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.md,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.primary,
  },

  // Category chip row — single-line, horizontally scrollable so every
  // category (2D / 3D / Layout / MOM / Agreement / Other) is reachable.
  chipScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
    paddingRight: space.sm, // breathing room past the last chip
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
  info: { flex: 1, gap: 6, minWidth: 0 },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
});
