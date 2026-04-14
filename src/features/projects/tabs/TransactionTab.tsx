import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTransactions } from '@/src/features/transactions/useTransactions';
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
import { formatInr, formatDate } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { Separator } from '@/src/ui/Separator';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

// ── Filter types ──

type FilterTab = 'type' | 'category' | 'payment_method';

type ActiveFilters = {
  type: TransactionType | 'all';
  category: TransactionCategory | 'all';
  paymentMethod: PaymentMethod | 'all';
};

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'type', label: 'Transaction\nType' },
  { key: 'category', label: 'Category' },
  { key: 'payment_method', label: 'Mode of\nPayment' },
];

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

// ── Component ──

export function TransactionTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data, loading, totals } = useTransactions(projectId);

  const [showFilter, setShowFilter] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('type');
  const [filters, setFilters] = useState<ActiveFilters>({
    type: 'all',
    category: 'all',
    paymentMethod: 'all',
  });

  const hasActiveFilter =
    filters.type !== 'all' ||
    filters.category !== 'all' ||
    filters.paymentMethod !== 'all';

  // Apply filters
  const filtered = useMemo(() => {
    return data.filter((t) => {
      const txnType = normalizeTransactionType(t.type);
      if (filters.type !== 'all' && txnType !== filters.type) return false;
      if (filters.category !== 'all' && t.category !== filters.category) return false;
      if (filters.paymentMethod !== 'all' && t.paymentMethod !== filters.paymentMethod) return false;
      return true;
    });
  }, [data, filters]);

  const clearFilters = useCallback(() => {
    setFilters({ type: 'all', category: 'all', paymentMethod: 'all' });
  }, []);

  // Filter options based on selected tab
  const filterOptions = useMemo(() => {
    switch (filterTab) {
      case 'type': return TYPE_OPTIONS;
      case 'category': return CAT_OPTIONS;
      case 'payment_method': return PM_OPTIONS;
    }
  }, [filterTab]);

  const getFilterValue = (): string => {
    switch (filterTab) {
      case 'type': return filters.type;
      case 'category': return filters.category;
      case 'payment_method': return filters.paymentMethod;
    }
  };

  const setFilterValue = (val: string) => {
    switch (filterTab) {
      case 'type':
        setFilters((f) => ({ ...f, type: val as TransactionType | 'all' }));
        break;
      case 'category':
        setFilters((f) => ({ ...f, category: val as TransactionCategory | 'all' }));
        break;
      case 'payment_method':
        setFilters((f) => ({ ...f, paymentMethod: val as PaymentMethod | 'all' }));
        break;
    }
  };

  const renderItem = ({ item }: { item: Transaction }) => {
    const txnType = normalizeTransactionType(item.type);
    const isIn = txnType === 'payment_in';
    const dateStr = item.date ? formatDate(item.date.toDate()) : '—';
    const catLabel = item.category ? getCategoryLabel(item.category) : null;
    const pmLabel = item.paymentMethod ? getPaymentMethodLabel(item.paymentMethod) : null;

    return (
      <Pressable
        onPress={() => router.push(`/(app)/projects/${projectId}/edit-transaction?txnId=${item.id}` as never)}
        style={({ pressed }) => [styles.txnRow, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.txnIcon, { backgroundColor: isIn ? color.successSoft : color.dangerSoft }]}>
          <Ionicons
            name={isIn ? 'arrow-down' : 'arrow-up'}
            size={16}
            color={isIn ? color.success : color.danger}
          />
        </View>
        <View style={styles.txnBody}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>
            {item.description || item.partyName || (isIn ? 'Payment In' : 'Payment Out')}
          </Text>
          <Text variant="meta" color="textMuted" numberOfLines={1}>
            {item.partyName ? `${item.partyName} · ${dateStr}` : dateStr}
          </Text>
          {(catLabel || pmLabel) && (
            <View style={styles.tagRow}>
              {catLabel && (
                <View style={styles.tag}>
                  <Text variant="caption" color="textMuted">{catLabel}</Text>
                </View>
              )}
              {pmLabel && (
                <View style={styles.tag}>
                  <Text variant="caption" color="textMuted">{pmLabel}</Text>
                </View>
              )}
            </View>
          )}
        </View>
        <View style={styles.txnTrailing}>
          <Text
            variant="metaStrong"
            style={{ color: isIn ? color.success : color.danger }}
          >
            {isIn ? '+' : '-'}{formatInr(item.amount)}
          </Text>
          <Text variant="caption" color="textMuted" style={styles.statusText}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Summary bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">BALANCE</Text>
          <Text
            variant="metaStrong"
            style={{ color: totals.balance >= 0 ? color.success : color.danger }}
          >
            {totals.balance >= 0 ? '+' : ''}{formatInr(totals.balance)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">TOTAL IN</Text>
          <Text variant="metaStrong" style={{ color: color.success }}>
            {formatInr(totals.income)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">TOTAL OUT</Text>
          <Text variant="metaStrong" style={{ color: color.danger }}>
            {formatInr(totals.expense)}
          </Text>
        </View>
      </View>

      {/* Filter chip row */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setShowFilter(true)}
          style={[styles.filterBtn, hasActiveFilter && styles.filterBtnActive]}
        >
          <Ionicons
            name="filter"
            size={16}
            color={hasActiveFilter ? color.onPrimary : color.primary}
          />
          <Text
            variant="metaStrong"
            style={{ color: hasActiveFilter ? color.onPrimary : color.primary }}
          >
            Filter
          </Text>
        </Pressable>
        {hasActiveFilter && (
          <Pressable onPress={clearFilters} style={styles.clearBtn}>
            <Text variant="meta" color="danger">Clear</Text>
          </Pressable>
        )}
        <View style={styles.flex} />
        <Text variant="meta" color="textMuted">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </Text>
      </View>

      {loading && data.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading transactions…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
            {hasActiveFilter ? 'No matching transactions' : 'No transactions yet'}
          </Text>
          <Text variant="meta" color="textMuted" align="center">
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
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Bottom action buttons */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/(app)/projects/${projectId}/add-transaction?type=payment_in` as never);
          }}
          style={({ pressed }) => [styles.bottomBtn, styles.bottomBtnIn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="arrow-down-circle" size={20} color={color.success} />
          <Text variant="metaStrong" style={{ color: color.success }}>Payment In</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/(app)/projects/${projectId}/add-transaction?type=payment_out` as never);
          }}
          style={({ pressed }) => [styles.bottomBtn, styles.bottomBtnOut, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="arrow-up-circle" size={20} color={color.danger} />
          <Text variant="metaStrong" style={{ color: color.danger }}>Payment Out</Text>
        </Pressable>
      </View>

      {/* ── Filter Modal ── */}
      <Modal
        visible={showFilter}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilter(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilter(false)}>
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
          {/* Clear Filter */}
          <View style={styles.filterHeader}>
            <View style={styles.modalHandle} />
            <Pressable onPress={clearFilters}>
              <Text variant="metaStrong" color="primary">Clear Filter</Text>
            </Pressable>
          </View>

          <View style={styles.filterBody}>
            {/* Left tabs */}
            <View style={styles.filterTabs}>
              {FILTER_TABS.map((ft) => {
                const active = filterTab === ft.key;
                return (
                  <Pressable
                    key={ft.key}
                    onPress={() => setFilterTab(ft.key)}
                    style={[styles.filterTabItem, active && styles.filterTabItemActive]}
                  >
                    <Text
                      variant="metaStrong"
                      color={active ? 'onPrimary' : 'textMuted'}
                      align="center"
                    >
                      {ft.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Right options */}
            <ScrollView style={styles.filterOptions} showsVerticalScrollIndicator={false}>
              {filterOptions.map((opt) => {
                const active = getFilterValue() === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setFilterValue(opt.key)}
                    style={styles.filterOption}
                  >
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                    <Text variant="body" color="text">{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* View Result button */}
          <Pressable
            onPress={() => setShowFilter(false)}
            style={styles.viewResultBtn}
          >
            <Text variant="bodyStrong" color="onPrimary">VIEW RESULT</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },

  summaryBar: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    paddingVertical: space.sm,
    paddingHorizontal: screenInset,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.xs,
    gap: space.xs,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.primary,
  },
  filterBtnActive: {
    backgroundColor: color.primary,
  },
  clearBtn: {
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
  },

  // List
  listContent: {
    paddingBottom: space.sm,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  txnIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  txnBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  txnTrailing: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusText: {
    textTransform: 'capitalize',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  tag: {
    paddingHorizontal: space.xs,
    paddingVertical: 1,
    borderRadius: radius.xs,
    backgroundColor: color.bgGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },
  emptyTitle: { marginTop: space.xxs },

  // Bottom action bar
  bottomBar: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  bottomBtnIn: {
    backgroundColor: color.successSoft,
    borderColor: color.success,
  },
  bottomBtnOut: {
    backgroundColor: color.dangerSoft,
    borderColor: color.danger,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.xxl,
    maxHeight: '65%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
  },
  filterHeader: {
    alignItems: 'flex-end',
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    gap: space.xs,
  },

  // Filter body
  filterBody: {
    flexDirection: 'row',
    minHeight: 300,
  },
  filterTabs: {
    width: 120,
    backgroundColor: color.bgGrouped,
  },
  filterTabItem: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  filterTabItemActive: {
    backgroundColor: color.primary,
  },
  filterOptions: {
    flex: 1,
    paddingHorizontal: space.md,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: color.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: color.primary,
  },
  viewResultBtn: {
    marginHorizontal: screenInset,
    marginTop: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: color.primary,
    alignItems: 'center',
  },
});
