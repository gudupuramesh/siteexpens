/**
 * ProjectRow: compact, dense list row for the Projects dashboard.
 *
 * ~80px tall. Left thumbnail (48×48) + title/address/amount row + chevron.
 * Designed for 5-6 rows visible on screen at once.
 */
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatInr } from '@/src/lib/format';
import type { ProjectStatus } from '@/src/features/projects/types';
import { color, radius, space } from '@/src/theme';

import { Text } from './Text';

const STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: color.success },
  on_hold: { label: 'On Hold', color: color.warning },
  completed: { label: 'Completed', color: color.textMuted },
  archived: { label: 'Archived', color: color.textFaint },
};

export type ProjectRowProps = {
  name: string;
  siteAddress: string;
  startDate: Date | null;
  endDate: Date | null;
  value: number;
  photoUri: string | null;
  status: ProjectStatus;
  onPress?: () => void;
  style?: ViewStyle;
};

function formatShortDateRange(start: Date | null, end: Date | null): string {
  if (!start) return '';
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  if (!end) return fmt(start) + ' –';
  return `${fmt(start)} – ${fmt(end)}`;
}

export function ProjectRow({
  name,
  siteAddress,
  value,
  photoUri,
  status,
  startDate,
  endDate,
  onPress,
  style,
}: ProjectRowProps) {
  const initial = name.charAt(0).toUpperCase() || '?';
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  const dateStr = formatShortDateRange(startDate, endDate);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && styles.rowPressed,
        style,
      ]}
    >
      {/* Thumbnail */}
      <View style={styles.thumb}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.thumbImg} />
        ) : (
          <View style={[styles.thumbPlaceholder]}>
            <Text variant="bodyStrong" color="primary">{initial}</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text variant="bodyStrong" color="text" numberOfLines={1}>
          {name}
        </Text>
        {siteAddress ? (
          <Text variant="meta" color="textMuted" numberOfLines={1} style={styles.address}>
            {siteAddress}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text variant="metaStrong" color="primary" tabular>
            {formatInr(value)}
          </Text>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
            <Text variant="caption" style={{ color: statusCfg.color }}>
              {statusCfg.label}
            </Text>
          </View>
          {dateStr ? (
            <Text variant="caption" color="textFaint" style={styles.dateText}>
              {dateStr}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Chevron */}
      {onPress ? (
        <Ionicons name="chevron-forward" size={16} color={color.textFaint} style={styles.chevron} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  rowPressed: {
    backgroundColor: color.surfaceAlt,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.xs,
    overflow: 'hidden',
    marginRight: space.sm,
  },
  thumbImg: {
    width: 48,
    height: 48,
  },
  thumbPlaceholder: {
    flex: 1,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  address: {
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: space.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dateText: {
    marginLeft: 'auto',
  },
  chevron: {
    marginLeft: space.xs,
  },
});
