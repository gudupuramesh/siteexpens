import { useState, useCallback } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useAttendance } from '@/src/features/attendance/useAttendance';
import { useDpr } from '@/src/features/dpr/useDpr';
import { useMaterials } from '@/src/features/materials/useMaterials';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { formatDate } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function SiteTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [date, setDate] = useState(new Date());
  const dateStr = toDateString(date);

  const { summary: attSummary } = useAttendance(projectId, dateStr, orgId || undefined);
  const { data: receivedMats } = useMaterials(projectId, 'received');
  const { data: usedMats } = useMaterials(projectId, 'used');
  const { data: dpr } = useDpr(projectId, dateStr);

  const goPrev = useCallback(() => {
    setDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  }, []);
  const goNext = useCallback(() => {
    setDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  }, []);

  const hasDpr = !!dpr;
  const openDpr = () => router.push(`/(app)/projects/${projectId}/dpr/${dateStr}` as never);

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

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
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

        {/* DPR summary when it exists */}
        {hasDpr && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="metaStrong" color="text">Today&apos;s Report</Text>
            </View>
            <View style={styles.dprCard}>
              {!!dpr.workDone && (
                <Text variant="body" color="text" numberOfLines={3}>
                  {dpr.workDone}
                </Text>
              )}
              <View style={styles.dprMetaRow}>
                <View style={styles.dprMeta}>
                  <Ionicons name="cloud-outline" size={14} color={color.textMuted} />
                  <Text variant="caption" color="textMuted" style={{ textTransform: 'capitalize' }}>
                    {dpr.weather}
                  </Text>
                </View>
                {!!dpr.issues && (
                  <View style={styles.dprMeta}>
                    <Ionicons name="alert-circle-outline" size={14} color={color.warning} />
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {dpr.issues}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Site photos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="metaStrong" color="text">Site Photos</Text>
          </View>
          {dpr && (dpr.photoUris?.length ?? 0) > 0 ? (
            <View style={styles.photoGrid}>
              {(dpr.photoUris ?? []).map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photoThumb} />
              ))}
            </View>
          ) : (
            <View style={styles.photosEmpty}>
              <Ionicons name="camera-outline" size={24} color={color.textFaint} />
              <Text variant="meta" color="textMuted">No photos for this date</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* DPR button */}
      <View style={styles.dprWrap}>
        <Pressable
          onPress={openDpr}
          style={({ pressed }) => [styles.dprBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons
            name={hasDpr ? 'create-outline' : 'document-text-outline'}
            size={18}
            color={color.onPrimary}
          />
          <Text variant="bodyStrong" style={{ color: color.onPrimary }}>
            {hasDpr ? 'View / Edit DPR' : 'Create DPR'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 96 },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.bg,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  cards: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: space.xxs,
    paddingVertical: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
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
  dprCard: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.separator,
    padding: space.sm,
    gap: space.xs,
  },
  dprMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  dprMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  photoThumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: color.bgGrouped, borderWidth: 1, borderColor: color.separator },
  photosEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
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
    borderRadius: radius.md,
    paddingVertical: space.sm,
    ...shadow.fab,
  },
});
