/**
 * Staff tab — v2 design.
 *
 * Studio staff roster (managers, supervisors, accountants etc. whose
 * monthly salary the studio pays out of overhead).
 *
 * Layout:
 *   1. KPI strip (ACTIVE / MONTHLY PAYROLL / ARCHIVED) — three soft cards
 *   2. Active staff section (FormGroup-style rows)
 *   3. Archived staff section (when present)
 *   4. FAB → /finance/add-staff
 *
 * Sits inside the Overview screen's pager — no own header / ambient bg.
 * Bottom padding accounts for the floating tab bar so the last row + FAB
 * never collide with the floating bottom navigation.
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { type Staff } from '@/src/features/staff/types';
import { useStaff } from '@/src/features/staff/useStaff';
import { formatInr } from '@/src/lib/format';

import { FAB } from '@/src/ui/v2/FAB';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

export function StaffTab() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { can } = usePermissions();
  const canWrite = can('finance.write');

  const { data: staff, loading } = useStaff(orgId);

  const { active, archived } = useMemo(() => {
    const a: Staff[] = [];
    const x: Staff[] = [];
    for (const s of staff) {
      if (s.archivedAt) x.push(s);
      else a.push(s);
    }
    return { active: a, archived: x };
  }, [staff]);

  const totalMonthly = useMemo(
    () => active.reduce((acc, s) => acc + (s.monthlySalary || 0), 0),
    [active],
  );

  type Section =
    | { kind: 'header'; label: string; count: number }
    | { kind: 'staff'; data: Staff };

  const sections: Section[] = useMemo(() => {
    const out: Section[] = [];
    if (active.length > 0) {
      out.push({ kind: 'header', label: 'Active', count: active.length });
      for (const s of active) out.push({ kind: 'staff', data: s });
    }
    if (archived.length > 0) {
      out.push({ kind: 'header', label: 'Archived', count: archived.length });
      for (const s of archived) out.push({ kind: 'staff', data: s });
    }
    return out;
  }, [active, archived]);

  const renderItem = ({ item }: { item: Section }) => {
    if (item.kind === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5 }}
          >
            {`${item.label.toUpperCase()} · ${item.count}`}
          </Text>
        </View>
      );
    }
    const s = item.data;
    const isArchived = !!s.archivedAt;
    const initial = s.name.charAt(0).toUpperCase() || '?';

    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(app)/staff/[staffId]',
            params: { staffId: s.id },
          })
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
            opacity: isArchived ? 0.7 : 1,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: isArchived
                ? t.colors.fill3
                : (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft),
            },
          ]}
        >
          <Text
            variant="callout"
            style={{
              color: isArchived ? t.colors.secondary : t.palette.blue.base,
              fontWeight: '600',
            }}
          >
            {initial}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              variant="callout"
              color="label"
             
              numberOfLines={1}
            >
              {s.name}
            </Text>
            {isArchived ? (
              <Text variant="caption2" color="tertiary" style={{ marginLeft: 6 }}>
                · Archived
              </Text>
            ) : null}
          </View>
          <Text variant="caption1" color="secondary" style={{ marginTop: 2 }} numberOfLines={1}>
            {s.role || 'Staff'} ·{' '}
            {s.payUnit === 'month'
              ? `${formatInr(s.monthlySalary)}/mo`
              : `${formatInr(s.monthlySalary)}/mo (per-day)`}
          </Text>
        </View>
        {s.isOrgMember ? (
          <View
            style={[
              styles.appPill,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
            ]}
          >
            <Ionicons name="phone-portrait-outline" size={11} color={t.palette.blue.base} />
            <Text
              variant="caption2"
              style={{
                color: t.palette.blue.base,
                fontWeight: '600',
                letterSpacing: 0.6,
              }}
            >
              APP
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* KPI strip — one combined card with hairline dividers (matches the
          Finance Overview pattern). All values neutral per 90/10. */}
      <View style={styles.kpiRowWrap}>
        <View
          style={[
            styles.kpiCard,
            {
              backgroundColor: t.colors.surface,
              borderRadius: t.radii.card,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(0,0,0,0.05)',
              borderWidth: t.hairline,
            },
          ]}
        >
          <KpiCell label="ACTIVE" value={String(active.length)} />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCell label="MONTHLY PAYROLL" value={formatInr(totalMonthly)} />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCell label="ARCHIVED" value={String(archived.length)} />
        </View>
      </View>

      <FlatList
        data={sections}
        keyExtractor={(item, idx) =>
          item.kind === 'header' ? `h-${item.label}` : `s-${item.data.id}-${idx}`
        }
        renderItem={renderItem}
        refreshControl={<RefreshControl {...refresh.props} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: t.region.tabBarBuffer + 80 },
        ]}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={t.palette.blue.base} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={32} color={t.colors.tertiary} />
              <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
                No staff yet
              </Text>
              <Text
                variant="caption1"
                color="secondary"
                style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
              >
                Add managers, supervisors and back-office staff to track
                attendance and post payroll each month.
              </Text>
            </View>
          )
        }
      />

      {canWrite ? (
        <FAB
          icon="person-add"
          onPress={() => router.push('/(app)/finance/add-staff' as never)}
          accessibilityLabel="Add staff"
        />
      ) : null}
    </View>
  );
}

/**
 * Compact KPI cell — one column inside the combined hairline-divided card.
 * Label + value stacked, both neutral per the 90/10 colour discipline.
 */
function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCell}>
      <Text
        variant="caption2"
        color="tertiary"
        style={{ letterSpacing: 0.6 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {label}
      </Text>
      <Text
        variant="footnote"
        color="label"
        style={{
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          marginTop: 2,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // KPI strip — single combined card with hairline dividers
  kpiRowWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  kpiCard: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  kpiCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  kpiDivider: {
    width: StyleSheet.hairlineWidth,
  },

  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },

  empty: {
    paddingTop: 60,
    alignItems: 'center',
  },
});
