/**
 * SegmentedChips: a horizontally scrollable row of outlined pill chips,
 * used for FILTERING content (Inventory/Request/Received/Used, All/Site
 * Staff/Labour Contractor, etc.).
 *
 * Different from ScrollableTabBar — chips filter a list in place; tabs
 * switch between entirely different content sections.
 */
import { Pressable, ScrollView, StyleSheet, type ViewStyle } from 'react-native';

import { color, radius, space } from '@/src/theme';

import { Text } from './Text';

export type ChipOption<K extends string = string> = {
  key: K;
  label: string;
};

export type SegmentedChipsProps<K extends string = string> = {
  options: ChipOption<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: ViewStyle;
};

export function SegmentedChips<K extends string = string>({
  options,
  value,
  onChange,
  style,
}: SegmentedChipsProps<K>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, style]}
    >
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={({ pressed }) => [
              styles.chip,
              active ? styles.chipActive : styles.chipIdle,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              variant="metaStrong"
              color={active ? 'primary' : 'textMuted'}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: space.xs,
    paddingHorizontal: 0,
  },
  chip: {
    height: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: color.surface,
    borderColor: color.borderStrong,
  },
  chipActive: {
    backgroundColor: color.primarySoft,
    borderColor: color.primary,
  },
});
