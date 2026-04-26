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

import { useAuth } from '@/src/features/auth/useAuth';
import { useProject } from '@/src/features/projects/useProject';
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
import { color, radius, screenInset, space } from '@/src/theme';

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
  const { user } = useAuth();
  const { data: project } = useProject(projectId);
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
    const statusLabel = item.status?.toUpperCase?.() ?? '';
    const addedByOwner = !!project?.ownerId && item.createdBy === project.ownerId;
    const addedBySelf = !!user?.uid && item.createdBy === user.uid;
    const addedByLabel = addedByOwner ? 'Owner' : addedBySelf ? 'You' : 'Team';
    const approvalLabel = addedByOwner ? 'Auto Approved' : 'Approved';

    return (
      <Pressable
        onPress={() => router.push(`/(app)/projects/${projectId}/transaction/${item.id}` as never)}
        style={({ pressed }) => [styles.txnRow, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.txnIcon, { backgroundColor: color.surface }]}>
          <Ionicons
            name={isIn ? 'wallet-outline' : 'receipt-outline'}
            size={14}
            color={isIn ? color.success : color.textMuted}
          />
        </View>
        <View style={styles.txnBody}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>
            {item.description || item.partyName || (isIn ? 'Payment In' : 'Payment Out')}
          </Text>
          <Text variant="meta" color="textMuted" numberOfLines={1} style={styles.subCompact}>
            {item.partyName ? `${item.partyName} · ${dateStr}` : dateStr}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.metaCompact}>
            {[catLabel, pmLabel, statusLabel].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.auditRow}>
            <View style={styles.auditPill}>
              <Ionicons name="shield-checkmark-outline" size={12} color={color.success} />
              <Text variant="caption" style={styles.auditPillText}>{approvalLabel}</Text>
            </View>
            <Text variant="caption" color="textMuted">Added by {addedByLabel}</Text>
          </View>
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
      {/* Summary bar (InteriorOS expense ribbon style) */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">RECEIVED</Text>
          <Text
            variant="metaStrong"
            style={{ color: color.success }}
          >
            +{formatInr(totals.income)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">SPENT</Text>
          <Text variant="metaStrong" style={{ color: color.text }}>
            -{formatInr(totals.expense)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryCell}>
          <Text variant="caption" color="textMuted">NET</Text>
          <Text
            variant="metaStrong"
            style={{ color: totals.balance >= 0 ? color.primary : color.danger }}
          >
            {totals.balance >= 0 ? '+' : '-'}{formatInr(Math.abs(totals.balance))}
          </Text>
        </View>
      </View>

      {/* Filter chip row */}
      <View style={styles.filterRow}>
        <Text variant="caption" color="textMuted" style={styles.resultText}>
          {filtered.length} RESULT{filtered.length === 1 ? '' : 'S'}
        </Text>
        <View style={styles.flex} />
        {hasActiveFilter && (
          <Pressable onPress={clearFilters} style={styles.clearBtn}>
            <Text variant="meta" color="danger">Clear</Text>
          </Pressable>
        )}
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
            <View style={styles.filterHeaderRow}>
              <Text variant="bodyStrong" color="text">Filter Transactions</Text>
              <Pressable onPress={clearFilters}>
                <Text variant="metaStrong" color="primary">Clear Filter</Text>
              </Pressable>
            </View>
            <Text variant="caption" color="textMuted">
              {hasActiveFilter ? 'FILTERS ACTIVE' : 'NO FILTER APPLIED'}
            </Text>
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
                      style={{ color: active ? color.primary : color.textMuted }}
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
                    <Text variant="body" color="text">{opt.label}</Text>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <Ionicons name="checkmark" size={12} color={color.primary} />}
                    </View>
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
            <Text variant="bodyStrong" color="onPrimary">SHOW RESULTS</Text>
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
    backgroundColor: color.bg,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.separator,
    overflow: 'hidden',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 10,
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
    paddingTop: space.sm,
    paddingBottom: 10,
    gap: space.xs,
    backgroundColor: color.bg,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: hasAlpha(color.primary, 0.4),
    backgroundColor: color.surface,
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
    paddingHorizontal: screenInset,
    paddingTop: 2,
    paddingBottom: space.sm,
  },
  txnRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: color.bg,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    gap: 8,
  },
  txnIcon: {
    width: 30,
    height: 30,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  txnBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
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
  resultText: {
    letterSpacing: 0.8,
  },
  subCompact: {
    lineHeight: 16,
  },
  metaCompact: {
    letterSpacing: 0.6,
    marginTop: 1,
  },
  auditRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  auditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: color.success,
    borderRadius: radius.none,
    backgroundColor: color.successSoft,
  },
  auditPillText: {
    color: color.success,
    letterSpacing: 0.4,
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
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.none,
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
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalSheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: color.borderStrong,
    paddingBottom: space.xxl,
    maxHeight: '70%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.borderStrong,
    alignSelf: 'center',
  },
  filterHeader: {
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    gap: 6,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Filter body
  filterBody: {
    flexDirection: 'row',
    minHeight: 300,
  },
  filterTabs: {
    width: 132,
    backgroundColor: color.surface,
    borderRightWidth: 1,
    borderRightColor: color.borderStrong,
  },
  filterTabItem: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.separator,
    backgroundColor: color.surface,
  },
  filterTabItemActive: {
    backgroundColor: color.primarySoft,
  },
  filterOptions: {
    flex: 1,
    paddingHorizontal: 0,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.separator,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  radioActive: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  viewResultBtn: {
    marginHorizontal: screenInset,
    marginTop: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.none,
    backgroundColor: color.primary,
    alignItems: 'center',
  },
});

function hasAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return hex;
  if (hex.length === 4) {
    const r = hex[1] + hex[1];
    const g = hex[2] + hex[2];
    const b = hex[3] + hex[3];
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
