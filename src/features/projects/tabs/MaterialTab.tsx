/**
 * Material tab — v2 design.
 *
 * Layout:
 *   1. Filter chip rail (All / Pending / Approved / Rejected) + library btn
 *   2. Value KPI strip — Required now (pending) · Visible value
 *   3. List of material-request cards (icon + title + items + audit + amount + pill)
 *   4. FAB — New material request (per material.request.write capability)
 */
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useMaterialRequests } from '@/src/features/materialRequests/useMaterialRequests';
import { useProjectTabRefreshKey } from '@/src/features/projects/ProjectTabRefreshContext';
import { useFirestoreRefresh } from '@/src/lib/useFirestoreRefresh';
import type { MaterialRequest, MaterialRequestStatus } from '@/src/features/materialRequests/types';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { useProject } from '@/src/features/projects/useProject';
import { formatInr } from '@/src/lib/format';
import { Can } from '@/src/ui/Can';

import { FAB } from '@/src/ui/v2/FAB';
import { IconTile } from '@/src/ui/v2/IconTile';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function compactDateTime(ts: MaterialRequest['createdAt'] | null | undefined): string {
  if (!ts) return '—';
  const dt = ts.toDate();
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function RequestRow({
  item,
  projectId,
  getMemberLabel,
}: {
  item: MaterialRequest;
  projectId: string;
  getMemberLabel: (uid?: string) => string;
}) {
  const t = useThemeV2();
  const dateStr = item.createdAt
    ? item.createdAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : '—';
  const receivedCount = item.items.filter((i) => i.deliveryStatus === 'received_at_site').length;
  const requestedBy = getMemberLabel(item.createdBy);
  const approvedBy = getMemberLabel(item.approvedBy);
  const requestedAtText = compactDateTime(item.createdAt);
  const approvedAtText = compactDateTime(item.approvedAt);

  const statusTone =
    item.status === 'pending'
      ? { fg: t.palette.orange.base, bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft, label: 'PENDING' }
      : item.status === 'approved'
        ? { fg: t.palette.green.base, bg: t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft, label: 'APPROVED' }
        : item.status === 'rejected'
          ? { fg: t.palette.red.base, bg: t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft, label: 'REJECTED' }
          : { fg: t.palette.blue.base, bg: t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft, label: 'DRAFT' };

  return (
    <Pressable
      onPress={() =>
        router.push(`/(app)/projects/${projectId}/material-request/${item.id}` as never)
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.rowTop}>
        <IconTile icon="document-text-outline" color={t.palette.blue.base} size={36} />
        <View style={styles.rowBody}>
          <View style={styles.titleLine}>
            <Text
              variant="callout"
              color="label"
              style={{ flex: 1, fontWeight: '700' }}
              numberOfLines={1}
            >
              {item.title || 'Material request'}
            </Text>
            <Text
              variant="callout"
              color="label"
              style={{
                fontWeight: '700',
                fontVariant: ['tabular-nums'],
                marginLeft: 8,
              }}
              numberOfLines={1}
            >
              {formatInr(item.totalValue)}
            </Text>
          </View>
          <Text
            variant="caption1"
            color="secondary"
            numberOfLines={1}
            style={{ marginTop: 2 }}
          >
            {item.items.length} item{item.items.length !== 1 ? 's' : ''} · {dateStr}
            {item.status === 'approved' && receivedCount > 0
              ? ` · ${receivedCount}/${item.items.length} received`
              : ''}
          </Text>
        </View>
      </View>

      {/* Audit lines + status pill */}
      <View style={styles.auditRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.metaIconRow}>
            <Ionicons name="person-outline" size={11} color={t.colors.tertiary} />
            <Text
              variant="caption2"
              color="secondary"
              numberOfLines={1}
              style={{ marginLeft: 4 }}
            >
              Req: {requestedBy} · {requestedAtText}
            </Text>
          </View>
          {item.status === 'approved' ? (
            <View style={styles.metaIconRow}>
              <Ionicons name="checkmark-circle" size={11} color={t.palette.green.base} />
              <Text
                variant="caption2"
                color="secondary"
                numberOfLines={1}
                style={{ marginLeft: 4 }}
              >
                Apr: {approvedBy} · {approvedAtText}
              </Text>
            </View>
          ) : null}
          {item.status === 'rejected' ? (
            <View style={styles.metaIconRow}>
              <Ionicons name="close-circle" size={11} color={t.palette.red.base} />
              <Text
                variant="caption2"
                style={{ color: t.palette.red.base, marginLeft: 4 }}
                numberOfLines={1}
              >
                {item.rejectionNote || 'Rejected'}
              </Text>
            </View>
          ) : null}
        </View>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusTone.bg, borderRadius: 999 },
          ]}
        >
          <Text
            variant="caption2"
            style={{
              color: statusTone.fg,
              fontWeight: '700',
              letterSpacing: 0.4,
            }}
          >
            {statusTone.label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function MaterialTab() {
  const t = useThemeV2();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data: project } = useProject(projectId);
  const { members } = useOrgMembers(project?.orgId);
  const [filter, setFilter] = useState('');
  const focusRefresh = useProjectTabRefreshKey();
  const { refreshing, refresh, refreshKey } = useFirestoreRefresh();
  const { data, loading } = useMaterialRequests(
    projectId,
    (filter || undefined) as MaterialRequestStatus | undefined,
    refreshKey + focusRefresh,
  );
  const requiredNowValue = data
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + r.totalValue, 0);
  const visibleTotalValue = data.reduce((sum, r) => sum + r.totalValue, 0);
  const membersByUid = new Map(members.map((m) => [m.uid, m]));
  const getMemberLabel = (uid?: string): string => {
    if (!uid) return 'Unknown';
    if (uid === project?.ownerId) return membersByUid.get(uid)?.displayName ?? 'Owner';
    if (project?.approverIds?.includes(uid)) return membersByUid.get(uid)?.displayName ?? 'Approver';
    return membersByUid.get(uid)?.displayName ?? 'Team';
  };

  return (
    <View style={styles.container}>
      {/* Filter chip rail */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key || 'all'}
              onPress={() => setFilter(f.key)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.filterChip,
                {
                  backgroundColor: active
                    ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                    : t.colors.fill3,
                  borderRadius: 999,
                  borderColor: active ? t.palette.blue.base + '33' : 'transparent',
                  borderWidth: active ? 1 : 0,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                variant="caption2"
                style={{
                  color: active ? t.palette.blue.base : t.colors.secondary,
                  fontWeight: active ? '700' : '600',
                  letterSpacing: 0.3,
                }}
              >
                {f.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => router.push('/(app)/material-library' as never)}
          hitSlop={8}
          style={({ pressed }) => [
            styles.libraryBtn,
            {
              backgroundColor: t.colors.surface,
              borderRadius: 999,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.05)',
              borderWidth: t.hairline,
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Material library"
        >
          <Ionicons name="library-outline" size={16} color={t.palette.blue.base} />
        </Pressable>
      </View>

      {/* Value KPI strip */}
      <View style={styles.kpiRow}>
        <KpiTile
          label="REQUIRED NOW"
          value={formatInr(requiredNowValue)}
          tone={t.palette.orange.base}
          bg={t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft}
        />
        <KpiTile
          label="VISIBLE VALUE"
          value={formatInr(visibleTotalValue)}
          tone={t.colors.label}
          bg={t.colors.fill3}
        />
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="footnote" color="secondary">Loading…</Text>
        </View>
      ) : data.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={32} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
            No material requests
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32, maxWidth: 320 }}
          >
            Create a material request, get it approved, and share it with your supplier.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RequestRow item={item} projectId={projectId!} getMemberLabel={getMemberLabel} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={t.palette.blue.base}
            />
          }
        />
      )}

      {/* FAB */}
      <Can capability="material.request.write">
        <FAB
          icon="add"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/(app)/projects/${projectId}/add-material-request` as never);
          }}
          bottomOffset={24}
          accessibilityLabel="New material request"
        />
      </Can>
    </View>
  );
}

function KpiTile({
  label,
  value,
  tone,
  bg,
}: {
  label: string;
  value: string;
  tone: string;
  bg: string;
}) {
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.kpiTile,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
      ]}
    >
      <View style={[styles.kpiDot, { backgroundColor: bg }]}>
        <View style={[styles.kpiDotInner, { backgroundColor: tone }]} />
      </View>
      <View style={styles.kpiText}>
        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4, fontSize: 9 }}>
          {label}
        </Text>
        <Text
          variant="footnote"
          style={{
            color: tone,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
            marginTop: 1,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Filter chip rail
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  libraryBtn: {
    marginLeft: 'auto',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // KPI strip
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  kpiTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  kpiDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  kpiText: {
    flex: 1,
    minWidth: 0,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },

  auditRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  metaIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
});
