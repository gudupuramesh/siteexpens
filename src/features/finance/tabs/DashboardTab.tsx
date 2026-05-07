/**
 * Dashboard tab — period KPIs for the studio.
 *
 * Visual language matches the existing FinanceView / Overview cards:
 *  - One bordered summary card with hairline-divided cells, mono numerics
 *  - Color carried on the value text only (not background tints)
 *  - Net Profit as a single inline row, NOT a colored hero tile
 *  - Section labels in mono uppercase, faint colour
 *
 * Pulls from existing infra:
 *  - useProjectTotals → role-aware org transactions
 *  - useOrgFinances → org-wide expense/income ledger
 * No new collections, no new hooks.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgFinances } from '@/src/features/finances/useOrgFinances';
import {
  ORG_FINANCE_CATEGORIES,
  type OrgFinanceCategory,
} from '@/src/features/finances/types';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import {
  isTransactionCountedInTotals,
  normalizeTransactionType,
} from '@/src/features/transactions/types';
import { generateFinanceReport } from '@/src/features/finance/reports/financeReportPdf';
import { DashboardCharts } from '@/src/features/finance/tabs/DashboardCharts';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, screenInset, space } from '@/src/theme';

type PeriodKey = 'month' | 'lastMonth' | 'quarter' | 'year' | 'custom';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom Range' },
];

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function periodRange(
  p: PeriodKey,
  customFrom: Date | null,
  customTo: Date | null,
  now: Date = new Date(),
): {
  from: Date;
  to: Date;
  label: string;
} {
  if (p === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      label: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    };
  }
  if (p === 'lastMonth') {
    const m = now.getMonth() - 1;
    const ref = new Date(now.getFullYear(), m, 1);
    return {
      from: new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0),
      to: new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999),
      label: ref.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    };
  }
  if (p === 'quarter') {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return {
      from: new Date(now.getFullYear(), qStartMonth, 1, 0, 0, 0, 0),
      to: new Date(now.getFullYear(), qStartMonth + 3, 0, 23, 59, 59, 999),
      label: `Q${Math.floor(qStartMonth / 3) + 1} ${now.getFullYear()}`,
    };
  }
  if (p === 'year') {
    return {
      from: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
      to: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
      label: String(now.getFullYear()),
    };
  }
  // Custom — falls back to "this month" if from/to not yet set so the
  // dashboard never has to render with an undefined range.
  const from = customFrom
    ? new Date(customFrom.getFullYear(), customFrom.getMonth(), customFrom.getDate(), 0, 0, 0, 0)
    : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = customTo
    ? new Date(customTo.getFullYear(), customTo.getMonth(), customTo.getDate(), 23, 59, 59, 999)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    from,
    to,
    label:
      customFrom && customTo
        ? `${fmtShortDate(customFrom)} — ${fmtShortDate(customTo)}`
        : 'Custom range',
  };
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

function categoryLabel(c: OrgFinanceCategory): string {
  return ORG_FINANCE_CATEGORIES.find((x) => x.key === c)?.label ?? c;
}

export function DashboardTab() {
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [customTo, setCustomTo] = useState<Date | null>(null);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [datePickerFor, setDatePickerFor] = useState<'from' | 'to' | null>(null);
  const [generating, setGenerating] = useState(false);

  const { transactions } = useProjectTotals(orgId);
  const { data: orgFinances } = useOrgFinances(orgId);

  const range = useMemo(
    () => periodRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const currentPeriodLabel = useMemo(() => {
    if (period === 'custom') {
      return customFrom && customTo
        ? `${fmtShortDate(customFrom)} — ${fmtShortDate(customTo)}`
        : 'Custom range';
    }
    return PERIODS.find((p) => p.key === period)?.label ?? 'This Month';
  }, [period, customFrom, customTo]);

  const totals = useMemo(() => {
    let income = 0;
    let projectExpense = 0;
    for (const t of transactions) {
      if (!isTransactionCountedInTotals(t)) continue;
      const d = t.date?.toDate?.() ?? t.createdAt?.toDate?.();
      if (!d || d < range.from || d > range.to) continue;
      const kind = normalizeTransactionType(t.type);
      if (kind === 'payment_in') income += t.amount;
      else projectExpense += t.amount;
    }

    let officeExpense = 0;
    let salariesPaid = 0;
    let officeIncome = 0;
    const byCategory = new Map<OrgFinanceCategory, number>();
    for (const f of orgFinances) {
      const d = f.paidAt?.toDate?.() ?? f.createdAt?.toDate?.();
      if (!d || d < range.from || d > range.to) continue;
      if (f.kind === 'income') {
        officeIncome += f.amount;
        continue;
      }
      officeExpense += f.amount;
      if (f.category === 'salary') salariesPaid += f.amount;
      byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + f.amount);
    }

    const profit = income + officeIncome - projectExpense - officeExpense;
    const breakdown = Array.from(byCategory.entries())
      .map(([cat, amount]) => ({
        cat,
        amount,
        pct: officeExpense > 0 ? (amount / officeExpense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      income,
      projectExpense,
      officeExpense,
      salariesPaid,
      officeIncome,
      profit,
      breakdown,
    };
  }, [transactions, orgFinances, range]);

  const handleGenerate = useCallback(async () => {
    if (!orgId) return;
    setGenerating(true);
    try {
      await generateFinanceReport({
        orgId,
        periodLabel: range.label,
        dateFrom: range.from,
        dateTo: range.to,
        totals: {
          income: totals.income,
          projectExpense: totals.projectExpense,
          officeExpense: totals.officeExpense,
          salariesPaid: totals.salariesPaid,
          officeIncome: totals.officeIncome,
          profit: totals.profit,
        },
        breakdown: totals.breakdown,
      });
    } catch (e) {
      Alert.alert('Could not generate PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [orgId, range, totals]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Top row — period dropdown (left) + Export PDF (right). The
          dropdown opens a modal sheet listing all preset periods plus
          a "Custom Range" entry that switches to two date pickers. */}
      <View style={styles.topRow}>
        <Pressable
          onPress={() => setPeriodPickerOpen(true)}
          style={({ pressed }) => [
            styles.periodDropdown,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel="Change period"
        >
          <Ionicons name="calendar-outline" size={14} color={color.text} />
          <Text variant="metaStrong" color="text" numberOfLines={1} style={{ flex: 1 }}>
            {currentPeriodLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={color.textMuted} />
        </Pressable>
        <Pressable
          onPress={handleGenerate}
          disabled={generating}
          hitSlop={8}
          style={({ pressed }) => [
            styles.exportBtn,
            pressed && { opacity: 0.7 },
            generating && { opacity: 0.6 },
          ]}
          accessibilityLabel="Export Finance Report PDF"
        >
          {generating ? (
            <ActivityIndicator size="small" color={color.primary} />
          ) : (
            <Ionicons name="document-text-outline" size={14} color={color.primary} />
          )}
          <Text variant="metaStrong" color="primary">
            {generating ? '…' : 'Export PDF'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.periodLabel}>{range.label.toUpperCase()}</Text>

      {/* Income/Expense summary card — single bordered card, hairline dividers */}
      <View style={styles.summaryCard}>
        <SummaryCell
          label="INCOME"
          value={inrCompact(totals.income + totals.officeIncome)}
          tone={color.success}
        />
        <View style={styles.summaryDivider} />
        <SummaryCell
          label="PROJECT OUT"
          value={inrCompact(totals.projectExpense)}
          tone={color.danger}
        />
        <View style={styles.summaryDivider} />
        <SummaryCell
          label="OFFICE OUT"
          value={inrCompact(totals.officeExpense)}
          tone={color.danger}
        />
        <View style={styles.summaryDivider} />
        <SummaryCell
          label="SALARIES"
          value={inrCompact(totals.salariesPaid)}
          tone={color.text}
        />
      </View>

      {/* Net profit — single inline row, no colored background */}
      <View style={styles.profitRow}>
        <Text style={styles.profitLabel}>NET PROFIT</Text>
        <Text
          style={[
            styles.profitValue,
            { color: totals.profit >= 0 ? color.success : color.danger },
          ]}
          numberOfLines={1}
        >
          {totals.profit < 0 ? '−' : ''}
          {inrCompact(Math.abs(totals.profit))}
        </Text>
      </View>
      <Text style={styles.profitFootnote}>
        Income − Project expenses − Office expenses
      </Text>

      {/* Charts — 6-month trend + category share */}
      <View style={{ marginTop: space.lg }}>
        <DashboardCharts
          breakdown={totals.breakdown}
          transactions={transactions}
          orgFinances={orgFinances}
        />
      </View>

      {/* Office expense breakdown */}
      <Text style={styles.sectionLabel}>OFFICE EXPENSE BY CATEGORY</Text>
      {totals.breakdown.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">
            No office expenses in this period.
          </Text>
        </View>
      ) : (
        <View style={styles.breakdownCard}>
          {totals.breakdown.map((row, i) => (
            <View
              key={row.cat}
              style={[styles.breakdownRow, i > 0 && styles.breakdownDivider]}
            >
              <Text variant="body" color="text" style={styles.breakdownName} numberOfLines={1}>
                {categoryLabel(row.cat)}
              </Text>
              <Text style={styles.breakdownPct}>{row.pct.toFixed(0)}%</Text>
              <Text style={styles.breakdownAmount}>{inrCompact(row.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Income detail (if any office income) */}
      {totals.officeIncome > 0 ? (
        <>
          <Text style={styles.sectionLabel}>OFFICE INCOME</Text>
          <View style={styles.breakdownCard}>
            <View style={styles.breakdownRow}>
              <Text variant="body" color="text" style={styles.breakdownName}>
                Logged office income
              </Text>
              <Text style={[styles.breakdownAmount, { color: color.success }]}>
                +{inrCompact(totals.officeIncome)}
              </Text>
            </View>
          </View>
        </>
      ) : null}

      <View style={{ height: space.xl }} />

      {/* Period picker modal */}
      <Modal
        visible={periodPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPeriodPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPeriodPickerOpen(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text variant="bodyStrong" color="text">Period</Text>
              <Pressable onPress={() => setPeriodPickerOpen(false)} hitSlop={12}>
                <Text variant="metaStrong" color="primary">Done</Text>
              </Pressable>
            </View>
            {PERIODS.map((p) => {
              const on = p.key === period;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => {
                    setPeriod(p.key);
                    if (p.key !== 'custom') setPeriodPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.periodOption,
                    pressed && { backgroundColor: color.bgGrouped },
                  ]}
                >
                  <Text variant="body" color="text" style={{ flex: 1 }}>
                    {p.label}
                  </Text>
                  {on ? (
                    <Ionicons name="checkmark" size={18} color={color.primary} />
                  ) : null}
                </Pressable>
              );
            })}

            {period === 'custom' ? (
              <View style={styles.customRangeWrap}>
                <Text variant="caption" color="textMuted" style={styles.customRangeLabel}>
                  CUSTOM DATE RANGE
                </Text>
                <View style={styles.customRangeRow}>
                  <Pressable
                    onPress={() => setDatePickerFor('from')}
                    style={[styles.dateInput, { flex: 1 }]}
                  >
                    <Ionicons name="calendar-outline" size={14} color={color.primary} />
                    <Text variant="meta" color={customFrom ? 'text' : 'textMuted'}>
                      {customFrom ? fmtShortDate(customFrom) : 'From'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setDatePickerFor('to')}
                    style={[styles.dateInput, { flex: 1 }]}
                  >
                    <Ionicons name="calendar-outline" size={14} color={color.primary} />
                    <Text variant="meta" color={customTo ? 'text' : 'textMuted'}>
                      {customTo ? fmtShortDate(customTo) : 'To'}
                    </Text>
                  </Pressable>
                </View>
                {customFrom && customTo && customFrom > customTo ? (
                  <Text variant="caption" color="danger" style={{ marginTop: 4 }}>
                    From date must be before To date.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Date picker — Android dialog auto-closes; iOS gets an inline
          calendar inside its own modal sheet for explicit dismissal. */}
      {datePickerFor && Platform.OS === 'android' ? (
        <DateTimePicker
          value={(datePickerFor === 'from' ? customFrom : customTo) ?? new Date()}
          mode="date"
          display="default"
          onChange={(_, d) => {
            const which = datePickerFor;
            setDatePickerFor(null);
            if (d) {
              if (which === 'from') setCustomFrom(d);
              else setCustomTo(d);
            }
          }}
        />
      ) : null}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={datePickerFor !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setDatePickerFor(null)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setDatePickerFor(null)}
            />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text variant="bodyStrong" color="text">
                  {datePickerFor === 'from' ? 'From date' : 'To date'}
                </Text>
                <Pressable onPress={() => setDatePickerFor(null)} hitSlop={12}>
                  <Text variant="metaStrong" color="primary">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={(datePickerFor === 'from' ? customFrom : customTo) ?? new Date()}
                mode="date"
                display="inline"
                onChange={(_, d) => {
                  if (!d) return;
                  if (datePickerFor === 'from') setCustomFrom(d);
                  else setCustomTo(d);
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </ScrollView>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={tone ? [styles.summaryValue, { color: tone }] : styles.summaryValue}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: screenInset, paddingTop: space.sm, paddingBottom: 40 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  periodDropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  periodLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    marginBottom: space.sm,
  },

  // Period picker modal
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 6,
    paddingBottom: 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  periodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  customRangeWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  customRangeLabel: {
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  customRangeRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },

  // Summary card — same pattern as FinanceView's summaryCard
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    overflow: 'hidden',
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

  // Net profit — single inline row, no colored card
  profitRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: space.sm,
  },
  profitLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: color.textMuted,
    letterSpacing: 1.2,
  },
  profitValue: {
    fontFamily: fontFamily.mono,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  profitFootnote: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textFaint,
    marginTop: 6,
    paddingHorizontal: 4,
  },

  // Section labels
  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    marginTop: space.lg,
    marginBottom: 6,
  },

  // Breakdown card — list of rows, no progress bars
  breakdownCard: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    overflow: 'hidden',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  breakdownDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
  },
  breakdownName: { flex: 1, minWidth: 0 },
  breakdownPct: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '600',
    color: color.textFaint,
    fontVariant: ['tabular-nums'],
    width: 36,
    textAlign: 'right',
  },
  breakdownAmount: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '700',
    color: color.danger,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },

  empty: {
    paddingVertical: space.lg,
    alignItems: 'center',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
  },
});
