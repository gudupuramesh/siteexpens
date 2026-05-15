/**
 * File detail / preview — v2 design.
 *
 * Layout:
 *   1. Header — back · "File" · edit · delete (circular buttons)
 *   2. Identity hero card — file icon + title + filename · author meta
 *   3. Big single-file viewer:
 *        Image → tap-to-zoom (ImageViewer)
 *        PDF   → tap-to-open card (PdfViewer)
 *   4. Note card (when description present)
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesign } from '@/src/features/designs/useDesigns';
import { deleteDesign } from '@/src/features/designs/designs';
import { getCategoryLabel } from '@/src/features/designs/types';
import { deleteR2Object } from '@/src/lib/r2Delete';
import { ImageViewer } from '@/src/ui/ImageViewer';
import { PdfViewer } from '@/src/ui/PdfViewer';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export default function DesignDetailScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { id: projectId, designId } = useLocalSearchParams<{
    id: string;
    designId: string;
  }>();

  const { data: design, loading } = useDesign(designId);

  const [imageOpen, setImageOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  function confirmDelete() {
    if (!design) return;
    Alert.alert(
      'Delete file?',
      'The file will be permanently removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const key = design.fileKey;
              const sizeBytes = design.fileSizeBytes;
              const contentType = design.fileContentType;
              await deleteDesign(designId);
              if (projectId && key) {
                void deleteR2Object({
                  projectId,
                  key,
                  kind: 'design',
                  refId: designId,
                  sizeBytes,
                  contentType,
                });
              }
              router.back();
            } catch (e) {
              Alert.alert('Error', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  if (loading && !design) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="File" />
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
        <Header onBack={() => router.back()} title="File" />
        <View style={styles.center}>
          <Text variant="body" color="secondary">File not found.</Text>
        </View>
      </View>
    );
  }

  const isPdf = design.fileContentType === 'application/pdf';
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <Header
        onBack={() => router.back()}
        title="File"
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <CircleBtn
              icon="create-outline"
              onPress={() =>
                router.push(`/(app)/projects/${projectId}/edit-design/${designId}` as never)
              }
              tint={t.palette.blue.base}
            />
            <CircleBtn
              icon="trash-outline"
              onPress={confirmDelete}
              tint={t.palette.red.base}
            />
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity hero */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <View
            style={[
              styles.heroCard,
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
                {getCategoryLabel(design.category).toUpperCase()}
              </Text>
            </View>
            <Text
              variant="title3"
              color="label"
              style={{ marginTop: 8, fontWeight: '700' }}
            >
              {design.title}
            </Text>
            <View style={styles.metaRow}>
              <Ionicons
                name={isPdf ? 'document-text-outline' : 'image-outline'}
                size={13}
                color={isPdf ? t.palette.red.base : t.palette.blue.base}
              />
              <Text
                variant="caption2"
                color="tertiary"
                style={{ marginLeft: 5, letterSpacing: 0.4, flex: 1 }}
                numberOfLines={1}
              >
                {(design.fileName || 'FILE').toUpperCase()}
                {design.createdByName ? `  ·  ${design.createdByName.toUpperCase()}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {/* Viewer */}
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          {isPdf ? (
            <Pressable
              onPress={() => setPdfOpen(true)}
              style={({ pressed }) => [
                styles.pdfCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View
                style={[
                  styles.pdfIconWrap,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                  },
                ]}
              >
                <Ionicons
                  name="document-text-outline"
                  size={32}
                  color={t.palette.red.base}
                />
              </View>
              <Text variant="callout" color="label" style={{ marginTop: 14, fontWeight: '700' }}>
                Open PDF
              </Text>
              <Text variant="caption1" color="secondary" style={{ marginTop: 4 }}>
                Tap to view in-app
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setImageOpen(true)}
              style={({ pressed }) => [
                styles.imageWrap,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.95 },
              ]}
            >
              <Image
                source={{ uri: design.fileUrl }}
                style={styles.imageFull}
                resizeMode="cover"
              />
              <View style={styles.expandHint}>
                <Ionicons name="expand-outline" size={13} color="#fff" />
              </View>
            </Pressable>
          )}
        </View>

        {/* Note */}
        {design.description ? (
          <View style={{ marginTop: 22 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 32, paddingBottom: 8 }}
            >
              NOTE
            </Text>
            <View style={{ paddingHorizontal: 16 }}>
              <View
                style={[
                  styles.noteCard,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.card,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <Text variant="body" color="label" style={{ lineHeight: 22 }}>
                  {design.description}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ImageViewer
        images={[design.fileUrl]}
        index={0}
        visible={imageOpen}
        onClose={() => setImageOpen(false)}
      />
      <PdfViewer
        url={design.fileUrl}
        title={design.fileName || design.title}
        visible={pdfOpen}
        onClose={() => setPdfOpen(false)}
      />
    </View>
  );
}

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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  heroCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  imageWrap: { overflow: 'hidden' },
  imageFull: {
    width: '100%',
    aspectRatio: 1,
  },
  expandHint: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  pdfCard: {
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noteCard: {
    padding: 14,
  },
});
