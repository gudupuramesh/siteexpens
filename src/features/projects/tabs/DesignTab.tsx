/**
 * Files tab — versioned file library for a project.
 *
 * Replaces the old separate Design + MOM + Files tabs. Every uploaded
 * doc lands here (2D, 3D, layouts, MOMs, agreements, anything else),
 * filtered by the chip row at the top. Each row shows a category
 * badge so users can scan the list at a glance.
 *
 * Schema lives at `designs/{designId}` for back-compat — the user
 * facing label is "Files".
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useDesigns } from '@/src/features/designs/useDesigns';
import {
  FILE_CATEGORIES,
  getCategoryLabel,
  type Design,
  type FileCategory,
} from '@/src/features/designs/types';
import { Can } from '@/src/ui/Can';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, screenInset, shadow, space } from '@/src/theme';

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function FileRow({ item, projectId }: { item: Design; projectId: string }) {
  const updated = item.updatedAt?.toDate();
  const ago = updated ? formatRelative(updated).toUpperCase() : '—';
  // No more versions on the doc — meta is just the timestamp now,
  // since the category badge already shows the category in the title row.
  const meta = ago;
  const categoryLabel = getCategoryLabel(item.category);
  return (
    <Pressable
      onPress={() =>
        router.push(`/(app)/projects/${projectId}/design/${item.id}` as never)
      }
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.thumb}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbImg} resizeMode="cover" />
        ) : (
          <View style={styles.thumbPdf}>
            <Ionicons name="document-text-outline" size={20} color={color.danger} />
            <Text style={styles.thumbBadge}>PDF</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="rowTitle" color="text" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
            {item.title}
          </Text>
          {/* Category badge — small, mono, uppercase. */}
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{categoryLabel.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        {item.description ? (
          <Text variant="meta" color="textMuted" numberOfLines={1} style={{ marginTop: 2 }}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
    </Pressable>
  );
}

/** Special filter chip for "All". */
const ALL_KEY = 'all' as const;
type FilterKey = typeof ALL_KEY | FileCategory;

export function DesignTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: designs, loading } = useDesigns(projectId, orgId || undefined);

  const [filter, setFilter] = useState<FilterKey>(ALL_KEY);

  // Auto-scroll the chip row to keep the tapped chip fully visible.
  // The chip strip routinely overflows the screen (7 chips, some with
  // long labels), so without this the user can land on a chip that
  // sits half off-screen and not realise siblings exist past the edge.
  const chipScrollRef = useRef<ScrollView | null>(null);
  /** Per-chip layout cache: x = offset from start of contentContainer,
   *  w = chip width. Filled by each FilterChip's onLayout. */
  const chipLayoutsRef = useRef<Map<FilterKey, { x: number; w: number }>>(new Map());
  const { width: screenW } = useWindowDimensions();

  const onChipLayout = useCallback((key: FilterKey, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    chipLayoutsRef.current.set(key, { x, w: width });
  }, []);

  const scrollChipIntoView = useCallback(
    (key: FilterKey) => {
      const layout = chipLayoutsRef.current.get(key);
      if (!layout) return;
      // Center the chip in the viewport when possible. The viewport
      // width matches the screen since the strip spans the full row.
      // Math.max keeps us from scrolling negative when the chip is
      // already near the start.
      const target = Math.max(0, layout.x + layout.w / 2 - screenW / 2);
      chipScrollRef.current?.scrollTo({ x: target, animated: true });
    },
    [screenW],
  );

  const selectFilter = useCallback(
    (key: FilterKey) => {
      setFilter(key);
      scrollChipIntoView(key);
    },
    [scrollChipIntoView],
  );

  // Per-category counts, used both for the filter chips' badges and
  // for the empty state message when a category is empty.
  const categoryCounts = useMemo(() => {
    const map = new Map<FileCategory | 'other', number>();
    for (const d of designs) {
      const k = (d.category ?? 'other') as FileCategory;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [designs]);

  const visible = useMemo(() => {
    if (filter === ALL_KEY) return designs;
    return designs.filter((d) => (d.category ?? 'other') === filter);
  }, [designs, filter]);

  return (
    <View style={styles.container}>
      {/* Chip row — All + one chip per category. Horizontally scroll
          so the row stays single-line on small screens. */}
      <ScrollView
        ref={chipScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
        style={styles.chipScrollWrap}
      >
        <FilterChip
          label={`ALL · ${designs.length}`}
          active={filter === ALL_KEY}
          onPress={() => selectFilter(ALL_KEY)}
          onLayout={(e) => onChipLayout(ALL_KEY, e)}
        />
        {/* Always render every category chip — even ones with zero
            files — so the user can see and scroll through the full
            taxonomy (2D / 3D / Layout / MOM / Agreement / Other)
            without categories vanishing once empty. */}
        {FILE_CATEGORIES.map((c) => {
          const count = categoryCounts.get(c.key) ?? 0;
          return (
            <FilterChip
              key={c.key}
              label={`${c.label.toUpperCase()} · ${count}`}
              active={filter === c.key}
              onPress={() => selectFilter(c.key)}
              onLayout={(e) => onChipLayout(c.key, e)}
            />
          );
        })}
      </ScrollView>

      {loading && designs.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading files…</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
            {filter === ALL_KEY ? 'No files uploaded' : 'No files in this category'}
          </Text>
          <Text variant="meta" color="textMuted" align="center">
            Add 2D layouts, 3D renders, PDFs, MOMs, agreements — anything.
            Each upload creates a new version; old versions stay available.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => <FileRow item={item} projectId={projectId!} />}
          ItemSeparatorComponent={() => <View style={styles.rowDivider} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Can capability="design.write">
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/(app)/projects/${projectId}/add-design` as never);
          }}
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
          accessibilityLabel="Upload file"
        >
          <Ionicons name="add" size={24} color={color.onPrimary} />
        </Pressable>
      </Can>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  onLayout,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  /** Hooks into the parent's chip-position cache so the row can
   *  auto-scroll the active chip into view when tapped. */
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={active ? styles.chipTextActive : styles.chipText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bgGrouped },

  // Chip filter row — sits above the list, scrolls horizontally.
  chipScrollWrap: {
    flexGrow: 0,
    backgroundColor: color.bgGrouped,
    paddingTop: space.sm,
    paddingBottom: 2,
  },
  chipScroll: {
    paddingHorizontal: screenInset,
    gap: 6,
  },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: 8,
  },
  chipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  chipText: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.text,
    letterSpacing: 1.2,
  },
  chipTextActive: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1.2,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
    marginHorizontal: screenInset,
  },
  thumb: {
    width: 56, height: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbPdf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  thumbBadge: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.danger,
    letterSpacing: 1.2,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: color.primarySoft,
    borderRadius: radius.sm,
  },
  categoryBadgeText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: 0.8,
  },
  meta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.primary,
    letterSpacing: 0.8,
    marginTop: 2,
  },

  listContent: { paddingTop: space.sm, paddingBottom: 100 },

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
