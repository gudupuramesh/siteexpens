/**
 * Org-wide material-requests inbox — surfaces every open material
 * request across the active org. Mounted from the home tab Summary
 * card's "REQUESTS" cell tap.
 *
 * Default view: PENDING requests (the ones blocking work). A small
 * status filter at the top lets the user flip to APPROVED / REJECTED
 * / ALL when they need to audit.
 *
 * Each row shows: status pill · request title · project name ·
 * total ₹ value · item count. Tap → routes to the existing
 * per-project material-request detail
 * (`/(app)/projects/[id]/material-request/[reqId]`).
 *
 * Read-only — approve / reject still happens on the per-project
 * detail screen so the existing workflow logic isn't duplicated.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOrgMaterialRequests } from '@/src/features/materialRequests/useOrgMaterialRequests';
import type {
  MaterialRequest,
  MaterialRequestStatus,
} from '@/src/features/materialRequests/types';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useProjects } from '@/src/features/projects/useProjects';
import { formatInr } from '@/src/lib/format';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2, type ThemeV2 } from '@/src/theme/v2';

// ── Helpers ─────────────────────────────────────────────────────────

type FilterKey = MaterialRequestStatus | 'all';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function statusTone(s: MaterialRequestStatus, t: ThemeV2): { fg: string; bg: string; label: string } {
  switch (s) {
    case 'pending':
      return {
        fg: t.palette.orange.base,
        bg:
          t.mode === 'dark'
            ? t.palette.orange.softDark
            : t.palette.orange.soft,
        label: 'PENDING',
      };
    case 'approved':
      return {
        fg: t.palette.green.base,
        bg:
          t.mode === 'dark'
            ? t.palette.green.softDark
            : t.palette.green.soft,
        label: 'APPROVED',
      };
    case 'rejected':
      return {
        fg: t.palette.red.base,
        bg:
          t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
        label: 'REJECTED',
      };
    case 'draft':
      return {
        fg: t.colors.secondary,
        bg: t.colors.fill3,
        label: 'DRAFT',
      };
  }
}

// ── Screen ──────────────────────────────────────────────────────────

export default function OrgMaterialRequestsScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;

  const [filter, setFilter] = useState<FilterKey>('pending');
  const { data: allRequests, loading } = useOrgMaterialRequests(orgId);
  const { data: projects } = useProjects();

  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const visible = useMemo(() => {
    if (filter === 'all') return allRequests;
    return allRequests.filter((r) => r.status === filter);
  }, [allRequests, filter]);

  // Pending count is the most important — anchor it in the subtitle so
  // the user always sees the "needs your attention" number even when
  // they've flipped to a different filter.
  const pendingCount = useMemo(
    () => allRequests.filter((r) => r.status === 'pending').length,
    [allRequests],
  );

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: t.colors.separator,
            borderBottomWidth: t.hairline,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.headerSideBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={t.colors.label} />
        </Pressable>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text
            variant="headline"
            color="label"
            style={{ fontWeight: '700' }}
            numberOfLines={1}
          >
            Material requests
          </Text>
          <Text variant="caption2" color="secondary" numberOfLines={1}>
            {loading
              ? 'Loading…'
              : pendingCount === 0
                ? 'No pending approvals'
                : `${pendingCount} pending`}
          </Text>
        </View>

        <View style={styles.headerSideBtn} />
      </View>

      {/* Status filter pills */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.filterPill,
                {
                  backgroundColor: active
                    ? t.mode === 'dark'
                      ? t.palette.blue.softDark
                      : t.palette.blue.soft
                    : t.colors.fill3,
                  borderRadius: t.radii.pill,
                },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${f.label} filter`}
            >
              <Text
                variant="caption1"
                style={{
                  color: active ? t.palette.blue.base : t.colors.secondary,
                  fontWeight: '600',
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: insets.bottom + 24,
            gap: 8,
          }}
          renderItem={({ item }) => (
            <RequestRow
              req={item}
              projectName={projectName.get(item.projectId) ?? item.projectId}
            />
          )}
        />
      )}
    </View>
  );
}

// ── Row ────────────────────────────────────────────────────────────

function RequestRow({
  req,
  projectName,
}: {
  req: MaterialRequest;
  projectName: string;
}) {
  const t = useThemeV2();
  const tone = statusTone(req.status, t);
  const itemCount = Array.isArray(req.items) ? req.items.length : 0;

  return (
    <Pressable
      onPress={() =>
        router.push(
          `/(app)/projects/${req.projectId}/material-request/${req.id}` as never,
        )
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${req.title}, ${projectName}, ${tone.label}, ${formatInr(req.totalValue)}`}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Title row + status pill */}
        <View style={styles.titleRow}>
          <Text
            variant="callout"
            color="label"
            style={{ flex: 1, fontWeight: '600' }}
            numberOfLines={1}
          >
            {req.title || 'Untitled request'}
          </Text>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: tone.bg, borderRadius: t.radii.pill },
            ]}
          >
            <Text
              variant="caption2"
              style={{
                color: tone.fg,
                fontWeight: '700',
                letterSpacing: 0.4,
              }}
            >
              {tone.label}
            </Text>
          </View>
        </View>

        {/* Project + items + value */}
        <Text
          variant="caption1"
          color="secondary"
          style={{ marginTop: 4 }}
          numberOfLines={1}
        >
          {projectName}
          {`  ·  ${itemCount} item${itemCount === 1 ? '' : 's'}`}
          {`  ·  ${formatInr(req.totalValue)}`}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Empty ──────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterKey }) {
  const t = useThemeV2();
  const message =
    filter === 'pending'
      ? 'No pending material requests right now.'
      : filter === 'approved'
        ? 'No approved material requests yet.'
        : filter === 'rejected'
          ? 'No rejected material requests.'
          : 'No material requests yet.';
  return (
    <View style={styles.emptyWrap}>
      <View
        style={[
          styles.emptyTile,
          {
            backgroundColor:
              t.mode === 'dark'
                ? t.palette.blue.softDark
                : t.palette.blue.soft,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Ionicons
          name="document-text-outline"
          size={28}
          color={t.palette.blue.base}
        />
      </View>
      <Text
        variant="title3"
        color="label"
        style={{ marginTop: 14, fontWeight: '700' }}
      >
        Nothing here
      </Text>
      <Text
        variant="caption1"
        color="secondary"
        style={{ marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }}
      >
        {message}
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  headerSideBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
  },
  emptyTile: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
