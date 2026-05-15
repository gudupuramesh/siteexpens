/**
 * Files tab — v2 design.
 *
 * Versioned file library for a project. Schema lives at
 * `designs/{designId}` for back-compat — the user-facing label is "Files".
 *
 * Layout:
 *   1. Filter chip rail — All · 2D · 3D · Layout · MOM · Agreement · Other
 *      (auto-scrolls the tapped chip into view)
 *   2. List of file rows — surface card with:
 *      - 56×56 thumbnail (image preview or red PDF placeholder)
 *      - Title + category pill
 *      - Relative-time meta + optional description
 *   3. FAB — Upload file (per design.write capability)
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
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

import { FAB } from '@/src/ui/v2/FAB';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

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
  const t = useThemeV2();
  const updated = item.updatedAt?.toDate();
  const ago = updated ? formatRelative(updated).toUpperCase() : '—';
  const categoryLabel = getCategoryLabel(item.category);

  return (
    <Pressable
      onPress={() =>
        router.push(`/(app)/projects/${projectId}/design/${item.id}` as never)
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
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
        {item.thumbnailUrl ? (
          <Image
            source={{ uri: item.thumbnailUrl }}
            style={styles.thumbImg}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.thumbPdf}>
            <Ionicons
              name="document-text-outline"
              size={20}
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
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            variant="callout"
            color="label"
            style={{ flex: 1, fontWeight: '600' }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <View
            style={[
              styles.categoryBadge,
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
              {categoryLabel.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text
          variant="caption2"
          color="tertiary"
          style={{ letterSpacing: 0.5, marginTop: 4 }}
          numberOfLines={1}
        >
          {ago}
        </Text>
        {item.description ? (
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4 }}
            numberOfLines={1}
          >
            {item.description}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
    </Pressable>
  );
}

const ALL_KEY = 'all' as const;
type FilterKey = typeof ALL_KEY | FileCategory;

export function DesignTab() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: designs, loading } = useDesigns(projectId, orgId || undefined);

  const [filter, setFilter] = useState<FilterKey>(ALL_KEY);

  const chipScrollRef = useRef<ScrollView | null>(null);
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
      {/* Filter chip rail */}
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
          <Text variant="footnote" color="secondary">Loading files…</Text>
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-outline" size={32} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
            {filter === ALL_KEY ? 'No files uploaded' : 'No files in this category'}
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32, maxWidth: 320 }}
          >
            Add 2D layouts, 3D renders, PDFs, MOMs, agreements — anything. Each upload creates a new version.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => <FileRow item={item} projectId={projectId!} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl {...refresh.props} />}
        />
      )}

      <Can capability="design.write">
        <FAB
          icon="add"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/(app)/projects/${projectId}/add-design` as never);
          }}
          bottomOffset={24}
          accessibilityLabel="Upload file"
        />
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
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
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
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Chip rail
  chipScrollWrap: {
    flexGrow: 0,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chipScroll: {
    paddingHorizontal: 16,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

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
  thumbPdf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
