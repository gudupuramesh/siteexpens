/**
 * Payroll tab — monthly payroll preview + one-tap "Post Payroll".
 *
 * Reuses the existing engine end-to-end:
 *  - useStaff → active staff roster
 *  - useStaffAttendance(month) → per-staff days for the chosen month
 *  - buildPayrollPreview() → pure synchronous calculation
 *  - postMonthlyPayroll() → atomic batch (creates orgFinances entries +
 *    stamps each staff's `lastPayrollMonth` so re-tap is a no-op)
 *
 * Visual language matches FinanceView: month bar, hairline summary card,
 * mono numerics, color on text only.
 */
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { buildPayrollPreview, postMonthlyPayroll } from '@/src/features/staff/staff';
import { type PayrollPreviewRow } from '@/src/features/staff/staff';
import { monthKey } from '@/src/features/staff/types';
import { useStaff } from '@/src/features/staff/useStaff';
import { useStaffAttendance } from '@/src/features/staff/useStaffAttendance';
import { generatePaySlip } from '@/src/features/finance/reports/paySlipPdf';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, screenInset, space } from '@/src/theme';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function inrCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) {
    const v = n / 1_00_000;
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    return `₹${s.endsWith('.0') ? s.slice(0, -2) : s}L`;
  }
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function PayrollTab() {
  const insets = useSafeAreaInsets();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { can } = usePermissions();
  const canWrite = can('finance.write');

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [posting, setPosting] = useState(false);
  const [slipBusyFor, setSlipBusyFor] = useState<string | null>(null);

  const { data: staff, loading: staffLoading } = useStaff(orgId);
  const { byStaff, loading: attLoading } = useStaffAttendance(orgId, month);

  const activeStaff = useMemo(() => staff.filter((s) => !s.archivedAt), [staff]);
  const rows = useMemo(
    () => buildPayrollPreview(activeStaff, byStaff),
    [activeStaff, byStaff],
  );

  const mk = monthKey(month);
  const postedRows = rows.filter((r) => r.staff.lastPayrollMonth === mk);
  const unpostedRows = rows.filter((r) => r.staff.lastPayrollMonth !== mk);
  const totalPayable = unpostedRows.reduce((acc, r) => acc + r.amount, 0);
  const totalPosted = postedRows.reduce((acc, r) => acc + r.amount, 0);

  const today = startOfMonth(new Date());
  const isCurrentMonth = month.getTime() === today.getTime();

  const goPrevMonth = () =>
    setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const goNextMonth = () =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const goCurrentMonth = () => setMonth(today);

  const onGenerateSlip = useCallback(
    async (row: PayrollPreviewRow) => {
      if (!orgId || slipBusyFor) return;
      setSlipBusyFor(row.staff.id);
      try {
        await generatePaySlip({
          orgId,
          staff: row.staff,
          monthKey: mk,
          monthLabel: fmtMonth(month),
          presentDays: row.presentDays,
          halfDays: row.halfDays,
          absentDays: row.absentDays,
          netAmount: row.amount,
          posted: row.staff.lastPayrollMonth === mk,
        });
      } catch (e) {
        Alert.alert('Could not generate pay slip', e instanceof Error ? e.message : String(e));
      } finally {
        setSlipBusyFor(null);
      }
    },
    [orgId, mk, month, slipBusyFor],
  );

  const onPost = () => {
    if (!orgId || posting || unpostedRows.length === 0) return;
    Alert.alert(
      `Post payroll for ${fmtMonth(month)}?`,
      `${unpostedRows.length} salary entries · total ${inrCompact(totalPayable)}.\n\nAdds entries to Finance and marks the month as paid for these staff. You can edit individual entries afterwards.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Post payroll',
          style: 'default',
          onPress: async () => {
            setPosting(true);
            try {
              await postMonthlyPayroll({ orgId, month, rows: unpostedRows });
            } catch (e) {
              Alert.alert('Could not post payroll', (e as Error).message);
            } finally {
              setPosting(false);
            }
          },
        },
      ],
    );
  };

  const renderRow = ({ item }: { item: PayrollPreviewRow }) => {
    const posted = item.staff.lastPayrollMonth === mk;
    const slipBusy = slipBusyFor === item.staff.id;
    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/(app)/staff/[staffId]',
            params: { staffId: item.staff.id },
          })
        }
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.avatar}>
          <Text variant="metaStrong" style={{ color: color.primary }}>
            {item.staff.name.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>
            {item.staff.name}
          </Text>
          <Text variant="meta" color="textMuted" numberOfLines={1}>
            {item.staff.role || 'Staff'}
            {' · '}
            {item.presentDays}P
            {item.halfDays > 0 ? ` · ${item.halfDays}H` : ''}
            {item.absentDays > 0 ? ` · ${item.absentDays}A` : ''}
          </Text>
        </View>
        {posted ? (
          <View style={styles.postedPill}>
            <Text style={styles.postedPillText}>POSTED</Text>
          </View>
        ) : (
          <Text style={styles.amount}>{inrCompact(item.amount)}</Text>
        )}
        {/* Pay slip generator — works for both pending (provisional) and
            posted (paid) rows. Posted slips are stamped PAID; pending
            slips are stamped PROVISIONAL so the recipient knows the
            money hasn't moved yet. */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            void onGenerateSlip(item);
          }}
          hitSlop={8}
          disabled={slipBusy}
          style={({ pressed }) => [
            styles.slipBtn,
            pressed && { opacity: 0.7 },
            slipBusy && { opacity: 0.6 },
          ]}
          accessibilityLabel="Generate pay slip"
        >
          {slipBusy ? (
            <ActivityIndicator size="small" color={color.primary} />
          ) : (
            <Ionicons name="document-text-outline" size={16} color={color.primary} />
          )}
        </Pressable>
        <Ionicons name="chevron-forward" size={14} color={color.textFaint} />
      </Pressable>
    );
  };

  const isLoading = staffLoading || attLoading;

  return (
    <View style={styles.container}>
      {/* Month bar — matches FinanceView */}
      <View style={styles.monthBar}>
        <Pressable
          onPress={goPrevMonth}
          hitSlop={12}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={18} color={color.text} />
        </Pressable>
        <View style={styles.monthLabelWrap}>
          <Text variant="rowTitle" color="text">{fmtMonth(month)}</Text>
          <Text variant="meta" color="textMuted" style={{ marginTop: 1 }}>
            {activeStaff.length === 0
              ? 'No active staff'
              : `${activeStaff.length} staff · ${unpostedRows.length} pending`}
          </Text>
        </View>
        <Pressable
          onPress={goNextMonth}
          hitSlop={12}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={18} color={color.text} />
        </Pressable>
        {!isCurrentMonth ? (
          <Pressable
            onPress={goCurrentMonth}
            hitSlop={6}
            style={({ pressed }) => [styles.todayChip, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Jump to current month"
          >
            <Text style={styles.todayChipText}>NOW</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.staff.id}
        renderItem={renderRow}
        ListHeaderComponent={
          <View>
            <View style={styles.summaryCard}>
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>PENDING</Text>
                <Text style={[styles.summaryValue, { color: color.primary }]}>
                  {inrCompact(totalPayable)}
                </Text>
                <Text style={styles.summaryFootnote}>{unpostedRows.length} staff</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryCell}>
                <Text style={styles.summaryLabel}>POSTED</Text>
                <Text style={[styles.summaryValue, { color: color.success }]}>
                  {inrCompact(totalPosted)}
                </Text>
                <Text style={styles.summaryFootnote}>{postedRows.length} staff</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>STAFF · {rows.length}</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={color.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={28} color={color.textFaint} />
              <Text variant="bodyStrong" color="text" style={{ marginTop: space.xs }}>
                No active staff
              </Text>
              <Text variant="meta" color="textMuted" align="center" style={{ marginTop: 4 }}>
                Add staff in the Staff tab to start tracking payroll.
              </Text>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {canWrite && unpostedRows.length > 0 ? (
        <View
          style={[
            styles.footerBar,
            { paddingBottom: 12 + insets.bottom },
          ]}
        >
          <Pressable
            onPress={onPost}
            disabled={posting}
            style={({ pressed }) => [
              styles.postBtn,
              pressed && { opacity: 0.85 },
              posting && { opacity: 0.6 },
            ]}
          >
            {posting ? (
              <ActivityIndicator color={color.onPrimary} size="small" />
            ) : (
              <>
                <Ionicons name="send-outline" size={16} color={color.onPrimary} />
                <Text variant="bodyStrong" color="onPrimary">
                  Post payroll · {inrCompact(totalPayable)}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Month bar
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    gap: space.sm,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabelWrap: { flex: 1, alignItems: 'center' },
  todayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: color.primarySoft,
  },
  todayChipText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: 0.8,
  },

  // Summary card
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: screenInset,
    marginTop: space.md,
  },
  summaryCell: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, gap: 4 },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: color.borderStrong },
  summaryLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.2,
  },
  summaryValue: {
    fontFamily: fontFamily.mono,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  summaryFootnote: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    color: color.textFaint,
  },

  // Section label
  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    paddingHorizontal: screenInset,
    marginTop: space.lg,
    marginBottom: 6,
  },

  // List
  listContent: {
    paddingHorizontal: screenInset,
    paddingBottom: 120,
  },
  rowGap: { height: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amount: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  postedPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: color.successSoft,
    borderWidth: 1,
    borderColor: color.success,
  },
  postedPillText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '800',
    color: color.success,
    letterSpacing: 0.8,
  },
  slipBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  // Footer
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.bgGrouped,
    paddingHorizontal: screenInset,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: color.primary,
    borderRadius: 10,
    paddingVertical: 14,
  },
});
