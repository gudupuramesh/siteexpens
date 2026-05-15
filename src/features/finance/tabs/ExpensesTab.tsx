/**
 * Expenses tab — v2 design.
 *
 * Layout:
 *   1. KPI strip (MTD OUT / SALARIES / NET) — three soft surface cards
 *   2. Search bar + filter button (rounded inputs sitting on the ambient bg)
 *   3. Active-filter chip (only when not "All")
 *   4. List of expense rows (FormGroup-style surface card per row)
 *   5. FAB → /finance/new-expense
 *
 * Sits inside the Overview screen's pager — no own header / ambient bg.
 * Bottom padding accounts for the floating tab bar so the last row + FAB
 * never collide with the floating bottom navigation.
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

import { FAB } from '@/src/ui/v2/FAB';
import { IconTile } from '@/src/ui/v2/IconTile';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

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

const CAT_ICON: Record<OrgFinanceCategory, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  salary: 'cash-outline',
  rent: 'business-outline',
  utilities: 'flash-outline',
  internet: 'wifi-outline',
  office_supplies: 'cube-outline',
  software: 'desktop-outline',
  travel: 'car-outline',
  marketing: 'megaphone-outline',
  professional_fees: 'briefcase-outline',
  other: 'ellipsis-horizontal-circle-outline',
};

function catLabel(c: OrgFinanceCategory) {
  return ORG_FINANCE_CATEGORIES.find((x) => x.key === c)?.label ?? c;
}

export function ExpensesTab() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
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

  const renderItem = ({ item }: { item: OrgFinance }) => {
    const dt = item.paidAt?.toDate();
    const date = dt
      ? dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : '—';
    const isIncome = item.kind === 'income';
    const ion = CAT_ICON[item.category] ?? 'receipt-outline';
    const amt = isIncome ? `+${formatInr(item.amount)}` : `−${formatInr(item.amount)}`;
    const tone = isIncome ? t.palette.green.base : t.palette.red.base;
    const tileColor = isIncome ? t.palette.green.base : t.colors.secondary;
    return (
      <Pressable
        onPress={() => router.push(`/(app)/finance/${item.id}` as never)}
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
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <IconTile icon={ion} color={tileColor} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="callout" color="label" numberOfLines={1}>
            {catLabel(item.category)}
          </Text>
          <Text variant="caption1" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
            {item.payee ? `${item.payee} · ${date}` : date}
            {item.note ? ` · ${item.note}` : ''}
          </Text>
        </View>
        <Text
          variant="callout"
          style={{
            color: tone,
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
          }}
          numberOfLines={1}
        >
          {amt}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} style={{ marginLeft: 4 }} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* KPI strip — one combined card with hairline dividers (matches the
          Finance Overview pattern). Values neutral; only NET goes red when
          negative because that's an actual problem to act on. */}
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
          <KpiCell label="MTD OUT" value={formatInr(mtd.expense)} />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCell label="SALARIES" value={formatInr(mtd.salaryExpense)} />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCell
            label="NET"
            value={formatInr(mtd.net)}
            tone={mtd.net < 0 ? t.palette.red.base : undefined}
          />
        </View>
      </View>

      {/* Search + filter row */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchInputWrap,
            {
              backgroundColor: t.colors.surface,
              borderRadius: t.radii.field,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.05)',
              borderWidth: t.hairline,
            },
          ]}
        >
          <Ionicons name="search" size={16} color={t.colors.tertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search payee, note, category"
            placeholderTextColor={t.colors.tertiary}
            style={[
              styles.searchInput,
              { color: t.colors.label, ...t.type.callout },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={({ pressed }) => [
            styles.filterBtn,
            {
              backgroundColor: filterActive
                ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                : t.colors.surface,
              borderRadius: t.radii.field,
              borderColor: filterActive
                ? t.palette.blue.base + '33'
                : (t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
              borderWidth: t.hairline,
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Open category filter"
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={filterActive ? t.palette.blue.base : t.colors.label}
          />
        </Pressable>
      </View>

      {/* Active filter pill */}
      {filterActive ? (
        <View style={styles.activeFilterRow}>
          <View
            style={[
              styles.activeFilterPill,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
            ]}
          >
            <Text
              variant="caption2"
              style={{
                color: t.palette.blue.base,
                fontWeight: '600',
                letterSpacing: 0.6,
              }}
            >
              {activeFilterLabel.toUpperCase()}
            </Text>
            <Pressable onPress={() => setChip('all')} hitSlop={6}>
              <Ionicons name="close" size={12} color={t.palette.blue.base} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl {...refresh.props} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: t.region.tabBarBuffer + 80 },
        ]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name="receipt-outline"
              size={28}
              color={t.colors.tertiary}
            />
            <Text variant="footnote" color="secondary" style={{ marginTop: 8 }}>
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
        <FAB
          icon="add"
          onPress={() => router.push('/(app)/finance/new-expense' as never)}
          accessibilityLabel="Add finance entry"
        />
      ) : null}

      {/* Category filter sheet */}
      <SelectSheet
        open={filterOpen}
        title="Filter by category"
        options={CATEGORY_FILTERS}
        selected={chip}
        onPick={(k) => setChip(k as ChipKey)}
        onClose={() => setFilterOpen(false)}
      />
    </View>
  );
}

/**
 * Compact KPI cell — one column inside the combined hairline-divided card.
 * Label + value stacked, both neutral by default. Pass `tone` to override
 * the value colour (used only for NET when it's negative).
 */
function KpiCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  const t = useThemeV2();
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
        style={{
          color: tone ?? t.colors.label,
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

  // Search + filter row
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    alignItems: 'center',
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    margin: 0,
  },
  filterBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Active filter chip
  activeFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  // List
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
  },
});
