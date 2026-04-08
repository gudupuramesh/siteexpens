/**
 * ProjectCard: the image-led list card on the Projects dashboard.
 *
 * Structure per design-system.json v2 components.projectCard:
 *   - Photo spans the full width at the top (120pt tall), rounded on
 *     top corners only. Fallback is a tinted primary initial.
 *   - Body: title + 1-line address + date range caption
 *   - Footer: 3-cell money row (VALUE primary, IN success, OUT danger)
 */
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { formatDateRange, formatInr } from '@/src/lib/format';
import { color, radius, shadow, space } from '@/src/theme';

import { Text } from './Text';

export type ProjectCardProps = {
  name: string;
  siteAddress: string;
  startDate: Date | null;
  endDate: Date | null;
  value: number;
  photoUri: string | null;
  totalIn?: number;
  totalOut?: number;
  onPress?: () => void;
  style?: ViewStyle;
};

export function ProjectCard({
  name,
  siteAddress,
  startDate,
  endDate,
  value,
  photoUri,
  totalIn = 0,
  totalOut = 0,
  onPress,
  style,
}: ProjectCardProps) {
  const initial = name.charAt(0).toUpperCase() || '?';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && onPress && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <View style={styles.photo}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoImg} resizeMode="cover" />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text variant="largeTitle" color="primary">
              {initial}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text variant="rowTitle" color="text" numberOfLines={1}>
          {name}
        </Text>
        {siteAddress ? (
          <Text variant="meta" color="textMuted" numberOfLines={1} style={styles.meta}>
            {siteAddress}
          </Text>
        ) : null}
        <Text variant="caption" color="textFaint" style={styles.meta}>
          {formatDateRange(startDate, endDate)}
        </Text>

        <View style={styles.footer}>
          <View style={styles.footerCell}>
            <Text variant="caption" color="textMuted">VALUE</Text>
            <Text variant="bodyStrong" color="primary" tabular>
              {formatInr(value)}
            </Text>
          </View>
          <View style={[styles.footerCell, styles.footerCellDivider]}>
            <Text variant="caption" color="textMuted">IN</Text>
            <Text variant="bodyStrong" color="success" tabular>
              {formatInr(totalIn)}
            </Text>
          </View>
          <View style={[styles.footerCell, styles.footerCellDivider]}>
            <Text variant="caption" color="textMuted">OUT</Text>
            <Text variant="bodyStrong" color="danger" tabular>
              {formatInr(totalOut)}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.hairline,
  },
  photo: {
    width: '100%',
    height: 128,
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: space.md,
  },
  meta: {
    marginTop: 2,
  },
  footer: {
    marginTop: space.md,
    flexDirection: 'row',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  footerCell: {
    flex: 1,
    gap: 2,
  },
  footerCellDivider: {
    borderLeftWidth: 1,
    borderLeftColor: color.border,
    paddingLeft: space.sm,
  },
});
