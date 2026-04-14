import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useMaterialRequests } from '@/src/features/materialRequests/useMaterialRequests';
import type { MaterialRequest, MaterialRequestStatus } from '@/src/features/materialRequests/types';
import { formatInr } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { Separator } from '@/src/ui/Separator';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function statusBadge(status: MaterialRequestStatus) {
  switch (status) {
    case 'pending': return { bg: color.warningSoft, fg: color.warning, label: 'Pending' };
    case 'approved': return { bg: color.successSoft, fg: color.success, label: 'Approved' };
    case 'rejected': return { bg: color.dangerSoft, fg: color.danger, label: 'Rejected' };
    default: return { bg: color.primarySoft, fg: color.primary, label: 'Draft' };
  }
}

function RequestRow({ item, projectId }: { item: MaterialRequest; projectId: string }) {
  const badge = statusBadge(item.status);
  const dateStr = item.createdAt
    ? item.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : '—';
  const receivedCount = item.items.filter((i) => i.deliveryStatus === 'received_at_site').length;

  return (
    <Pressable
      onPress={() => router.push(`/(app)/projects/${projectId}/material-request/${item.id}` as never)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="document-text-outline" size={18} color={color.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text variant="rowTitle" color="text" numberOfLines={1}>{item.title || 'Material Request'}</Text>
        <Text variant="meta" color="textMuted" numberOfLines={1}>
          {item.items.length} item{item.items.length !== 1 ? 's' : ''} · {dateStr}
          {item.status === 'approved' && receivedCount > 0 ? ` · ${receivedCount}/${item.items.length} received` : ''}
        </Text>
      </View>
      <View style={styles.rowTrailing}>
        <Text variant="metaStrong" color="text">{formatInr(item.totalValue)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text variant="caption" style={{ color: badge.fg }}>{badge.label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function MaterialTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [filter, setFilter] = useState('');
  const { data, loading } = useMaterialRequests(
    projectId,
    (filter || undefined) as MaterialRequestStatus | undefined,
  );

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text variant="caption" style={{ color: active ? '#fff' : color.text }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Library button */}
        <Pressable
          onPress={() => router.push('/(app)/material-library' as never)}
          style={styles.libraryBtn}
          hitSlop={8}
        >
          <Ionicons name="library-outline" size={18} color={color.primary} />
        </Pressable>
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={32} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
            No material requests
          </Text>
          <Text variant="meta" color="textMuted" align="center" style={{ maxWidth: 280 }}>
            Create a material request, get it approved, and share with your supplier.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RequestRow item={item} projectId={projectId!} />}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* FAB */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(app)/projects/${projectId}/add-material-request` as never);
        }}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
        accessibilityLabel="New material request"
      >
        <Ionicons name="add" size={24} color={color.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.xs,
    backgroundColor: color.surface,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  filterChip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
  },
  filterChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  libraryBtn: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTrailing: { alignItems: 'flex-end', gap: 4 },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  listContent: { paddingBottom: 80 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },
  emptyTitle: { marginTop: space.xxs },
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
