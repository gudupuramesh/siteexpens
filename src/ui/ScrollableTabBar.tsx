/**
 * ScrollableTabBar: horizontal row of text tab labels with an animated
 * underline indicator. Auto-scrolls to keep the active tab visible.
 */
import { useCallback, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

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
  const scrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const scrollViewWidth = useRef(0);

  const handleScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    scrollViewWidth.current = e.nativeEvent.layout.width;
  }, []);

  const handleTabLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[key] = { x, width };
  }, []);

  const scrollToTab = useCallback((key: string) => {
    const layout = tabLayouts.current[key];
    if (!layout || !scrollRef.current) return;

    const svWidth = scrollViewWidth.current;
    // Center the tab in the scroll view
    const targetX = layout.x - (svWidth / 2) + (layout.width / 2);
    scrollRef.current.scrollTo({ x: Math.max(0, targetX), animated: true });
  }, []);

  const handlePress = useCallback((key: K) => {
    onChange(key);
    scrollToTab(key);
  }, [onChange, scrollToTab]);

  return (
    <View style={[styles.wrapper, style]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        onLayout={handleScrollViewLayout}
      >
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <Pressable
              key={t.key}
              onPress={() => handlePress(t.key)}
              onLayout={(e) => handleTabLayout(t.key, e)}
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
