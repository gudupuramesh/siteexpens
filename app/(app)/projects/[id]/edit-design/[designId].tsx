/**
 * Edit File — v2 design.
 *
 * Same shape as add-design but pre-filled. Two paths through one Save:
 *   - Metadata only: just updateDesign with title/category/description
 *   - Replace file: stage → commit to R2 → updateDesign with new fields →
 *     delete old R2 key (best-effort)
 *
 * Layout matches add-design.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export default function EditDesignScreen() {
  useGuardedRoute({ capability: 'design.write' });
  const t = useThemeV2();
  const { id: projectId, designId } = useLocalSearchParams<{
    id: string;
    designId: string;
  }>();

  const { data: design, loading } = useDesign(designId);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FileCategory | null>(null);
  const [description, setDescription] = useState('');
  const [newFile, setNewFile] = useState<StagedFile | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savePhase, setSavePhase] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();

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

  async function onSubmit() {
    if (!projectId || !designId || !design || !category) return;
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      let uploadedFields:
        | { url: string; key: string; contentType: string; sizeBytes: number; name?: string }
        | undefined;

      if (newFile) {
        setSavePhase('Uploading…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [newFile],
          kind: 'design',
          refId: designId,
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
        void recordStorageEvent;
      }

      setSavePhase('Saving…');
      await updateDesign(designId, {
        title: title.trim(),
        category,
        description: description.trim(),
        file: uploadedFields,
      });

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
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
      setSavePhase(undefined);
    }
  }

  if (loading && !design) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit file"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.center}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }
  if (!design) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit file"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.center}>
          <Text variant="body" color="secondary">File not found.</Text>
        </View>
      </View>
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

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="Edit file"
        cancelLabel="Cancel"
        saveLabel={savePhase ?? 'Save'}
        saveLoading={submitting}
        saveDisabled={!canSubmit}
        onCancel={() => router.back()}
        onSave={onSubmit}
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
          {/* Category chips */}
          <View style={{ paddingTop: 18 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 32, paddingBottom: 8 }}
            >
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
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: active
                          ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                          : t.colors.fill3,
                        borderRadius: 999,
                        borderColor: active ? t.palette.blue.base + '33' : 'transparent',
                        borderWidth: active ? 1 : 0,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      variant="caption2"
                      style={{
                        color: active ? t.palette.blue.base : t.colors.secondary,
                        fontWeight: '700',
                        letterSpacing: 0.4,
                      }}
                    >
                      {c.label.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Details */}
          <FormGroup header="Details">
            <InputRow
              label="Name"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Electrical Layout"
              autoCapitalize="words"
            />
            <InputRow
              label="Note"
              value={description}
              onChangeText={setDescription}
              placeholder="Brief / scope / what's in this file"
              multiline
              divider={false}
            />
          </FormGroup>

          {/* File */}
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              FILE
            </Text>
            <View
              style={[
                styles.previewWrap,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <View
                style={[
                  styles.thumb,
                  { backgroundColor: t.colors.fill3, borderRadius: t.radii.tile },
                ]}
              >
                {previewIsPdf ? (
                  <View style={styles.pdfPlaceholder}>
                    <Ionicons
                      name="document-text-outline"
                      size={28}
                      color={t.palette.red.base}
                    />
                    <Text
                      variant="caption2"
                      style={{
                        color: t.palette.red.base,
                        fontWeight: '700',
                        letterSpacing: 0.6,
                        marginTop: 2,
                      }}
                    >
                      PDF
                    </Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: previewUri }}
                    style={styles.thumbImg}
                    resizeMode="cover"
                  />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="footnote" color="label" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {previewName}
                </Text>
                <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                  {showingNew ? 'New file (unsaved)' : 'Current file'}
                </Text>
                {showingNew ? (
                  <Pressable
                    onPress={() => setNewFile(null)}
                    hitSlop={6}
                    style={styles.revertBtn}
                  >
                    <Ionicons name="arrow-undo" size={13} color={t.colors.secondary} />
                    <Text
                      variant="caption2"
                      color="secondary"
                      style={{ marginLeft: 4, fontWeight: '700', letterSpacing: 0.4 }}
                    >
                      KEEP CURRENT
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.pickerRow}>
              <PickerBtn icon="image-outline" label="Image" onPress={pickImage} />
              <PickerBtn icon="document-outline" label="PDF" onPress={pickPdf} />
            </View>
          </View>

          {submitError ? (
            <Text
              variant="caption2"
              style={{
                color: t.palette.red.base,
                paddingHorizontal: 32,
                marginTop: 12,
              }}
            >
              {submitError}
            </Text>
          ) : null}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function PickerBtn({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pickerBtn,
        {
          backgroundColor:
            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
          borderRadius: t.radii.field,
          borderColor: t.palette.blue.base + '33',
          borderWidth: t.hairline,
          borderStyle: 'dashed',
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={icon} size={16} color={t.palette.blue.base} />
      <Text
        variant="footnote"
        style={{ color: t.palette.blue.base, fontWeight: '700', marginLeft: 6 }}
      >
        Replace · {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 60 },

  chipScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  previewWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  thumb: {
    width: 64,
    height: 64,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  pdfPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
  },

  pickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
