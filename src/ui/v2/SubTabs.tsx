/**
 * v2 SubTabs — horizontally-scrollable underline-style sub-tab strip.
 *
 * Used at the top of a tab body to switch between sections (e.g.
 * Project detail → Overview / Site / DPR / Tasks / …).
 *
 * Selected tab: bold label + 2px blue underline beneath the label.
 * Unselected: medium-weight secondary label.
 *
 * Auto-scroll: whenever `selected` changes (tap OR page-swipe in the
 * parent TabPager), the strip scrolls to keep the active tab centred
 * in the viewport. So on a phone where 4 tabs fit at a time, swiping
 * past the 4th tab automatically reveals tabs 5, 6, 7… on the right.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';
import { haptic } from '@/src/lib/haptics';

import { Text } from './Text';

export type SubTabItem<K extends string = string> = {
  key: K;
  label: string;
};

export type SubTabsProps<K extends string = string> = {
  items: SubTabItem<K>[];
  selected: K;
  onChange: (key: K) => void;
};

export function SubTabs<K extends string = string>({
  items,
  selected,
  onChange,
}: SubTabsProps<K>) {
  const t = useThemeV2();

  const scrollRef = useRef<ScrollView>(null);
  /** Per-tab measured layout (x + width) keyed by tab key. */
  const layoutsRef = useRef<Map<string, { x: number; width: number }>>(new Map());
  /** ScrollView's own viewport width, captured on its `onLayout`. */
  const viewportWidthRef = useRef(0);
  /** Has the initial (instant, non-animated) scroll happened? */
  const didInitialScrollRef = useRef(false);

  /** Centre the active tab in the viewport. Clamped to [0, ∞] —
   *  ScrollView clamps the right side itself. */
  const scrollToActive = useCallback(
    (animated: boolean) => {
      const layout = layoutsRef.current.get(selected);
      const vw = viewportWidthRef.current;
      if (!layout || !vw) return;
      const targetX = layout.x + layout.width / 2 - vw / 2;
      scrollRef.current?.scrollTo({ x: Math.max(0, targetX), animated });
    },
    [selected],
  );

  // Selected changed (tap or swipe) → animate to the new active tab.
  // Skipped on the very first render — that path is handled inside
  // the active tab's `onLayout` so we only scroll once we actually
  // know its position (no jump before measurement).
  useEffect(() => {
    if (didInitialScrollRef.current) {
      scrollToActive(true);
    }
  }, [selected, scrollToActive]);

  return (
    <View
      style={[
        styles.wrap,
        { borderBottomColor: t.colors.separator, borderBottomWidth: t.hairline },
      ]}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        onLayout={(e) => {
          viewportWidthRef.current = e.nativeEvent.layout.width;
          // If the active tab was already measured before the
          // ScrollView's own layout fired, position it now.
          if (!didInitialScrollRef.current && layoutsRef.current.has(selected)) {
            didInitialScrollRef.current = true;
            scrollToActive(false);
          }
        }}
      >
        {items.map((item) => {
          const isActive = item.key === selected;
          return (
            <Pressable
              key={item.key}
              onPress={() => {
                if (!isActive) haptic.selection();
                onChange(item.key);
              }}
              hitSlop={6}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onLayout={(e) => {
                layoutsRef.current.set(item.key, {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                });
                // First time we measure the active tab AND have a
                // viewport width, snap to its position (no animation)
                // so the strip never opens with an off-screen active
                // tab on screens where there are many tabs.
                if (
                  !didInitialScrollRef.current &&
                  item.key === selected &&
                  viewportWidthRef.current > 0
                ) {
                  didInitialScrollRef.current = true;
                  scrollToActive(false);
                }
              }}
            >
              <Text
                variant="subhead"
                color={isActive ? 'label' : 'secondary'}
                style={{ fontWeight: isActive ? '700' : '500' }}
              >
                {item.label}
              </Text>
              <View
                style={[
                  styles.underline,
                  {
                    backgroundColor: isActive
                      ? t.palette.blue.base
                      : 'transparent',
                  },
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
  wrap: {
    width: '100%',
  },
  row: {
    paddingHorizontal: 16,
    gap: 18,
  },
  tab: {
    paddingTop: 4,
    paddingBottom: 0,
    alignItems: 'center',
  },
  underline: {
    height: 2,
    width: '100%',
    marginTop: 8,
    borderRadius: 2,
  },
});
