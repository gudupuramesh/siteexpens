/**
 * ScrollableTabBar: horizontal row of text tab labels with an animated
 * underline indicator. Used inside ProjectDetail to switch between
 * Party, Transaction, Site, Task, Attendance, Material, MOM, Design,
 * and Files.
 *
 * Unlike SegmentedChips, these are for switching content sections, not
 * filtering a list.
 */
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { color, space } from '@/src/theme';

import { Text } from './Text';

export type TabItem<K extends string = string> = {
  key: K;
  label: string;
};

export type ScrollableTabBarProps<K extends string = string> = {
  tabs: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: ViewStyle;
};

export function ScrollableTabBar<K extends string = string>({
  tabs,
  value,
  onChange,
  style,
}: ScrollableTabBarProps<K>) {
  return (
    <View style={[styles.wrapper, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              style={styles.tab}
            >
              <Text
                variant="metaStrong"
                color={active ? 'primary' : 'textMuted'}
                style={active ? styles.labelActive : undefined}
              >
                {t.label}
              </Text>
              <View
                style={[
                  styles.underline,
                  active && styles.underlineActive,
                ]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 44,
    backgroundColor: color.surface,
  },
  row: {
    paddingHorizontal: space.lg,
    gap: space.xl,
    alignItems: 'flex-end',
  },
  tab: {
    paddingTop: space.sm,
    alignItems: 'center',
  },
  labelActive: {
    fontWeight: '600',
  },
  underline: {
    marginTop: space.xs,
    height: 3,
    width: '100%',
    minWidth: 24,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: 'transparent',
  },
  underlineActive: {
    backgroundColor: color.primary,
  },
});
