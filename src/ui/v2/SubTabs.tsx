/**
 * v2 SubTabs — horizontally-scrollable underline-style sub-tab strip.
 *
 * Used at the top of a tab body to switch between sections (e.g.
 * CRM → Leads / Appointments / Quotation / Invoice).
 *
 * Selected tab: bold label + 2px blue underline beneath the label.
 * Unselected: medium-weight secondary label.
 *
 * Pure presentational — parent owns the active key and handles `onChange`.
 */
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

  return (
    <View
      style={[
        styles.wrap,
        { borderBottomColor: t.colors.separator, borderBottomWidth: t.hairline },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
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
