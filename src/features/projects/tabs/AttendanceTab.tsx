import { useState, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useAttendance } from '@/src/features/attendance/useAttendance';
import { updateAttendanceStatus } from '@/src/features/attendance/attendance';
import type { AttendanceRecord, AttendanceStatus } from '@/src/features/attendance/types';
import { formatDate } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { Separator } from '@/src/ui/Separator';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function StatusToggle({
  status,
  onToggle,
}: {
  status: AttendanceStatus;
  onToggle: (s: AttendanceStatus) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Pressable
        onPress={() => onToggle('present')}
        style={[styles.toggleBtn, status === 'present' && styles.togglePresent]}
      >
        <Text variant="caption" style={{ color: status === 'present' ? '#fff' : color.success }}>P</Text>
      </Pressable>
      <Pressable
        onPress={() => onToggle('absent')}
        style={[styles.toggleBtn, status === 'absent' && styles.toggleAbsent]}
      >
        <Text variant="caption" style={{ color: status === 'absent' ? '#fff' : color.danger }}>A</Text>
      </Pressable>
      <Pressable
        onPress={() => onToggle('half_day')}
        style={[styles.toggleBtn, status === 'half_day' && styles.toggleHalf]}
      >
        <Text variant="caption" style={{ color: status === 'half_day' ? '#fff' : color.warning }}>H</Text>
      </Pressable>
    </View>
  );
}

export function AttendanceTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [date, setDate] = useState(new Date());
  const dateStr = toDateString(date);
  const { data, loading, summary } = useAttendance(projectId, dateStr);

  const goPrev = useCallback(() => {
    setDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() - 1);
      return n;
    });
  }, []);

  const goNext = useCallback(() => {
    setDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 1);
      return n;
    });
  }, []);

  const handleToggle = useCallback(async (record: AttendanceRecord, newStatus: AttendanceStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await updateAttendanceStatus(record.id, newStatus);
    } catch (err) {
      console.warn('[AttendanceTab] toggle error:', err);
    }
  }, []);

  const renderItem = ({ item }: { item: AttendanceRecord }) => {
    const initial = item.labourName.charAt(0).toUpperCase();
    return (
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text variant="metaStrong" style={{ color: color.primary }}>{initial}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>{item.labourName}</Text>
          <Text variant="caption" color="textMuted">{item.labourRole}</Text>
        </View>
        <StatusToggle
          status={item.status}
          onToggle={(s) => handleToggle(item, s)}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Date bar */}
      <View style={styles.dateBar}>
        <Pressable onPress={goPrev} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={color.textMuted} />
        </Pressable>
        <Text variant="metaStrong" color="text">{formatDate(date)}</Text>
        <Pressable onPress={goNext} hitSlop={8}>
          <Ionicons name="chevron-forward" size={18} color={color.textMuted} />
        </Pressable>
      </View>

      {/* Summary */}
      {data.length > 0 && (
        <View style={styles.summaryRow}>
          <View style={[styles.summaryChip, { backgroundColor: color.successSoft }]}>
            <Text variant="caption" style={{ color: color.success }}>{summary.present} Present</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: color.dangerSoft }]}>
            <Text variant="caption" style={{ color: color.danger }}>{summary.absent} Absent</Text>
          </View>
          {summary.halfDay > 0 && (
            <View style={[styles.summaryChip, { backgroundColor: color.warningSoft }]}>
              <Text variant="caption" style={{ color: color.warning }}>{summary.halfDay} Half</Text>
            </View>
          )}
        </View>
      )}

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
            No labourers added
          </Text>
          <Text variant="meta" color="textMuted" align="center">
            Add daily workers and contractors to track attendance.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(app)/projects/${projectId}/add-labour` as never);
        }}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
        accessibilityLabel="Add labour"
      >
        <Ionicons name="add" size={24} color={color.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    paddingVertical: space.sm,
    paddingHorizontal: screenInset,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingVertical: space.xs,
    backgroundColor: color.surface,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  summaryChip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  toggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePresent: {
    backgroundColor: color.success,
    borderColor: color.success,
  },
  toggleAbsent: {
    backgroundColor: color.danger,
    borderColor: color.danger,
  },
  toggleHalf: {
    backgroundColor: color.warning,
    borderColor: color.warning,
  },
  listContent: {
    paddingBottom: 80,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },
  emptyTitle: { marginTop: space.xxs },
  fab: {
    position: 'absolute',
    right: screenInset,
    bottom: space.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
