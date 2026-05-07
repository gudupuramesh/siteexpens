/**
 * Expenses tab — org-level expense + income ledger (orgFinances).
 *
 * Visible structure:
 *  - Top ribbon (MTD OUT / SALARIES / NET)
 *  - Inline search bar with filter icon
 *  - List
 *  - FAB → add new entry
 *
 * Category filter has been moved into a bottom-sheet (opens from the
 * filter icon next to search) so the chip rail no longer steals
 * vertical space on the main view.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import {
  ORG_FINANCE_CATEGORIES,
  type OrgFinance,
  type OrgFinanceCategory,
} from '@/src/features/finances/types';
import { useOrgFinances } from '@/src/features/finances/useOrgFinances';
import { useOrgFinancesTotals } from '@/src/features/finances/useOrgFinancesTotals';
import { formatInr } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, screenInset, shadow, space } from '@/src/theme';

type ChipKey = 'all' | OrgFinanceCategory | 'salary_group';

const CATEGORY_FILTERS: { key: ChipKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'salary_group', label: 'Salaries' },
  { key: 'rent', label: 'Rent' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'internet', label: 'Internet' },
  { key: 'office_supplies', label: 'Office supplies' },
  { key: 'software', label: 'Software' },
  { key: 'travel', label: 'Travel' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'professional_fees', label: 'Pro Fees' },
  { key: 'other', label: 'Other' },
];

function catLabel(c: OrgFinanceCategory) {
  return ORG_FINANCE_CATEGORIES.find((x) => x.key === c)?.label ?? c;
}

export function ExpensesTab() {
  const insets = useSafeAreaInsets();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: rows, loading } = useOrgFinances(orgId, { limit: 200 });
  const { mtd } = useOrgFinancesTotals(orgId);
  const { can } = usePermissions();
  const canWrite = can('finance.write');
  const [chip, setChip] = useState<ChipKey>('all');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = useMemo(() => {
    let out = rows;
    if (chip === 'salary_group') {
      out = out.filter((r) => r.category === 'salary');
    } else if (chip !== 'all') {
      out = out.filter((r) => r.category === chip);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => {
        const cat = catLabel(r.category).toLowerCase();
        const payee = (r.payee ?? '').toLowerCase();
        const note = (r.note ?? '').toLowerCase();
        return cat.includes(q) || payee.includes(q) || note.includes(q);
      });
    }
    return out;
  }, [rows, chip, search]);

  const filterActive = chip !== 'all';
  const activeFilterLabel = useMemo(
    () => CATEGORY_FILTERS.find((c) => c.key === chip)?.label ?? 'All',
    [chip],
  );

  const renderItem = ({ item }: { item: OrgFinance }) => (
    <Pressable
      onPress={() => router.push(`/(app)/finance/${item.id}` as never)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" color="text" numberOfLines={1}>
          {catLabel(item.category)} · {item.kind === 'income' ? 'Income' : 'Expense'}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {item.payee || '—'}
          {item.paidAt
            ? ` · ${item.paidAt.toDate().toLocaleDateString('en-IN')}`
            : ''}
        </Text>
      </View>
      <Text variant="bodyStrong" color={item.kind === 'income' ? 'success' : 'danger'}>
        {item.kind === 'income' ? '+' : '−'}
        {formatInr(item.amount)}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.ribbon}>
        <View style={styles.ribbonCell}>
          <Text variant="caption" color="textMuted">MTD OUT</Text>
          <Text variant="bodyStrong" color="danger">{formatInr(mtd.expense)}</Text>
        </View>
        <View style={styles.ribbonSep} />
        <View style={styles.ribbonCell}>
          <Text variant="caption" color="textMuted">SALARIES</Text>
          <Text variant="bodyStrong" color="text">{formatInr(mtd.salaryExpense)}</Text>
        </View>
        <View style={styles.ribbonSep} />
        <View style={styles.ribbonCell}>
          <Text variant="caption" color="textMuted">NET</Text>
          <Text variant="bodyStrong" color={mtd.net >= 0 ? 'success' : 'danger'}>
            {formatInr(mtd.net)}
          </Text>
        </View>
      </View>

      {/* Search + filter row */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={16} color={color.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search payee, note, category"
            placeholderTextColor={color.textFaint}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={color.textFaint} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={({ pressed }) => [
            styles.filterBtn,
            pressed && { opacity: 0.7 },
            filterActive && styles.filterBtnActive,
          ]}
          accessibilityLabel="Open category filter"
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={filterActive ? color.primary : color.text}
          />
          {filterActive ? <View style={styles.filterDot} /> : null}
        </Pressable>
      </View>

      {/* Active filter pill (only when not "All") — gives the user a
          single-tap way to clear without re-opening the sheet. */}
      {filterActive ? (
        <View style={styles.activeFilterRow}>
          <View style={styles.activeFilterPill}>
            <Text variant="caption" color="primary">
              {activeFilterLabel}
            </Text>
            <Pressable onPress={() => setChip('all')} hitSlop={6}>
              <Ionicons name="close" size={12} color={color.primary} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="meta" color="textMuted">
              {loading
                ? 'Loading…'
                : search || filterActive
                  ? 'No entries match your search/filter.'
                  : 'No entries yet.'}
            </Text>
          </View>
        }
      />

      {canWrite ? (
        <Pressable
          onPress={() => router.push('/(app)/finance/new-expense' as never)}
          style={[styles.fab, { bottom: 24 + insets.bottom }]}
          accessibilityLabel="Add finance entry"
        >
          <Ionicons name="add" size={26} color={color.onPrimary} />
        </Pressable>
      ) : null}

      {/* Category filter modal */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setFilterOpen(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text variant="bodyStrong" color="text">Filter by category</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={12}>
                <Text variant="metaStrong" color="primary">Done</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.filterScroll}>
              {CATEGORY_FILTERS.map((c) => {
                const on = chip === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => {
                      setChip(c.key);
                      setFilterOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.filterRow,
                      pressed && { backgroundColor: color.bgGrouped },
                    ]}
                  >
                    <Text variant="body" color="text" style={{ flex: 1 }}>
                      {c.label}
                    </Text>
                    {on ? (
                      <Ionicons name="checkmark" size={18} color={color.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            {filterActive ? (
              <View style={styles.modalFooter}>
                <Pressable
                  onPress={() => {
                    setChip('all');
                    setFilterOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.clearAllBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="close-circle-outline" size={16} color={color.danger} />
                  <Text variant="metaStrong" color="danger">Clear filter</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ribbon: {
    flexDirection: 'row',
    marginHorizontal: screenInset,
    marginTop: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  ribbonCell: { flex: 1, alignItems: 'center', gap: 4 },
  ribbonSep: { width: 1, backgroundColor: color.borderStrong },

  searchRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: 4,
    alignItems: 'center',
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: color.text,
    padding: 0,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterBtnActive: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.primary,
    borderWidth: 1,
    borderColor: color.bg,
  },

  activeFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingBottom: 4,
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.primarySoft,
    borderWidth: 1,
    borderColor: color.primary,
  },

  list: { paddingHorizontal: screenInset, paddingBottom: 100, paddingTop: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    marginBottom: space.xs,
  },
  empty: { padding: space.xl, alignItems: 'center' },
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

  // Filter modal
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
    maxHeight: '80%',
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
  filterScroll: { paddingBottom: 8 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  modalFooter: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.danger,
    backgroundColor: color.dangerSoft,
  },
});
