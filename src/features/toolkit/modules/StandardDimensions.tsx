/**
 * Standard Dimensions cheat sheet — searchable SectionList of common
 * interior measurements. Trade reference, not a calculator.
 *
 * Search filters by label OR value (so "24" surfaces every 24-inch
 * thing) OR section title. SectionList header pins on scroll for
 * orientation.
 */
import { useMemo, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, space } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import {
  DIMENSION_GROUPS,
  type StandardDimension,
} from '../data/standardDimensions';

export function StandardDimensions({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return DIMENSION_GROUPS.map((g) => ({
        title: g.title,
        data: g.items,
      }));
    }
    return DIMENSION_GROUPS.map((g) => {
      // Whole-section match → keep all items.
      if (g.title.toLowerCase().includes(q)) {
        return { title: g.title, data: g.items };
      }
      const items = g.items.filter(
        (it) =>
          it.label.toLowerCase().includes(q) ||
          it.value.toLowerCase().includes(q) ||
          (it.note?.toLowerCase().includes(q) ?? false),
      );
      return { title: g.title, data: items };
    }).filter((s) => s.data.length > 0);
  }, [query]);

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Standard Dimensions"
      eyebrow="REFERENCE"
      scroll={false}
    >
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={color.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search counter, 24, wardrobe…"
          placeholderTextColor={color.textFaint}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={16} color={color.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DimensionRow item={item} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={28} color={color.textFaint} />
            <Text style={styles.emptyText}>No dimensions match "{query}".</Text>
          </View>
        }
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
      />
    </ToolModal>
  );
}

function DimensionRow({ item }: { item: StandardDimension }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowLabel} numberOfLines={2}>
          {item.label}
        </Text>
        {item.note ? (
          <Text style={styles.rowNote} numberOfLines={2}>
            {item.note}
          </Text>
        ) : null}
      </View>
      <Text style={styles.rowValue} numberOfLines={1}>
        {item.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: color.text,
    paddingVertical: 4,
  },
  listContent: { paddingBottom: 60 },
  sectionHeader: {
    backgroundColor: color.bg,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  sectionTitle: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 12,
    backgroundColor: color.bg,
    gap: space.sm,
  },
  rowMain: { flex: 1 },
  rowLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    color: color.text,
  },
  rowNote: {
    fontSize: 12,
    color: color.textMuted,
    marginTop: 2,
  },
  rowValue: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    fontWeight: '600',
    color: color.primary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    maxWidth: 160,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
    marginLeft: space.md,
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: color.textMuted,
  },
});
