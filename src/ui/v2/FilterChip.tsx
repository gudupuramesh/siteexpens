/**
 * v2 FilterChip — DESIGN.md §3.12.
 *
 * Pill chip with optional small count badge inline. Selected state =
 * blue solid background + white text. Default = soft fill background +
 * label color.
 *
 * Used in horizontal-scrolling filter rows on list screens (CRM, etc.).
 */
import { StyleSheet } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';
import { haptic } from '@/src/lib/haptics';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type FilterChipProps = {
  label: string;
  count?: number;
  selected?: boolean;
  onPress?: () => void;
};

export function FilterChip({ label, count, selected = false, onPress }: FilterChipProps) {
  const t = useThemeV2();
  const bg = selected ? t.palette.blue.base : t.colors.fill2;
  const fg = selected ? '#FFFFFF' : t.colors.label;
  const countOpacity = selected ? 0.9 : 0.5;

  return (
    <PressableScale
      onPress={() => {
        haptic.selection();
        onPress?.();
      }}
      hitSlop={6}
      pressOpacity={null}
      scaleTo={0.94}
      style={[
        styles.chip,
        {
          backgroundColor: bg,
          borderRadius: t.radii.pill,
          paddingHorizontal: 12,
          paddingVertical: 7,
        },
      ]}
    >
      <Text variant="footnote" style={{ color: fg, fontWeight: selected ? '700' : '500' }}>
        {label}
      </Text>
      {typeof count === 'number' ? (
        <Text
          variant="caption2"
          style={{
            color: fg,
            fontWeight: '600',
            marginLeft: 5,
            opacity: countOpacity,
          }}
        >
          {count}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
