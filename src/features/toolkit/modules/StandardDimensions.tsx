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

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

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
  const t = useThemeV2();

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return DIMENSION_GROUPS.map((g) => ({
        title: g.title,
        data: g.items,
      }));
    }
    return DIMENSION_GROUPS.map((g) => {
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
      title="Standard dimensions"
      scroll={false}
    >
      {/* Search field — v2 SearchBar shape */}
      <View style={styles.searchOuter}>
        <View
          style={[
            styles.searchWrap,
            {
              backgroundColor: t.colors.fill3,
              borderRadius: t.radii.field,
            },
          ]}
        >
          <Ionicons name="search" size={16} color={t.colors.tertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search counter, 24, wardrobe…"
            placeholderTextColor={t.colors.tertiary}
            style={[
              styles.searchInput,
              { color: t.colors.label, ...t.type.callout },
            ]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons
                name="close-circle"
                size={16}
                color={t.colors.tertiary}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index, section }) => (
          <DimensionRow
            item={item}
            isLast={index === section.data.length - 1}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: t.colors.bg },
            ]}
          >
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5 }}
            >
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={32} color={t.colors.tertiary} />
            <Text variant="footnote" color="secondary">
              No dimensions match "{query}".
            </Text>
          </View>
        }
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </ToolModal>
  );
}

function DimensionRow({
  item,
  isLast,
}: {
  item: StandardDimension;
  isLast: boolean;
}) {
  const t = useThemeV2();
  return (
    <View style={styles.rowOuter}>
      <View
        style={[
          styles.rowInner,
          {
            backgroundColor: t.colors.surface,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomLeftRadius: isLast ? t.radii.group : 0,
            borderBottomRightRadius: isLast ? t.radii.group : 0,
            borderBottomColor: isLast ? 'transparent' : t.colors.separator,
            borderBottomWidth: isLast ? 0 : t.hairline,
          },
        ]}
      >
        <View style={styles.rowMain}>
          <Text variant="callout" color="label" numberOfLines={2}>
            {item.label}
          </Text>
          {item.note ? (
            <Text
              variant="caption1"
              color="secondary"
              style={{ marginTop: 2 }}
              numberOfLines={2}
            >
              {item.note}
            </Text>
          ) : null}
        </View>
        <Text
          variant="footnote"
          style={{
            color: t.palette.blue.base,
            fontWeight: '700',
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
            maxWidth: 160,
          }}
          numberOfLines={1}
        >
          {item.value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchOuter: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    margin: 0,
  },

  listContent: { paddingBottom: 60 },

  // Section header above the grouped card
  sectionHeader: {
    paddingHorizontal: 32,
    paddingTop: 22,
    paddingBottom: 7,
  },

  // Each row: 16-px wide inset card edges to align with FormGroup feel
  rowOuter: {
    paddingHorizontal: 16,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowMain: { flex: 1 },

  empty: {
    paddingTop: 60,
    alignItems: 'center',
    gap: 10,
  },
});
