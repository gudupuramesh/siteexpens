/**
 * Staff tab — studio staff roster (managers, supervisors, accountants
 * etc. whose monthly salary the studio pays out of overhead).
 *
 * Lists active staff first, then archived; FAB opens an add-staff
 * sheet. Tap a row → existing `/staff/[staffId]` detail screen
 * (which handles attendance + edit + archive).
 *
 * Payroll posting + monthly attendance UI live in Phase 2 (Payroll
 * + Attendance tabs).
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { type Staff } from '@/src/features/staff/types';
import { useStaff } from '@/src/features/staff/useStaff';
import { formatInr } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, screenInset, shadow, space } from '@/src/theme';

export function StaffTab() {
  const insets = useSafeAreaInsets();
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
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            {item.label.toUpperCase()} · {item.count}
          </Text>
        </View>
      );
    }
    const s = item.data;
    const isArchived = !!s.archivedAt;
    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(app)/staff/[staffId]',
            params: { staffId: s.id },
          })
        }
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.avatar, isArchived && styles.avatarArchived]}>
          <Text
            variant="metaStrong"
            style={{ color: isArchived ? color.textMuted : color.primary }}
          >
            {s.name.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>
            {s.name}
            {isArchived ? (
              <Text variant="caption" color="textMuted">
                {'  '}· Archived
              </Text>
            ) : null}
          </Text>
          <Text variant="meta" color="textMuted" numberOfLines={1}>
            {s.role || 'Staff'} ·{' '}
            {s.payUnit === 'month'
              ? `${formatInr(s.monthlySalary)}/mo`
              : `${formatInr(s.monthlySalary)}/mo (per-day)`}
          </Text>
        </View>
        {s.isOrgMember ? (
          <View style={styles.appPill}>
            <Ionicons name="phone-portrait-outline" size={11} color={color.primary} />
            <Text variant="caption" color="primary">App</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Summary card — same hairline pattern as Dashboard / FinanceView */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>ACTIVE</Text>
          <Text style={styles.summaryValue}>{active.length}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>MONTHLY PAYROLL</Text>
          <Text style={[styles.summaryValue, { color: color.primary }]}>
            {formatInr(totalMonthly)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>ARCHIVED</Text>
          <Text style={[styles.summaryValue, { color: color.textFaint }]}>
            {archived.length}
          </Text>
        </View>
      </View>

      <FlatList
        data={sections}
        keyExtractor={(item, idx) =>
          item.kind === 'header' ? `h-${item.label}` : `s-${item.data.id}-${idx}`
        }
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={color.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={28} color={color.textFaint} />
              <Text variant="bodyStrong" color="text" style={{ marginTop: space.xs }}>
                No staff yet
              </Text>
              <Text variant="meta" color="textMuted" align="center" style={{ marginTop: 4 }}>
                Add managers, supervisors and back-office staff to track
                attendance and post payroll each month.
              </Text>
            </View>
          )
        }
      />

      {canWrite ? (
        <Pressable
          onPress={() => router.push('/(app)/finance/add-staff' as never)}
          style={[styles.fab, { bottom: 24 + insets.bottom }]}
          accessibilityLabel="Add staff"
        >
          <Ionicons name="person-add" size={22} color={color.onPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: screenInset,
    marginTop: space.sm,
  },
  summaryCell: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, gap: 4 },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: color.borderStrong },
  summaryLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.0,
  },
  summaryValue: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },

  list: { paddingHorizontal: screenInset, paddingBottom: 100, paddingTop: space.xs },
  sectionHeader: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  sectionLabel: { letterSpacing: 0.6 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    marginBottom: space.xs,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarArchived: {
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  appPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.primarySoft,
    borderWidth: 1,
    borderColor: color.primary,
  },

  empty: { padding: space.xl, alignItems: 'center', gap: space.xs },

  fab: {
    position: 'absolute',
    right: screenInset,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});

