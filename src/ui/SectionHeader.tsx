/**
 * Section header. Uppercase 12pt muted label that introduces a list
 * group, like the labels above iOS Settings sections.
 *
 *   <SectionHeader>All Projects</SectionHeader>
 */
import { StyleSheet, View } from 'react-native';

import { screenInset, space } from '@/src/theme';

import { Text } from './Text';

export type SectionHeaderProps = {
  children: string;
  /** Optional trailing label, e.g. count: "3". Right-aligned, muted. */
  trailing?: string;
};

export function SectionHeader({ children, trailing }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="section" color="textMuted" style={styles.flex}>
        {children}
      </Text>
      {trailing ? (
        <Text variant="section" color="textFaint">
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: space.xxl,
    paddingBottom: space.md,
  },
  flex: {
    flex: 1,
  },
});
