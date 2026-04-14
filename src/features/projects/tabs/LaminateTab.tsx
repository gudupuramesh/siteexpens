import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useLaminates } from '@/src/features/laminates/useLaminates';
import type { Laminate, RoomLaminates } from '@/src/features/laminates/types';
import { Text } from '@/src/ui/Text';
import { Separator } from '@/src/ui/Separator';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

function LaminateCard({ item, projectId }: { item: Laminate; projectId: string }) {
  return (
    <Pressable
      onPress={() => router.push(`/(app)/projects/${projectId}/edit-laminate?lamId=${item.id}` as never)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
    >
      {/* Photo placeholder or actual photo */}
      <View style={styles.cardPhoto}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={styles.cardPhotoPlaceholder}>
            <Ionicons name="image-outline" size={28} color={color.textFaint} />
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        {/* Brand */}
        <Text variant="rowTitle" color="text" numberOfLines={1}>
          {item.brand}
        </Text>

        {/* Laminate Code */}
        {item.laminateCode ? (
          <Text variant="metaStrong" color="primary" numberOfLines={1}>
            {item.laminateCode}
          </Text>
        ) : null}

        {/* Finish */}
        <View style={styles.detailRow}>
          <Text variant="caption" color="textMuted">Finish</Text>
          <Text variant="meta" color="text" numberOfLines={1}>{item.finish}</Text>
        </View>

        {/* Edge Band */}
        <View style={styles.detailRow}>
          <Text variant="caption" color="textMuted">Edge Band</Text>
          <Text variant="meta" color="text" numberOfLines={1}>{item.edgeBandCode}</Text>
        </View>

        {/* Notes */}
        {item.notes ? (
          <Text variant="meta" color="textMuted" numberOfLines={2} style={{ marginTop: 2 }}>
            {item.notes}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function RoomSection({ room, projectId }: { room: RoomLaminates; projectId: string }) {
  return (
    <View style={styles.roomSection}>
      <View style={styles.roomHeader}>
        <Ionicons name="home-outline" size={16} color={color.primary} />
        <Text variant="bodyStrong" color="text">{room.roomName}</Text>
        <View style={styles.roomCount}>
          <Text variant="caption" color="primary">{room.laminates.length}</Text>
        </View>
      </View>

      {room.laminates.map((lam) => (
        <LaminateCard key={lam.id} item={lam} projectId={projectId} />
      ))}
    </View>
  );
}

export function LaminateTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { rooms, data, loading } = useLaminates(projectId);

  return (
    <View style={styles.container}>
      {/* Summary */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">ROOMS</Text>
          <Text variant="metaStrong" color="text">{rooms.length}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">LAMINATES</Text>
          <Text variant="metaStrong" color="text">{data.length}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">BRANDS</Text>
          <Text variant="metaStrong" color="text">
            {new Set(data.map((l) => l.brand)).size}
          </Text>
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
            Add laminate selections for each room — brand, finish, edge band code, and photos.
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    paddingVertical: space.sm,
    paddingHorizontal: screenInset,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },

  // Room section
  roomSection: {
    marginBottom: space.md,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
  },
  roomCount: {
    paddingHorizontal: space.xs,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: color.primarySoft,
  },

  // Card
  card: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    gap: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  cardPhoto: {
    width: 80,
    height: 80,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: color.bgGrouped,
  },
  cardImage: {
    width: 80,
    height: 80,
  },
  cardPhotoPlaceholder: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgGrouped,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },

  // List
  listContent: {
    paddingBottom: 80,
  },

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
