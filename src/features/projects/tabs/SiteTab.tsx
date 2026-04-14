import { useState, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

import { useAttendance } from '@/src/features/attendance/useAttendance';
import { useMaterials } from '@/src/features/materials/useMaterials';
import { formatDate } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function SiteTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [date, setDate] = useState(new Date());
  const dateStr = toDateString(date);

  const { summary: attSummary } = useAttendance(projectId, dateStr);
  const { data: receivedMats } = useMaterials(projectId, 'received');
  const { data: usedMats } = useMaterials(projectId, 'used');

  const goPrev = useCallback(() => {
    setDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  }, []);
  const goNext = useCallback(() => {
    setDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  }, []);

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

      {/* Summary cards */}
      <View style={styles.cards}>
        <View style={styles.card}>
          <Ionicons name="people" size={20} color={color.primary} />
          <Text variant="title" color="text">{attSummary.present}</Text>
          <Text variant="caption" color="textMuted">Staff Present</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="arrow-down-circle" size={20} color={color.success} />
          <Text variant="title" color="text">{receivedMats.length}</Text>
          <Text variant="caption" color="textMuted">Material In</Text>
        </View>
        <View style={styles.card}>
          <Ionicons name="arrow-up-circle" size={20} color={color.danger} />
          <Text variant="title" color="text">{usedMats.length}</Text>
          <Text variant="caption" color="textMuted">Material Used</Text>
        </View>
      </View>

      {/* Site photos placeholder */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="metaStrong" color="text">Site Photos</Text>
        </View>
        <View style={styles.photosEmpty}>
          <Ionicons name="camera-outline" size={24} color={color.textFaint} />
          <Text variant="meta" color="textMuted">No photos for this date</Text>
        </View>
      </View>

      {/* DPR button */}
      <View style={styles.dprWrap}>
        <Pressable style={({ pressed }) => [styles.dprBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="document-text-outline" size={18} color={color.onPrimary} />
          <Text variant="bodyStrong" style={{ color: color.onPrimary }}>Create DPR</Text>
        </Pressable>
      </View>
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
  cards: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingVertical: space.md,
    gap: space.sm,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: space.xxs,
    paddingVertical: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
  },
  section: {
    paddingHorizontal: screenInset,
    marginTop: space.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  photosEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
    gap: space.xs,
  },
  dprWrap: {
    position: 'absolute',
    left: screenInset,
    right: screenInset,
    bottom: space.xl,
  },
  dprBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: color.primary,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    ...shadow.fab,
  },
});
