/**
 * File detail — read-only view of one Files entry.
 *
 * Layout:
 *   - Top bar: back, eyebrow (CATEGORY), title, edit + delete actions
 *   - Identity strip: icon, title, created-by
 *   - Single-file viewer:
 *       Image → big tap-to-zoom preview (ImageViewer)
 *       PDF   → big tap-to-open card (PdfViewer)
 *   - Description (when present)
 *
 * Edit pushes to /edit-design/[designId]; Delete removes the doc and
 * cleans the R2 object.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';

import { useDesign } from '@/src/features/designs/useDesigns';
import { deleteDesign } from '@/src/features/designs/designs';
import { getCategoryLabel } from '@/src/features/designs/types';
import { deleteR2Object } from '@/src/lib/r2Delete';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { ImageViewer } from '@/src/ui/ImageViewer';
import { PdfViewer } from '@/src/ui/PdfViewer';
import { color, fontFamily, screenInset, space } from '@/src/theme';

export default function DesignDetailScreen() {
  const { id: projectId, designId } = useLocalSearchParams<{
    id: string;
    designId: string;
  }>();

  const { data: design, loading } = useDesign(designId);

  // Viewer state — image and PDF have separate modal mounts.
  const [imageOpen, setImageOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  function confirmDeleteDesign() {
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
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={color.text} />
          </Pressable>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>File</Text>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.center}>
          <Text variant="meta" color="textMuted">File not found.</Text>
        </View>
      </Screen>
    );
  }

  const isPdf = design.fileContentType === 'application/pdf';

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>
            {getCategoryLabel(design.category).toUpperCase()}
          </Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle} numberOfLines={1}>
            {design.title}
          </Text>
        </View>
        <View style={styles.navActions}>
          <Pressable
            onPress={() =>
              router.push(`/(app)/projects/${projectId}/edit-design/${designId}` as never)
            }
            hitSlop={12}
            style={styles.navBtnSm}
            accessibilityLabel="Edit file"
          >
            <Ionicons name="create-outline" size={20} color={color.primary} />
          </Pressable>
          <Pressable
            onPress={confirmDeleteDesign}
            hitSlop={12}
            style={styles.navBtnSm}
            accessibilityLabel="Delete file"
          >
            <Ionicons name="trash-outline" size={20} color={color.danger} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity strip */}
        <View style={styles.identityStrip}>
          <View style={styles.avatarSm}>
            <Ionicons
              name={isPdf ? 'document-text-outline' : 'image-outline'}
              size={20}
              color={color.primary}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" color="text" numberOfLines={1}>
              {design.title}
            </Text>
            <Text style={styles.identityMeta}>
              {design.fileName ? design.fileName.toUpperCase() : 'FILE'}
              {design.createdByName ? `  ·  ${design.createdByName.toUpperCase()}` : ''}
            </Text>
          </View>
        </View>

        {/* Single-file viewer */}
        {isPdf ? (
          <Pressable
            onPress={() => setPdfOpen(true)}
            style={({ pressed }) => [styles.pdfCard, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="document-text-outline" size={48} color={color.danger} />
            <Text variant="bodyStrong" color="text">Open PDF</Text>
            <Text variant="caption" color="textMuted">
              Tap to view in-app
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setImageOpen(true)}
            style={({ pressed }) => [styles.imageCard, pressed && { opacity: 0.95 }]}
          >
            <Image
              source={{ uri: design.fileUrl }}
              style={styles.imageFull}
              resizeMode="cover"
            />
          </Pressable>
        )}

        {/* Description */}
        {design.description ? (
          <View style={styles.descriptionCard}>
            <Text variant="caption" color="textMuted" style={styles.descriptionLabel}>
              NOTE
            </Text>
            <Text variant="body" color="text" style={styles.descriptionBody}>
              {design.description}
            </Text>
          </View>
        ) : null}

        <View style={{ height: space.xl }} />
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
  navBtnSm: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  navActions: { flexDirection: 'row', alignItems: 'center' },
  navCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navEyebrow: { letterSpacing: 1.1 },
  navTitle: { textAlign: 'center' },

  scroll: { padding: screenInset, gap: space.sm },

  identityStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  avatarSm: {
    width: 36, height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  identityMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.2,
    marginTop: 2,
  },

  imageCard: {
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    overflow: 'hidden',
  },
  imageFull: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: color.surface,
  },

  pdfCard: {
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    paddingVertical: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },

  descriptionCard: {
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 4,
  },
  descriptionLabel: { letterSpacing: 1.2 },
  descriptionBody: { lineHeight: 20 },
});
