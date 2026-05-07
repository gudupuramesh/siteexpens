/**
 * Laminate detail — read-only preview of a single laminate spec.
 *
 * Tapping a laminate from the project's Laminate tab lands here
 * (instead of going straight to edit, which was destructive-looking).
 * Edit button (pencil) is in the top-right; tapping the photo opens
 * a full-screen pinch-to-zoom preview.
 *
 * Layout follows the InteriorOS dense / hairline detail pattern used
 * by transaction-detail and party-detail.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useLaminates } from '@/src/features/laminates/useLaminates';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { ImageViewer } from '@/src/ui/ImageViewer';
import { color, fontFamily, radius, screenInset, space } from '@/src/theme';

export default function LaminateDetailScreen() {
  const { id: projectId, lamId } = useLocalSearchParams<{
    id: string;
    lamId: string;
  }>();
  const { data: allLaminates, loading } = useLaminates(projectId);

  const lam = useMemo(
    () => allLaminates.find((l) => l.id === lamId),
    [allLaminates, lamId],
  );

  const [previewOpen, setPreviewOpen] = useState(false);

  if (loading && !lam) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (!lam) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={color.text} />
          </Pressable>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Laminate</Text>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.center}>
          <Text variant="meta" color="textMuted">Laminate not found.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>
            LAMINATE
          </Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle} numberOfLines={1}>
            {lam.roomName}
          </Text>
        </View>
        {/* Edit lives top-right per the user's request — same place as
            party / transaction detail screens. */}
        <Pressable
          onPress={() =>
            router.push(
              `/(app)/projects/${projectId}/edit-laminate?lamId=${lam.id}` as never,
            )
          }
          hitSlop={12}
          style={styles.navBtn}
          accessibilityLabel="Edit laminate"
        >
          <Ionicons name="create-outline" size={20} color={color.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity strip — same dense horizontal layout used on
            party detail. Brand on the title line, room + laminate
            code in the meta. */}
        <View style={styles.identityStrip}>
          <View style={styles.avatarSm}>
            <Ionicons name="layers-outline" size={20} color={color.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" color="text" numberOfLines={1}>
              {lam.brand}
            </Text>
            <Text style={styles.identityMeta} numberOfLines={1}>
              {lam.roomName.toUpperCase()}
              {lam.laminateCode ? `  ·  ${lam.laminateCode.toUpperCase()}` : ''}
            </Text>
          </View>
        </View>

        {/* Photo — tap to zoom. Empty state shows a placeholder. */}
        <View style={styles.card}>
          <Text variant="caption" color="textMuted" style={styles.cardLabel}>
            PHOTO
          </Text>
          {lam.photoUrl ? (
            <Pressable
              onPress={() => setPreviewOpen(true)}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              accessibilityLabel="Open photo full-screen"
            >
              <Image
                source={{ uri: lam.photoUrl }}
                style={styles.photo}
                resizeMode="cover"
              />
              <View style={styles.expandHint}>
                <Ionicons name="expand-outline" size={14} color="#fff" />
              </View>
            </Pressable>
          ) : (
            <View style={styles.photoEmpty}>
              <Ionicons name="image-outline" size={28} color={color.textFaint} />
              <Text variant="meta" color="textFaint" style={{ marginTop: 4 }}>
                No photo attached
              </Text>
            </View>
          )}
        </View>

        {/* Spec card */}
        <View style={styles.card}>
          <Text variant="caption" color="textMuted" style={styles.cardLabel}>
            SPECIFICATION
          </Text>
          <DetailRow icon="ribbon-outline" label="Brand" value={lam.brand} />
          <Divider />
          <DetailRow
            icon="pricetag-outline"
            label="Code"
            value={lam.laminateCode || '—'}
          />
          <Divider />
          <DetailRow icon="color-palette-outline" label="Finish" value={lam.finish} />
          <Divider />
          <DetailRow
            icon="resize-outline"
            label="Edge band"
            value={lam.edgeBandCode || '—'}
          />
        </View>

        {/* Notes (if any) */}
        {lam.notes ? (
          <View style={styles.card}>
            <Text variant="caption" color="textMuted" style={styles.cardLabel}>
              NOTES
            </Text>
            <Text variant="body" color="text" style={styles.notesText}>
              {lam.notes}
            </Text>
          </View>
        ) : null}

        <View style={{ height: space.xl }} />
      </ScrollView>

      <ImageViewer
        images={lam.photoUrl ? [lam.photoUrl] : []}
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </Screen>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={16} color={color.textMuted} />
      <Text variant="caption" color="textMuted" style={styles.metaLabel}>
        {label}
      </Text>
      <Text
        variant="body"
        color="text"
        style={styles.metaValue}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────

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

  card: {
    backgroundColor: color.bg,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  cardLabel: { marginTop: space.sm, marginBottom: space.xxs },

  // Photo block — full-bleed within the card padding, tap to zoom.
  photo: {
    width: '100%',
    height: 240,
    backgroundColor: color.surface,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  photoEmpty: {
    width: '100%',
    height: 140,
    backgroundColor: color.surface,
    alignItems: 'center', justifyContent: 'center',
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  expandHint: {
    position: 'absolute',
    top: space.sm + 6,
    right: space.sm,
    width: 26, height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
  metaLabel: { width: 90, marginLeft: 4 },
  metaValue: { flex: 1, textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.separator },

  notesText: {
    paddingVertical: space.sm,
    lineHeight: 20,
  },
});
