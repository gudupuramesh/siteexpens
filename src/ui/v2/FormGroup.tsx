/**
 * v2 FormGroup — DESIGN: grouped list container with optional uppercase
 * header above and optional footer note below.
 *
 * Mirrors the shape used in `Ui stytem for Sitexpens/src/screen-account.jsx`:
 *  • Header sits above the card, padded 32 px from the screen edge
 *  • Card has 18 px corner radius, single hairline inset border, surface bg
 *  • Children are `<Row>`s — they lay out vertically with hairline dividers
 *    (the divider is rendered by Row itself; Row controls when to omit it)
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';

import { Text } from './Text';

export type FormGroupProps = {
  header?: string;
  footer?: string;
  children: ReactNode;
  style?: ViewStyle;
};

export function FormGroup({ header, footer, children, style }: FormGroupProps) {
  const t = useThemeV2();

  return (
    <View style={[styles.wrap, style]}>
      {header ? (
        <Text
          variant="caption2"
          color="secondary"
          style={[
            styles.header,
            { letterSpacing: 0.4 },
          ]}
        >
          {header.toUpperCase()}
        </Text>
      ) : null}

      <View
        style={[
          styles.card,
          {
            backgroundColor: t.colors.surface,
            borderRadius: t.radii.group,
            borderColor:
              t.mode === 'dark'
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(0,0,0,0.04)',
            borderWidth: t.hairline,
          },
        ]}
      >
        {children}
      </View>

      {footer ? (
        <Text
          variant="caption1"
          color="secondary"
          style={styles.footer}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 24,
  },
  header: {
    paddingHorizontal: 32,
    paddingBottom: 7,
  },
  card: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  footer: {
    paddingHorizontal: 32,
    paddingTop: 7,
  },
});
