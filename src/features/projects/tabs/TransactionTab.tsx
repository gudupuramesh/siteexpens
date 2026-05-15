/**
 * Transaction tab — v2 design.
 *
 * Layout:
 *   1. Combined KPI strip — single card, three cells split by hairlines:
 *      RECEIVED · SPENT · NET (compact, single-line height)
 *   2. Pending-approval ribbon (caption note when relevant)
 *   3. Filter bar — single "Filter" button (with active dot when filters set)
 *      + result count + Clear (when filters active)
 *   4. Connected-card transaction list — mirrors the studio Ledger row style:
 *      left date pill (MONTH / DAY) · party/title + caption subline
 *      (status · category · method · description) · +/− compact amount on the
 *      right. First/last rows round the outer corners; middle rows are square
 *      and joined by a hairline that starts after the date pill column.
 *   5. Bottom action bar — Payment In + Payment Out (or Submit Expense for submit-only roles)
 *
 * Filter sheet shows all three facets (Type / Category / Method) inside one
 * grouped picker — open from the single Filter button instead of three chips.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePermissions } from '@/src/features/org/usePermissions';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { useFirestoreRefresh } from '@/src/lib/useFirestoreRefresh';
import {
  TRANSACTION_CATEGORIES,
  PAYMENT_METHODS,
  normalizeTransactionType,
  getCategoryLabel,
  getPaymentMethodLabel,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
  type PaymentMethod,
} from '@/src/features/transactions/types';
import { formatInr } from '@/src/lib/format';

import { Text } from '@/src/ui/v2/Text';
import { inrCompact, useThemeV2 } from '@/src/theme/v2';

type ActiveFilters = {
  type: TransactionType | 'all';
  category: TransactionCategory | 'all';
  paymentMethod: PaymentMethod | 'all';
};

const TYPE_OPTIONS: { key: TransactionType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'payment_in', label: 'Payment In' },
  { key: 'payment_out', label: 'Payment Out' },
];

const PM_OPTIONS: { key: PaymentMethod | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  ...PAYMENT_METHODS.map((m) => ({ key: m.key, label: m.label })),
];

const CAT_OPTIONS: { key: TransactionCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  ...TRANSACTION_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
];

function fmtTxnDate(ts: { toDate: () => Date } | null | undefined): {
  day: string;
  month: string;
} {
  if (!ts) return { day: '—', month: '' };
  const d = ts.toDate();
  return {
    day: d.toLocaleDateString('en-IN', { day: '2-digit' }),
    month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
  };
}

export function TransactionTab() {
  const t = useThemeV2();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { can } = usePermissions();
  const { refreshing, refresh, refreshKey } = useFirestoreRefresh();
  const { data, loading, totals, pendingPaymentOutTotal, pendingApprovalCount } =
    useTransactions(projectId, { refreshKey });

  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ActiveFilters>({
    type: 'all',
    category: 'all',
    paymentMethod: 'all',
  });

  const hasActiveFilter =
    filters.type !== 'all'
    || filters.category !== 'all'
    || filters.paymentMethod !== 'all';

  const filtered = useMemo(() => {
    return data.filter((tx) => {
      const txnType = normalizeTransactionType(tx.type);
      if (filters.type !== 'all' && txnType !== filters.type) return false;
      if (filters.category !== 'all' && tx.category !== filters.category) return false;
      if (filters.paymentMethod !== 'all' && tx.paymentMethod !== filters.paymentMethod) return false;
      return true;
    });
  }, [data, filters]);

  const clearFilters = useCallback(() => {
    setFilters({ type: 'all', category: 'all', paymentMethod: 'all' });
  }, []);

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const renderItem = ({ item, index }: { item: Transaction; index: number }) => {
    const txnType = normalizeTransactionType(item.type);
    const isIn = txnType === 'payment_in';
    const catLabel = item.category
      ? getCategoryLabel(item.category as TransactionCategory)
      : null;
    const pmLabel = item.paymentMethod
      ? getPaymentMethodLabel(item.paymentMethod as PaymentMethod)
      : null;
    const title =
      item.partyName || item.description || (isIn ? 'Payment In' : 'Payment Out');
    // Avoid duplicating the title in the subline if description is what's
    // already showing as the title.
    const desc =
      item.description && item.description !== title ? item.description : null;
    const subline = [catLabel, pmLabel, desc].filter(Boolean).join(' · ');
    const date = fmtTxnDate(item.date);
    const tone = isIn ? t.palette.green : t.palette.red;

    const isPendingFlow = item.workflowStatus === 'pending_approval';
    const isRejectedFlow = item.workflowStatus === 'rejected';
    // Workflow status surfaces as a coloured prefix in the subline so the
    // row stays at two lines (matching the studio Ledger). Approved /
    // auto-posted transactions show no status word — the orange ribbon at
    // the top of the screen already announces pending counts.
    const statusWord = isPendingFlow
      ? 'PENDING'
      : isRejectedFlow
        ? 'REJECTED'
        : null;
    const statusColor = isPendingFlow
      ? t.palette.orange.base
      : isRejectedFlow
        ? t.palette.red.base
        : null;

    const isFirst = index === 0;
    const isLast = index === filtered.length - 1;

    return (
      <Pressable
        onPress={() =>
          router.push(`/(app)/projects/${projectId}/transaction/${item.id}` as never)
        }
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? t.colors.fill3 : cardBg,
            borderTopLeftRadius: isFirst ? t.radii.card : 0,
            borderTopRightRadius: isFirst ? t.radii.card : 0,
            borderBottomLeftRadius: isLast ? t.radii.card : 0,
            borderBottomRightRadius: isLast ? t.radii.card : 0,
            borderTopWidth: isFirst ? t.hairline : 0,
            borderBottomWidth: isLast ? t.hairline : 0,
            borderLeftWidth: t.hairline,
            borderRightWidth: t.hairline,
            borderColor: cardBorder,
          },
        ]}
      >
        {/* Date pill */}
        <View
          style={[
            styles.datePill,
            { backgroundColor: t.colors.fill3, borderRadius: t.radii.tile },
          ]}
        >
          <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
            {date.month}
          </Text>
          <Text
            variant="headline"
            color="label"
            style={{ fontWeight: '700', marginTop: -1 }}
          >
            {date.day}
          </Text>
        </View>

        {/* Body */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text variant="body" color="label" numberOfLines={1}>
            {title}
          </Text>
          {statusWord || subline ? (
            <Text
              variant="caption1"
              color="secondary"
              numberOfLines={1}
              style={{ marginTop: 2 }}
            >
              {statusWord ? (
                <Text
                  variant="caption1"
                  style={{
                    color: statusColor!,
                    fontWeight: '700',
                    letterSpacing: 0.3,
                  }}
                >
                  {statusWord}
                  {subline ? ' · ' : ''}
                </Text>
              ) : null}
              {subline}
            </Text>
          ) : null}
        </View>

        {/* Amount */}
        <Text
          variant="callout"
          style={{
            color: tone.base,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
            marginLeft: 8,
          }}
        >
          {isIn ? '+' : '−'}
          {inrCompact(Math.abs(item.amount))}
        </Text>

        {/* Hairline divider — sits at the inner edge of the date pill so
            the date column reads as its own visual rail (matches Ledger). */}
        {!isLast ? (
          <View
            style={[
              styles.rowDivider,
              { backgroundColor: t.colors.separator, left: 76 },
            ]}
          />
        ) : null}
      </Pressable>
    );
  };

  const canPostFull = can('transaction.write');
  const canSubmit = can('transaction.submit');
  const showBottomBar = canPostFull || canSubmit;

  return (
    <View style={styles.container}>
      {/* Combined KPI strip — single card with 3 cells */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View
          style={[
            styles.kpiCard,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.card,
              borderColor: cardBorder,
              borderWidth: t.hairline,
            },
          ]}
        >
          <KpiCell
            label="RECEIVED"
            value={`+${formatInr(totals.income)}`}
            tone={t.palette.green.base}
          />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCell
            label="SPENT"
            value={`−${formatInr(totals.expense)}`}
            tone={t.palette.red.base}
          />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCell
            label="NET"
            value={`${totals.balance >= 0 ? '+' : '−'}${formatInr(Math.abs(totals.balance))}`}
            // Net swings green when healthy, red when overdrawn — the headline
            // signal of the strip, so it earns the most direct colour.
            tone={totals.balance < 0 ? t.palette.red.base : t.palette.green.base}
          />
        </View>
      </View>

      {pendingApprovalCount > 0 ? (
        <View style={styles.pendingRibbonWrap}>
          <View
            style={[
              styles.pendingRibbon,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                borderRadius: t.radii.card,
                borderColor: t.palette.orange.base + '33',
                borderWidth: t.hairline,
              },
            ]}
          >
            <Ionicons name="time-outline" size={12} color={t.palette.orange.base} />
            <Text
              variant="caption2"
              style={{
                color: t.palette.orange.base,
                marginLeft: 6,
                flex: 1,
                fontWeight: '700',
                letterSpacing: 0.3,
              }}
            >
              {pendingApprovalCount} PENDING APPROVAL
              {pendingPaymentOutTotal > 0
                ? ` · ${formatInr(pendingPaymentOutTotal)} NOT IN TOTALS`
                : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Filter row — single button + result count + clear */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setFilterOpen(true)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.filterBtn,
            {
              backgroundColor: hasActiveFilter
                ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                : t.colors.fill3,
              borderRadius: 999,
              borderColor: hasActiveFilter ? t.palette.blue.base + '33' : 'transparent',
              borderWidth: hasActiveFilter ? 1 : 0,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons
            name="options-outline"
            size={13}
            color={hasActiveFilter ? t.palette.blue.base : t.colors.label}
          />
          <Text
            variant="caption2"
            style={{
              color: hasActiveFilter ? t.palette.blue.base : t.colors.label,
              fontWeight: '700',
              marginLeft: 5,
              letterSpacing: 0.3,
            }}
          >
            FILTER
          </Text>
          {hasActiveFilter ? (
            <View
              style={[
                styles.filterDot,
                { backgroundColor: t.palette.blue.base },
              ]}
            />
          ) : null}
        </Pressable>
        <Text
          variant="caption2"
          color="tertiary"
          style={{ letterSpacing: 0.4, marginLeft: 10, fontSize: 9 }}
        >
          {filtered.length} RESULT{filtered.length === 1 ? '' : 'S'}
        </Text>
        <View style={{ flex: 1 }} />
        {hasActiveFilter ? (
          <Pressable onPress={clearFilters} hitSlop={6}>
            <Text
              variant="caption2"
              style={{
                color: t.palette.red.base,
                fontWeight: '700',
                letterSpacing: 0.4,
                fontSize: 9,
              }}
            >
              CLEAR
            </Text>
          </Pressable>
        ) : null}
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="footnote" color="secondary">Loading transactions…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={28} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 10, fontWeight: '600' }}>
            {hasActiveFilter ? 'No matching transactions' : 'No transactions yet'}
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
          >
            {hasActiveFilter
              ? 'Try changing your filters.'
              : 'Track all payments, expenses and invoices for this project.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: showBottomBar ? 90 : 16 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={t.palette.blue.base}
            />
          }
        />
      )}

      {/* Bottom action bar */}
      {showBottomBar ? (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: t.colors.surface,
              borderTopColor: t.colors.separator,
              borderTopWidth: t.hairline,
            },
          ]}
        >
          {/* Direction-coded action buttons — IN reads green (money coming
              in is a positive event), OUT reads red (money going out).
              The soft pastel fill keeps the buttons calm; the arrow + label
              + accent colour all reinforce the same direction signal. */}
          {canPostFull ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/(app)/projects/${projectId}/add-transaction?type=payment_in` as never);
              }}
              style={({ pressed }) => [
                styles.bottomBtn,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="arrow-down-circle" size={18} color={t.palette.green.base} />
              <Text
                variant="footnote"
                style={{
                  color: t.palette.green.base,
                  fontWeight: '600',
                  marginLeft: 6,
                }}
              >
                Payment In
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/(app)/projects/${projectId}/add-transaction?type=payment_out` as never);
            }}
            style={({ pressed }) => [
              styles.bottomBtn,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                borderRadius: t.radii.field,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="arrow-up-circle" size={18} color={t.palette.red.base} />
            <Text
              variant="footnote"
              style={{
                color: t.palette.red.base,
                fontWeight: '600',
                marginLeft: 6,
              }}
            >
              {canPostFull ? 'Payment Out' : 'Submit Expense'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Single combined filter sheet */}
      <FilterSheet
        open={filterOpen}
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        onClose={() => setFilterOpen(false)}
      />
    </View>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <View style={styles.kpiCell}>
      <Text
        variant="caption2"
        color="tertiary"
        style={{ letterSpacing: 0.4, fontSize: 9 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        variant="footnote"
        style={{
          color: tone,
          fontWeight: '700',
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

function FilterSheet({
  open,
  filters,
  onChange,
  onClear,
  onClose,
}: {
  open: boolean;
  filters: ActiveFilters;
  onChange: (next: ActiveFilters) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '85%',
            },
          ]}
        >
          {/* Grabber */}
          <View
            style={[styles.grabber, { backgroundColor: t.colors.tertiary }]}
          />

          {/* Header — Cancel · Title · Done */}
          <View
            style={[
              styles.sheetHeader,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={onClose} hitSlop={8} style={styles.sheetSideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[styles.sheetTitle, { fontWeight: '600' }]}
              numberOfLines={1}
            >
              Filter
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.sheetSideBtn, { alignItems: 'flex-end' }]}>
              <Text variant="body" style={{ color: t.palette.blue.base, fontWeight: '700' }}>
                Done
              </Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            <FilterSection
              title="Type"
              options={TYPE_OPTIONS}
              selected={filters.type}
              onPick={(k) => onChange({ ...filters, type: k as TransactionType | 'all' })}
            />
            <FilterSection
              title="Category"
              options={CAT_OPTIONS}
              selected={filters.category}
              onPick={(k) => onChange({ ...filters, category: k as TransactionCategory | 'all' })}
            />
            <FilterSection
              title="Method"
              options={PM_OPTIONS}
              selected={filters.paymentMethod}
              onPick={(k) => onChange({ ...filters, paymentMethod: k as PaymentMethod | 'all' })}
            />

            {/* Footer — Clear all */}
            <Pressable
              onPress={() => {
                onClear();
              }}
              style={({ pressed }) => [
                styles.clearAllBtn,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                  borderRadius: t.radii.field,
                  borderColor: t.palette.red.base + '33',
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons
                name="close-circle-outline"
                size={14}
                color={t.palette.red.base}
              />
              <Text
                variant="footnote"
                style={{
                  color: t.palette.red.base,
                  fontWeight: '700',
                  marginLeft: 6,
                }}
              >
                Clear all filters
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FilterSection<K extends string>({
  title,
  options,
  selected,
  onPick,
}: {
  title: string;
  options: { key: K; label: string }[];
  selected: K;
  onPick: (k: K) => void;
}) {
  const t = useThemeV2();
  return (
    <View style={styles.filterSection}>
      <Text
        variant="caption2"
        color="secondary"
        style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
      >
        {title.toUpperCase()}
      </Text>
      <View style={styles.filterChips}>
        {options.map((opt) => {
          const active = opt.key === selected;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onPick(opt.key)}
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
                variant="caption1"
                style={{
                  color: active ? t.palette.blue.base : t.colors.secondary,
                  fontWeight: active ? '700' : '600',
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Combined KPI strip
  kpiCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  kpiCell: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  kpiDivider: {
    width: 0.5,
    marginVertical: 6,
  },

  pendingRibbonWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  pendingRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    position: 'relative',
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },

  // List rows — connected card geometry to mirror the studio Ledger.
  // No padding here; the row carries its own horizontal margin so the
  // first/last rows can round their outer corners while middle rows
  // sit flush against each other.
  listContent: {
    paddingTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    position: 'relative',
  },
  datePill: {
    width: 48,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  // Bottom action bar
  bottomBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },

  // Filter sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingTop: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetSideBtn: {
    minWidth: 70,
  },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
  },

  filterSection: {
    paddingTop: 16,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
  },
  filterChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
  },

  clearAllBtn: {
    marginTop: 22,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
});
