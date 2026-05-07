/**
 * Laminate tab — list of laminate specs grouped by room.
 *
 * Visual language matches the project's TransactionTab / party detail
 * pattern: hairline borders, sharp corners, dense rows, mono meta
 * line. Tapping a row goes to the read-only detail view; the edit
 * pencil there sends to the existing edit-laminate form.
 */
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useLaminates } from '@/src/features/laminates/useLaminates';
import type { Laminate, RoomLaminates } from '@/src/features/laminates/types';
import { Can } from '@/src/ui/Can';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, screenInset, shadow, space } from '@/src/theme';

// ── Row ──────────────────────────────────────────────────────────────

function LaminateRow({
  item,
  projectId,
}: {
  item: Laminate;
  projectId: string;
}) {
  // Mono meta line stitched together from the most identifying
  // fields. Each piece omits cleanly when missing — `filter(Boolean)`.
  const meta = [
    item.laminateCode,
    item.finish,
    item.edgeBandCode ? `EB ${item.edgeBandCode}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  return (
    <Pressable
      onPress={() =>
        router.push(
          `/(app)/projects/${projectId}/laminate/${item.id}` as never,
        )
      }
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      {/* Square hairline-bordered thumbnail (matches TransactionTab
          icon shape — distinct from the rounded chip language used
          for parties). */}
      <View style={styles.thumb}>
        {item.photoUrl ? (
          <Image
            source={{ uri: item.photoUrl }}
            style={styles.thumbImg}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbEmpty}>
            <Ionicons name="image-outline" size={16} color={color.textFaint} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text variant="rowTitle" color="text" numberOfLines={1}>
          {item.brand}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {item.notes ? (
          <Text variant="meta" color="textMuted" numberOfLines={1} style={styles.notes}>
            {item.notes}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
    </Pressable>
  );
}

// ── Section ──────────────────────────────────────────────────────────

function RoomSection({
  room,
  projectId,
}: {
  room: RoomLaminates;
  projectId: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>
          {room.roomName.toUpperCase()}
        </Text>
        <Text style={styles.sectionCount}>
          {room.laminates.length} {room.laminates.length === 1 ? 'item' : 'items'}
        </Text>
      </View>
      <View style={styles.sectionBody}>
        {room.laminates.map((lam, i) => (
          <View key={lam.id}>
            {i > 0 ? <View style={styles.rowDivider} /> : null}
            <LaminateRow item={lam} projectId={projectId} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────

export function LaminateTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { rooms, data, loading } = useLaminates(projectId);
  const brands = new Set(data.map((l) => l.brand));

  return (
    <View style={styles.container}>
      {/* Summary strip — same shape as TransactionTab. */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>ROOMS</Text>
          <Text style={styles.summaryValue}>{rooms.length}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>LAMINATES</Text>
          <Text style={styles.summaryValue}>{data.length}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>BRANDS</Text>
          <Text style={styles.summaryValue}>{brands.size}</Text>
        </View>
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading laminates…</Text>
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="layers-outline" size={32} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={{ marginTop: space.xs }}>
            No laminates added
          </Text>
          <Text variant="meta" color="textMuted" align="center" style={{ maxWidth: 280 }}>
            Add laminate selections for each room — brand, finish, edge band,
            and reference photos.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.roomName}
          renderItem={({ item }) => <RoomSection room={item} projectId={projectId!} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* FAB */}
      <Can capability="laminate.write">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/(app)/projects/${projectId}/add-laminate` as never);
          }}
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
          accessibilityLabel="Add laminate"
        >
          <Ionicons name="add" size={24} color={color.onPrimary} />
        </Pressable>
      </Can>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bgGrouped },

  // Summary strip
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    overflow: 'hidden',
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 2,
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.2,
  },
  summaryValue: {
    fontFamily: fontFamily.mono,
    fontSize: 18,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
  },

  // Section (room)
  section: {
    marginTop: space.md,
    paddingHorizontal: screenInset,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
  },
  sectionCount: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textFaint,
    letterSpacing: 1,
  },
  sectionBody: {
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
  },
  thumb: {
    width: 56,
    height: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.primary,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  notes: {
    marginTop: 2,
  },

  // List
  listContent: { paddingBottom: 100 },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: screenInset,
    bottom: space.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
