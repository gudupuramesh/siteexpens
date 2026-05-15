/**
 * Laminate tab — v2 design.
 *
 * Layout:
 *   1. Summary KPI strip — Rooms · Laminates · Brands
 *   2. Per-room sections — small caps room header + laminate row cards
 *      (thumbnail + brand + mono code/finish/edge-band meta + notes)
 *   3. FAB — Add laminate (per `laminate.write` capability)
 */
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useLaminates } from '@/src/features/laminates/useLaminates';
import type { Laminate, RoomLaminates } from '@/src/features/laminates/types';
import { useProjectTabRefreshKey } from '@/src/features/projects/ProjectTabRefreshContext';
import { Can } from '@/src/ui/Can';

import { FAB } from '@/src/ui/v2/FAB';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

function LaminateRow({
  item,
  projectId,
  isFirst,
  isLast,
}: {
  item: Laminate;
  projectId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useThemeV2();
  const meta = [
    item.laminateCode,
    item.finish,
    item.edgeBandCode ? `EB ${item.edgeBandCode}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')
    .toUpperCase();

  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <Pressable
      onPress={() =>
        router.push(`/(app)/projects/${projectId}/laminate/${item.id}` as never)
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderTopLeftRadius: isFirst ? t.radii.card : 0,
          borderTopRightRadius: isFirst ? t.radii.card : 0,
          borderBottomLeftRadius: isLast ? t.radii.card : 0,
          borderBottomRightRadius: isLast ? t.radii.card : 0,
          borderColor: cardBorder,
          borderTopWidth: isFirst ? t.hairline : 0,
          borderBottomWidth: t.hairline,
          borderLeftWidth: t.hairline,
          borderRightWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
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
        {item.photoUrl ? (
          <Image
            source={{ uri: item.photoUrl }}
            style={styles.thumbImg}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbEmpty}>
            <Ionicons name="image-outline" size={18} color={t.colors.tertiary} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text variant="callout" color="label" numberOfLines={1}>
          {item.brand}
        </Text>
        {meta ? (
          <Text
            variant="caption2"
            style={{
              color: t.palette.blue.base,
              fontWeight: '700',
              letterSpacing: 0.6,
              marginTop: 4,
            }}
            numberOfLines={1}
          >
            {meta}
          </Text>
        ) : null}
        {item.notes ? (
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4 }}
            numberOfLines={1}
          >
            {item.notes}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
    </Pressable>
  );
}

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
        <Text
          variant="caption2"
          color="secondary"
          style={{ letterSpacing: 0.5 }}
        >
          {room.roomName.toUpperCase()}
        </Text>
        <Text
          variant="caption2"
          color="tertiary"
          style={{ letterSpacing: 0.4 }}
        >
          {room.laminates.length} {room.laminates.length === 1 ? 'ITEM' : 'ITEMS'}
        </Text>
      </View>
      <View style={styles.sectionBody}>
        {room.laminates.map((lam, i) => (
          <LaminateRow
            key={lam.id}
            item={lam}
            projectId={projectId}
            isFirst={i === 0}
            isLast={i === room.laminates.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

export function LaminateTab() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  // Bumps every time the parent project screen regains focus, forcing
  // `useLaminates` to re-subscribe its Firestore listener. Closes the
  // "added a laminate but it doesn't appear until I leave + come back"
  // bug caused by stack-push freezing the snapshot callback.
  const focusRefresh = useProjectTabRefreshKey();
  const { rooms, data, loading } = useLaminates(projectId, focusRefresh);
  const brands = new Set(data.map((l) => l.brand));

  return (
    <View style={styles.container}>
      {/* Summary KPI strip — all neutral per the colour discipline (only
          blue/red/orange/green carry meaning; metric counts are categorical
          data, not actionable status). */}
      <View style={styles.kpiRow}>
        <KpiTile label="ROOMS" value={String(rooms.length)} />
        <KpiTile label="LAMINATES" value={String(data.length)} />
        <KpiTile label="BRANDS" value={String(brands.size)} />
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="footnote" color="secondary">Loading laminates…</Text>
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="layers-outline" size={32} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
            No laminates added
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32, maxWidth: 320 }}
          >
            Add laminate selections for each room — brand, finish, edge band, and reference photos.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.roomName}
          renderItem={({ item }) => <RoomSection room={item} projectId={projectId!} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl {...refresh.props} />}
        />
      )}

      <Can capability="laminate.write">
        <FAB
          icon="add"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/(app)/projects/${projectId}/add-laminate` as never);
          }}
          bottomOffset={24}
          accessibilityLabel="Add laminate"
        />
      </Can>
    </View>
  );
}

/**
 * KPI metric tile — neutral by design.
 *
 * Per the app-wide colour discipline (only blue/red/orange/green carry
 * meaning), KPI counts render in neutral theme tokens regardless of metric.
 * The `tone` and `bg` props are kept on the type for back-compat but their
 * values are ignored.
 */
function KpiTile({
  label,
  value,
}: {
  label: string;
  value: string;
  /** @deprecated value renders in neutral label colour. */
  tone?: string;
  /** @deprecated dot renders with neutral fill3 background. */
  bg?: string;
}) {
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.kpiTile,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
      ]}
    >
      <View style={[styles.kpiDot, { backgroundColor: t.colors.fill3 }]}>
        <View style={[styles.kpiDotInner, { backgroundColor: t.colors.tertiary }]} />
      </View>
      <View style={styles.kpiText}>
        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4, fontSize: 9 }}>
          {label}
        </Text>
        <Text
          variant="footnote"
          color="label"
          style={{
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  kpiTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  kpiDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  kpiText: {
    flex: 1,
    minWidth: 0,
  },

  // Section
  section: {
    marginTop: 18,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionBody: {},

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },

  listContent: { paddingBottom: 100 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
