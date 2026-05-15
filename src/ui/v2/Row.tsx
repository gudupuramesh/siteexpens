/**
 * v2 Row — list row inside a FormGroup.
 *
 * Layout (left → right):
 *   [leading]  label                     value  [trailing]  chevron
 *
 * Min height 48. Hairline divider rendered at the bottom (offset by leading
 * width when present), unless `divider={false}`.
 *
 * NOTE: We branch on `onPress` and render either a Pressable (with the
 * function-style for the press feedback) OR a plain View (with a static
 * style). Earlier versions tried to use one Wrapper with a style FUNCTION
 * — but `View.style` does not accept functions, so non-pressable rows
 * silently dropped all styles and rendered as `flexDirection: 'column'`,
 * stacking label and value vertically with the hairline running between.
 * Splitting the two paths keeps both happy.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';
import { haptic } from '@/src/lib/haptics';

import { Text } from './Text';

export type RowProps = {
  /** Optional leading slot — typically an <IconTile />. */
  leading?: ReactNode;
  /** Required: the row label. */
  label: string;
  /** Optional secondary line below the label (e.g. tool description). */
  subtitle?: string;
  /** Optional right-aligned value (secondary color). */
  value?: string;
  /** Optional override color for the value (e.g. red for destructive). */
  valueColor?: string;
  /** Optional custom right-side element (e.g. Switch). Replaces value if both. */
  trailing?: ReactNode;
  /** Show chevron-right (typical for nav rows). */
  chevron?: boolean;
  /** Render the bottom divider. Default true; pass false for last row. */
  divider?: boolean;
  /** Optional override for row min height. Default 48 (or 60 with subtitle). */
  height?: number;
  onPress?: () => void;
};

export function Row({
  leading,
  label,
  subtitle,
  value,
  valueColor,
  trailing,
  chevron = false,
  divider = true,
  height,
  onPress,
}: RowProps) {
  const t = useThemeV2();
  const dividerLeft = leading ? 56 : 16;
  const minHeight = height ?? (subtitle ? 60 : 48);

  // Label sizing rules:
  //   • Subtitle present → labelStack takes flex:1 so the chevron
  //     hugs the right edge (already the case).
  //   • Value present     → label is content-sized (flexShrink:0) and
  //     `value` (with its own flex:1 + right-align) fills the gap and
  //     pushes the chevron right.
  //   • Otherwise         → no value to push the chevron right, so
  //     the label itself takes flex:1 and shoves the chevron to the
  //     end. Without this, label+chevron clumped at the left of the
  //     row (the bug we're fixing).
  const hasValue = value !== undefined;
  const labelStretches = !hasValue;
  const labelNode = subtitle ? (
    <View style={styles.labelStack}>
      <Text variant="callout" color="label" numberOfLines={1}>
        {label}
      </Text>
      <Text
        variant="caption1"
        color="secondary"
        style={{ marginTop: 2 }}
        numberOfLines={2}
      >
        {subtitle}
      </Text>
    </View>
  ) : (
    <Text
      variant="callout"
      color="label"
      style={labelStretches ? styles.labelStretch : styles.label}
      numberOfLines={1}
    >
      {label}
    </Text>
  );

  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}

      {labelNode}

      {value !== undefined ? (
        <Text
          variant="callout"
          color={
            valueColor && !['label', 'secondary', 'tertiary'].includes(valueColor)
              ? valueColor
              : (valueColor as 'label' | 'secondary' | 'tertiary' | undefined) ?? 'secondary'
          }
          style={styles.value}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}

      {trailing}

      {chevron ? (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={t.colors.tertiary}
          style={{ marginLeft: 6 }}
        />
      ) : null}

      {divider ? (
        <View
          style={[
            styles.divider,
            { backgroundColor: t.colors.separator, left: dividerLeft },
          ]}
        />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          haptic.selection();
          onPress();
        }}
        style={({ pressed }) => [
          styles.row,
          { minHeight, paddingVertical: subtitle ? 10 : 0 },
          pressed && { backgroundColor: t.colors.fill3 },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, { minHeight, paddingVertical: subtitle ? 10 : 0 }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    position: 'relative',
  },
  leading: {
    marginRight: 12,
  },
  label: {
    flexShrink: 0,
    marginRight: 12,
  },
  // Used when there's no value/trailing — label takes the full
  // remaining width so the chevron hugs the right edge.
  labelStretch: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  // When subtitle is present, label+subtitle stack takes flex:1.
  labelStack: {
    flex: 1,
    minWidth: 0,
  },
  // Value gets the rest of the row, right-aligned. flex:1 ensures it
  // takes the remaining space (which means long values truncate at the
  // right edge instead of pushing the chevron off-screen).
  value: {
    flex: 1,
    textAlign: 'right',
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },
});
