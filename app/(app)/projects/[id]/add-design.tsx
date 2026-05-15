/**
 * Add File — v2 design.
 *
 * One file, one name, one category. The file (image OR PDF) is staged
 * locally on pick; the actual R2 upload happens during Save (see
 * commitStagedFiles). Picking again replaces the previous staged file.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "New file" · Save
 *   2. Category chip rail (horizontal)
 *   3. FormGroup "Details" — Name, Note (multiline)
 *   4. File block — staged-file card OR pick Image / PDF buttons
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { useMemo, useState } from 'react';
import {
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

// Lazy resolve expo-document-picker to avoid crash on dev clients without it.
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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export default function AddDesignScreen() {
  useGuardedRoute({ capability: 'design.write' });
  const t = useThemeV2();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { members } = useOrgMembers(orgId || undefined);
  const me = useMemo(() => members.find((m) => m.uid === user?.uid), [members, user?.uid]);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FileCategory | null>(null);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<StagedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savePhase, setSavePhase] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();

  const canSubmit =
    title.trim().length > 0 && category !== null && file !== null && !submitting;

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

  async function onSubmit() {
    if (!user || !orgId || !projectId || !file || !category) return;
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      setSavePhase('Uploading…');
      const { uploaded, failed } = await commitStagedFiles({
        files: [file],
        kind: 'design',
        refId: projectId,
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
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
      setSavePhase(undefined);
    }
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="New file"
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
              value={note}
              onChangeText={setNote}
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
            {file ? (
              <FilePreview file={file} onRemove={() => setFile(null)} />
            ) : (
              <View style={styles.pickerRow}>
                <PickerBtn
                  icon="image-outline"
                  label="Image"
                  onPress={pickImage}
                />
                <PickerBtn
                  icon="document-outline"
                  label="PDF"
                  onPress={pickPdf}
                />
              </View>
            )}
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
      <Ionicons name={icon} size={18} color={t.palette.blue.base} />
      <Text
        variant="footnote"
        style={{ color: t.palette.blue.base, fontWeight: '700', marginLeft: 6 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FilePreview({
  file,
  onRemove,
}: {
  file: StagedFile;
  onRemove: () => void;
}) {
  const t = useThemeV2();
  const isPdf = file.contentType === 'application/pdf';
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
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
          {
            backgroundColor: t.colors.fill3,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        {isPdf ? (
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
            source={{ uri: file.localUri }}
            style={styles.thumbImg}
            resizeMode="cover"
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="footnote" color="label" style={{ fontWeight: '700' }} numberOfLines={1}>
          {file.name ?? (isPdf ? 'PDF file' : 'Image')}
        </Text>
        <Pressable onPress={onRemove} hitSlop={6} style={styles.removeBtn}>
          <Ionicons name="close-circle" size={14} color={t.palette.red.base} />
          <Text
            variant="caption2"
            style={{
              color: t.palette.red.base,
              fontWeight: '700',
              marginLeft: 4,
              letterSpacing: 0.4,
            }}
          >
            REMOVE
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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

  pickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
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
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
});
