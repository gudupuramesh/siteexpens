/**
 * Dashboard charts — two visualisations powered by `react-native-gifted-charts`:
 *
 *   1. 6-month income vs expense (grouped bars)
 *   2. Office expense by category (pie chart, top 6 + "Other" bucket)
 *
 * Inputs are pre-computed by the parent (DashboardTab) so this component
 * is a pure renderer — no Firestore reads, no hooks beyond layout.
 *
 * The 6-month series uses a FIXED window (last 6 calendar months relative
 * to today), regardless of the parent's period selector — trends are most
 * useful over a stable window, not a moving one.
 */
import { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, screenInset, space } from '@/src/theme';
import {
  ORG_FINANCE_CATEGORIES,
  type OrgFinance,
  type OrgFinanceCategory,
} from '@/src/features/finances/types';
import {
  isTransactionCountedInTotals,
  normalizeTransactionType,
  type Transaction,
} from '@/src/features/transactions/types';

// Compact rotating palette for the pie chart. Mutes deliberately so the
// chart matches the rest of the app's restrained look — no rainbow.
const PIE_COLORS = [
  color.primary,
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#0ea5e9', // sky
  '#64748b', // slate (the "Other" bucket)
];

const PIE_OTHER_INDEX = 6;

const SCREEN_WIDTH = Dimensions.get('window').width;

function inrCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) {
    const v = n / 1_00_000;
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    return `₹${s.endsWith('.0') ? s.slice(0, -2) : s}L`;
  }
  if (n >= 1_000) return `₹${Math.round(n / 1_000)}k`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function categoryLabel(c: OrgFinanceCategory): string {
  return ORG_FINANCE_CATEGORIES.find((x) => x.key === c)?.label ?? c;
}

type SixMonthBucket = {
  monthLabel: string; // "May"
  income: number;
  expense: number;
};

function build6MonthSeries(
  transactions: Transaction[],
  orgFinances: OrgFinance[],
  now: Date = new Date(),
): SixMonthBucket[] {
  // Build buckets for the last 6 months, OLDEST first so bars read
  // left-to-right naturally.
  const buckets: SixMonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      monthLabel: d.toLocaleDateString('en-IN', { month: 'short' }),
      income: 0,
      expense: 0,
    });
  }
  // Index buckets by `YYYY-M` for fast lookup.
  const startWindow = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();
  const endWindow = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  const indexFor = (d: Date): number | null => {
    const t = d.getTime();
    if (t < startWindow || t > endWindow) return null;
    // monthsAgo = (currentMonth - dMonth)  in [0..5]
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    if (monthsAgo < 0 || monthsAgo > 5) return null;
    return 5 - monthsAgo;
  };

  for (const t of transactions) {
    if (!isTransactionCountedInTotals(t)) continue;
    const d = t.date?.toDate?.() ?? t.createdAt?.toDate?.();
    if (!d) continue;
    const idx = indexFor(d);
    if (idx == null) continue;
    const kind = normalizeTransactionType(t.type);
    if (kind === 'payment_in') buckets[idx].income += t.amount;
    else buckets[idx].expense += t.amount;
  }

  for (const f of orgFinances) {
    const d = f.paidAt?.toDate?.() ?? f.createdAt?.toDate?.();
    if (!d) continue;
    const idx = indexFor(d);
    if (idx == null) continue;
    if (f.kind === 'income') buckets[idx].income += f.amount;
    else buckets[idx].expense += f.amount;
  }

  return buckets;
}

export type DashboardChartsProps = {
  /** Office-expense breakdown for the currently-selected period (matches
   *  what the parent shows in the breakdown table — single source of truth). */
  breakdown: Array<{ cat: OrgFinanceCategory; amount: number; pct: number }>;
  /** Raw transactions + org finances — used to compute the rolling
   *  6-month series. We re-compute here rather than asking the parent
   *  to pre-bucket so the trend window stays stable across period changes. */
  transactions: Transaction[];
  orgFinances: OrgFinance[];
};

export function DashboardCharts({
  breakdown,
  transactions,
  orgFinances,
}: DashboardChartsProps) {
  // ── 6-month bar chart data ────────────────────────────────────────
  const sixMonth = useMemo(
    () => build6MonthSeries(transactions, orgFinances),
    [transactions, orgFinances],
  );

  // gifted-charts grouped bars expect a flat list with a `frontColor`,
  // `spacing`, and `label` per item. Two bars per month → income (green)
  // then expense (red), with extra spacing after each pair.
  const barData = useMemo(() => {
    const out: Array<{
      value: number;
      label?: string;
      frontColor: string;
      spacing?: number;
      labelTextStyle?: { color: string; fontSize: number };
    }> = [];
    for (let i = 0; i < sixMonth.length; i++) {
      const b = sixMonth[i];
      out.push({
        value: b.income,
        label: b.monthLabel,
        frontColor: color.success,
        spacing: 2,
        labelTextStyle: { color: color.textMuted, fontSize: 10 },
      });
      out.push({
        value: b.expense,
        frontColor: color.danger,
        spacing: i === sixMonth.length - 1 ? 0 : 14,
      });
    }
    return out;
  }, [sixMonth]);

  const maxBarValue = useMemo(() => {
    let m = 0;
    for (const b of sixMonth) {
      if (b.income > m) m = b.income;
      if (b.expense > m) m = b.expense;
    }
    // Round up to the next "nice" value so the y-axis tops aren't ugly.
    if (m === 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / mag) * mag;
  }, [sixMonth]);

  const hasAnyBarData = barData.some((b) => b.value > 0);

  // ── Pie chart data ───────────────────────────────────────────────
  // Take top 5 categories, bucket the rest into "Other".
  const pieData = useMemo(() => {
    if (breakdown.length === 0) return [] as Array<{
      value: number;
      color: string;
      label: string;
    }>;
    const TOP = 5;
    const top = breakdown.slice(0, TOP);
    const rest = breakdown.slice(TOP);
    const restTotal = rest.reduce((acc, r) => acc + r.amount, 0);
    const out = top.map((r, i) => ({
      value: r.amount,
      color: PIE_COLORS[i],
      label: categoryLabel(r.cat),
    }));
    if (restTotal > 0) {
      out.push({
        value: restTotal,
        color: PIE_COLORS[PIE_OTHER_INDEX],
        label: 'Other',
      });
    }
    return out;
  }, [breakdown]);

  const pieTotal = useMemo(
    () => pieData.reduce((acc, p) => acc + p.value, 0),
    [pieData],
  );

  // Card width: full width minus screen insets, used for chart sizing.
  const cardInnerWidth = SCREEN_WIDTH - screenInset * 2 - space.md * 2;

  return (
    <View style={{ gap: space.lg }}>
      {/* ── 6-month trend ──────────────────────────────────────── */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>INCOME VS EXPENSE · LAST 6 MONTHS</Text>
        </View>
        <View style={styles.card}>
          {hasAnyBarData ? (
            <>
              <BarChart
                data={barData}
                height={160}
                barWidth={14}
                barBorderRadius={3}
                spacing={6}
                noOfSections={4}
                maxValue={maxBarValue}
                yAxisThickness={0}
                xAxisThickness={StyleSheet.hairlineWidth}
                xAxisColor={color.borderStrong}
                yAxisTextStyle={styles.axisText}
                xAxisLabelTextStyle={styles.axisText}
                rulesType="solid"
                rulesColor={color.borderStrong}
                rulesThickness={StyleSheet.hairlineWidth}
                formatYLabel={(v) => inrCompact(Number(v))}
                disableScroll
                width={cardInnerWidth - 30}
              />
              <View style={styles.legendRow}>
                <LegendDot color={color.success} label="Income" />
                <LegendDot color={color.danger} label="Expense" />
              </View>
            </>
          ) : (
            <Text variant="meta" color="textMuted" style={styles.empty}>
              No transactions in the last 6 months.
            </Text>
          )}
        </View>
      </View>

      {/* ── Pie: office expense breakdown ─────────────────────── */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>OFFICE EXPENSE SHARE</Text>
        </View>
        <View style={styles.card}>
          {pieData.length > 0 ? (
            <View style={styles.pieRow}>
              <PieChart
                data={pieData}
                radius={64}
                innerRadius={42}
                donut
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.donutCenterValue}>{inrCompact(pieTotal)}</Text>
                    <Text style={styles.donutCenterLabel}>TOTAL</Text>
                  </View>
                )}
              />
              <View style={styles.pieLegend}>
                {pieData.map((p) => (
                  <View key={p.label} style={styles.pieLegendRow}>
                    <View style={[styles.pieDot, { backgroundColor: p.color }]} />
                    <Text variant="meta" color="text" style={styles.pieLegendName} numberOfLines={1}>
                      {p.label}
                    </Text>
                    <Text style={styles.pieLegendAmount}>{inrCompact(p.value)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text variant="meta" color="textMuted" style={styles.empty}>
              No office expenses in this period.
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function LegendDot({ color: dotColor, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendCell}>
      <View style={[styles.legendDot, { backgroundColor: dotColor }]} />
      <Text variant="caption" color="textMuted">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
  },
  card: {
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    padding: space.md,
  },
  axisText: {
    color: color.textMuted,
    fontSize: 9,
    fontFamily: fontFamily.mono,
  },

  legendRow: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.sm,
    justifyContent: 'center',
  },
  legendCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },

  pieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  pieLegend: { flex: 1, gap: 6 },
  pieLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pieDot: { width: 10, height: 10, borderRadius: 2 },
  pieLegendName: { flex: 1 },
  pieLegendAmount: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },

  donutCenterValue: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '800',
    color: color.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  donutCenterLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 8,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.0,
    marginTop: 2,
  },

  empty: {
    paddingVertical: space.lg,
    textAlign: 'center',
  },
});
