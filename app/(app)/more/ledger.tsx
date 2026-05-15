/**
 * Studio-wide Ledger — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Ledger" · circular blue PDF icon (when entries exist)
 *   2. Period chip rail (All / Today / This Week / This Month / Last Month / Custom)
 *   3. Custom date row (only when Period = Custom) — From + To Row pickers
 *   4. Combined In / Out / Balance card with hairline dividers
 *   5. "Filters" Filter button (count badge) → opens FilterSheet
 *   6. Transactions list — surface card rows, in-tone amount on right
 *   7. Floating Generate Report bar at the bottom
 *
 * Pickers:
 *   • FilterSheet — bottom sheet with Project / Type / Category /
 *     Payment Method / Party sections + Clear all
 *   • PartyPickerSheet (search) and ProjectMultiPickerSheet (search +
 *     multi-select)
 *   • DateTimeSheet for the From / To custom-period dates
 *
 * Preserves all data hooks (`useProjects`, `useParties`, `useOrgMembers`,
 * `useProjectTotals`) and the PDF-export pipeline (`generateLedgerReport`).
 */
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { useProjects } from '@/src/features/projects/useProjects';
import { useParties } from '@/src/features/parties/useParties';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import { generateLedgerReport } from '@/src/features/ledger/ledgerPdf';
import {
  TRANSACTION_CATEGORIES,
  PAYMENT_METHODS,
  isTransactionCountedInTotals,
  normalizeTransactionType,
  getCategoryLabel,
  getPaymentMethodLabel,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
  type PaymentMethod,
} from '@/src/features/transactions/types';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { inrCompact, useThemeV2, type ThemeV2 } from '@/src/theme/v2';

type PeriodKey = 'all' | 'today' | 'week' | 'month' | 'lastMonth' | 'custom';

type Filters = {
  projectIds: string[]; // empty = all
  type: TransactionType | 'all';
  category: TransactionCategory | 'all';
  paymentMethod: PaymentMethod | 'all';
  partyId: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
};

const EMPTY_FILTERS: Filters = {
  projectIds: [],
  type: 'all',
  category: 'all',
  paymentMethod: 'all',
  partyId: null,
  dateFrom: null,
  dateTo: null,
};

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];

function periodRange(p: PeriodKey): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (p === 'all' || p === 'custom') return { from: null, to: null };
  if (p === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to: now };
  }
  if (p === 'week') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return { from: d, to: now };
  }
  if (p === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
  // lastMonth
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { from, to };
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

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

export default function LedgerScreen() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';

  const { data: projects, loading: projectsLoading } = useProjects();
  const { data: parties } = useParties(orgId);
  const { members } = useOrgMembers(orgId);
  const { transactions: txns, loading: txnsLoading } = useProjectTotals(orgId);

  const [period, setPeriod] = useState<PeriodKey>('all');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [datePicker, setDatePicker] = useState<'from' | 'to' | null>(null);
  const [generating, setGenerating] = useState(false);

  const projectsById = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {};
    for (const p of projects) map[p.id] = { id: p.id, name: p.name };
    return map;
  }, [projects]);

  const memberNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.uid] = m.displayName;
    return map;
  }, [members]);

  const partiesById = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {};
    for (const p of parties) map[p.id] = { id: p.id, name: p.name };
    return map;
  }, [parties]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.projectIds.length > 0) n++;
    if (filters.type !== 'all') n++;
    if (filters.category !== 'all') n++;
    if (filters.paymentMethod !== 'all') n++;
    if (filters.partyId) n++;
    if (period !== 'all') n++;
    return n;
  }, [filters, period]);

  const filteredTxns = useMemo(() => {
    const range =
      period === 'custom'
        ? { from: filters.dateFrom, to: filters.dateTo }
        : periodRange(period);

    return txns
      .filter(isTransactionCountedInTotals)
      .filter((tx) => {
        if (filters.projectIds.length > 0 && !filters.projectIds.includes(tx.projectId)) return false;
        const tt = normalizeTransactionType(tx.type);
        if (filters.type !== 'all' && tt !== filters.type) return false;
        if (filters.category !== 'all' && tx.category !== filters.category) return false;
        if (filters.paymentMethod !== 'all' && tx.paymentMethod !== filters.paymentMethod) return false;
        if (filters.partyId && tx.partyId !== filters.partyId) return false;
        if (range.from && tx.date && tx.date.toDate() < range.from) return false;
        if (range.to) {
          const end = new Date(range.to);
          end.setHours(23, 59, 59, 999);
          if (tx.date && tx.date.toDate() > end) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const at = a.date ? a.date.toMillis() : 0;
        const bt = b.date ? b.date.toMillis() : 0;
        return bt - at;
      });
  }, [txns, filters, period]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filteredTxns) {
      if (normalizeTransactionType(tx.type) === 'payment_in') income += tx.amount;
      else expense += tx.amount;
    }
    return { income, expense, balance: income - expense };
  }, [filteredTxns]);

  const handleGenerate = useCallback(async () => {
    if (!orgId) return;
    setGenerating(true);
    try {
      const range =
        period === 'custom'
          ? { from: filters.dateFrom, to: filters.dateTo }
          : periodRange(period);

      const projectsLabel =
        filters.projectIds.length === 0
          ? 'All Projects'
          : filters.projectIds.length === 1
            ? projectsById[filters.projectIds[0]]?.name ?? '1 project'
            : `${filters.projectIds.length} projects`;

      const partyName = filters.partyId ? partiesById[filters.partyId]?.name : undefined;

      await generateLedgerReport({
        orgId,
        transactions: filteredTxns,
        projectsById,
        memberNames,
        dateFrom: range.from,
        dateTo: range.to,
        projectsLabel,
        appliedFilters: {
          type:
            filters.type !== 'all'
              ? filters.type === 'payment_in'
                ? 'Payment In'
                : 'Payment Out'
              : undefined,
          category: filters.category !== 'all' ? getCategoryLabel(filters.category) : undefined,
          paymentMethod:
            filters.paymentMethod !== 'all'
              ? getPaymentMethodLabel(filters.paymentMethod)
              : undefined,
          party: partyName,
        },
      });
    } catch (e) {
      Alert.alert('Could not generate PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [orgId, period, filters, filteredTxns, projectsById, partiesById, memberNames]);

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const renderRow = useCallback(
    ({ item: tx, index }: { item: Transaction; index: number }) => {
      const dir = normalizeTransactionType(tx.type);
      const isIn = dir === 'payment_in';
      const projName = projectsById[tx.projectId]?.name ?? 'Project';
      const cat = tx.category ? getCategoryLabel(tx.category as TransactionCategory) : null;
      const meth = tx.paymentMethod
        ? getPaymentMethodLabel(tx.paymentMethod as PaymentMethod)
        : null;
      const subline = [projName, cat, meth, tx.description].filter(Boolean).join(' · ');
      const date = fmtTxnDate(tx.date);
      const tone = isIn ? t.palette.green : t.palette.red;

      const isLast = index === filteredTxns.length - 1;
      const isFirst = index === 0;

      return (
        <Pressable
          onPress={() =>
            router.push(`/(app)/projects/${tx.projectId}/transaction/${tx.id}` as never)
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
              {
                backgroundColor: t.colors.fill3,
                borderRadius: t.radii.tile,
              },
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
              {tx.partyName || projName || '—'}
            </Text>
            {subline ? (
              <Text
                variant="caption1"
                color="secondary"
                numberOfLines={1}
                style={{ marginTop: 2 }}
              >
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
              marginLeft: 8,
            }}
          >
            {isIn ? '+' : '−'}
            {inrCompact(Math.abs(tx.amount))}
          </Text>

          {/* Divider between rows */}
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
    },
    [filteredTxns.length, projectsById, t, cardBg, cardBorder],
  );

  const isLoading = txnsLoading || projectsLoading;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — transparent so the AmbientBackground flows through */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="label">
            Ledger
          </Text>
          <Text variant="caption2" color="secondary" style={{ letterSpacing: 0.5, marginTop: 1 }}>
            STUDIO TRANSACTIONS · {filteredTxns.length}
          </Text>
        </View>
        <Pressable
          onPress={handleGenerate}
          disabled={generating || isLoading || filteredTxns.length === 0}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor:
                generating || isLoading || filteredTxns.length === 0
                  ? t.colors.fill3
                  : t.mode === 'dark'
                    ? t.palette.blue.softDark
                    : t.palette.blue.soft,
              borderRadius: 999,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          {generating ? (
            <ActivityIndicator size="small" color={t.palette.blue.base} />
          ) : (
            <Ionicons
              name="document-text-outline"
              size={16}
              color={
                filteredTxns.length === 0 || isLoading
                  ? t.colors.tertiary
                  : t.palette.blue.base
              }
            />
          )}
        </Pressable>
      </View>

      <FlatList
        data={filteredTxns}
        keyExtractor={(tx) => tx.id}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl {...refresh.props} />}
        ListHeaderComponent={
          <View>
            {/* PERIOD chips */}
            <Text
              variant="caption2"
              color="secondary"
              style={{
                paddingHorizontal: 32,
                paddingTop: 18,
                paddingBottom: 8,
                letterSpacing: 0.4,
              }}
            >
              PERIOD
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
            >
              {PERIOD_OPTIONS.map((opt) => {
                const sel = opt.key === period;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setPeriod(opt.key)}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: sel
                          ? t.mode === 'dark'
                            ? t.palette.blue.softDark
                            : t.palette.blue.soft
                          : t.colors.fill3,
                        borderRadius: 999,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      variant="footnote"
                      style={{
                        color: sel ? t.palette.blue.base : t.colors.label,
                        fontWeight: sel ? '700' : '500',
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Custom date row */}
            {period === 'custom' ? (
              <View style={styles.customDateRow}>
                <DatePickerBtn
                  label={filters.dateFrom ? fmtShortDate(filters.dateFrom) : 'From'}
                  filled={!!filters.dateFrom}
                  onPress={() => setDatePicker('from')}
                  t={t}
                />
                <DatePickerBtn
                  label={filters.dateTo ? fmtShortDate(filters.dateTo) : 'To'}
                  filled={!!filters.dateTo}
                  onPress={() => setDatePicker('to')}
                  t={t}
                />
              </View>
            ) : null}

            {/* Combined In / Out / Balance card */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <View
                style={[
                  styles.totalsCard,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.card,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <TotalCol
                  label="IN"
                  value={`+${inrCompact(totals.income)}`}
                  color={t.palette.green.base}
                />
                <View
                  style={[
                    styles.totalsDivider,
                    { backgroundColor: t.colors.separator },
                  ]}
                />
                <TotalCol
                  label="OUT"
                  value={`−${inrCompact(totals.expense)}`}
                  color={t.palette.red.base}
                />
                <View
                  style={[
                    styles.totalsDivider,
                    { backgroundColor: t.colors.separator },
                  ]}
                />
                <TotalCol
                  label="BALANCE"
                  value={`${totals.balance < 0 ? '−' : ''}${inrCompact(Math.abs(totals.balance))}`}
                  color={t.palette.blue.base}
                />
              </View>
            </View>

            {/* Filter button */}
            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <Pressable
                onPress={() => setFilterSheetOpen(true)}
                style={({ pressed }) => [
                  styles.filterBtn,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.field,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="options-outline" size={16} color={t.colors.label} />
                <Text
                  variant="callout"
                  color="label"
                  style={{ fontWeight: '600', marginLeft: 8 }}
                >
                  Filters
                </Text>
                {activeFilterCount > 0 ? (
                  <View
                    style={[
                      styles.countBadge,
                      { backgroundColor: t.palette.blue.base },
                    ]}
                  >
                    <Text
                      variant="caption2"
                      style={{ color: '#fff', fontWeight: '700' }}
                    >
                      {activeFilterCount}
                    </Text>
                  </View>
                ) : null}
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={t.colors.tertiary}
                  style={{ marginLeft: 'auto' }}
                />
              </Pressable>
            </View>

            {/* TRANSACTIONS header */}
            <View style={styles.txnHeaderRow}>
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.4 }}
              >
                TRANSACTIONS
              </Text>
              {filteredTxns.length > 0 ? (
                <Text variant="caption2" color="tertiary">
                  {filteredTxns.length} entries
                </Text>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={t.palette.blue.base} />
            </View>
          ) : (
            <View style={styles.empty}>
              <View
                style={[
                  styles.emptyIcon,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                    borderRadius: t.radii.tile,
                  },
                ]}
              >
                <Ionicons
                  name="receipt-outline"
                  size={28}
                  color={t.palette.blue.base}
                />
              </View>
              <Text
                variant="headline"
                color="label"
                style={{ marginTop: 12, fontWeight: '600' }}
              >
                {activeFilterCount > 0
                  ? 'No matches'
                  : 'No transactions yet'}
              </Text>
              <Text
                variant="footnote"
                color="secondary"
                style={{ marginTop: 4, textAlign: 'center' }}
              >
                {activeFilterCount > 0
                  ? 'Try widening your filters'
                  : 'Logged transactions across all your projects appear here'}
              </Text>
              {activeFilterCount > 0 ? (
                <Pressable
                  onPress={() => {
                    setFilters(EMPTY_FILTERS);
                    setPeriod('all');
                  }}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.clearBtn,
                    {
                      backgroundColor:
                        t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                      borderRadius: 999,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    variant="footnote"
                    style={{
                      color: t.palette.blue.base,
                      fontWeight: '700',
                    }}
                  >
                    Clear filters
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
      />

      {/* Floating Generate */}
      {filteredTxns.length > 0 ? (
        <View style={styles.floatingBar}>
          <Pressable
            onPress={handleGenerate}
            disabled={generating}
            style={({ pressed }) => [
              styles.generateBtn,
              {
                backgroundColor: t.palette.blue.base,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
              generating && { opacity: 0.6 },
            ]}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="document-text-outline" size={16} color="#fff" />
            )}
            <Text
              variant="callout"
              style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}
            >
              {generating
                ? 'Generating…'
                : `Generate report · ${filteredTxns.length}`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Filter sheet */}
      <FilterSheet
        open={filterSheetOpen}
        filters={filters}
        partiesById={partiesById}
        projectsById={projectsById}
        activeCount={activeFilterCount}
        onChange={setFilters}
        onPickProjects={() => {
          setFilterSheetOpen(false);
          setProjectPickerOpen(true);
        }}
        onPickParty={() => {
          setFilterSheetOpen(false);
          setPartyPickerOpen(true);
        }}
        onClearAll={() => {
          setFilters(EMPTY_FILTERS);
          setPeriod('all');
        }}
        onClose={() => setFilterSheetOpen(false)}
      />

      {/* Project multi-picker */}
      <ProjectMultiPickerSheet
        visible={projectPickerOpen}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        selectedIds={filters.projectIds}
        onClose={() => setProjectPickerOpen(false)}
        onSave={(ids) => {
          setFilters((f) => ({ ...f, projectIds: ids }));
          setProjectPickerOpen(false);
        }}
      />

      {/* Party picker */}
      <PartyPickerSheet
        visible={partyPickerOpen}
        parties={parties.map((p) => ({ id: p.id, name: p.name }))}
        selectedId={filters.partyId}
        onPick={(id) => {
          setFilters((f) => ({ ...f, partyId: id }));
          setPartyPickerOpen(false);
        }}
        onClose={() => setPartyPickerOpen(false)}
      />

      {/* Date picker */}
      <DateTimeSheet
        open={datePicker === 'from'}
        value={filters.dateFrom ?? new Date()}
        mode="date"
        title="From date"
        onChange={(d) => setFilters((f) => ({ ...f, dateFrom: d }))}
        onClose={() => setDatePicker(null)}
      />
      <DateTimeSheet
        open={datePicker === 'to'}
        value={filters.dateTo ?? new Date()}
        mode="date"
        title="To date"
        onChange={(d) => setFilters((f) => ({ ...f, dateTo: d }))}
        onClose={() => setDatePicker(null)}
      />
    </View>
  );
}

// ── Subcomponents ──

function TotalCol({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.totalCol}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text
        variant="callout"
        style={{ color, fontWeight: '700', marginTop: 4 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

function DatePickerBtn({
  label,
  filled,
  onPress,
  t,
}: {
  label: string;
  filled: boolean;
  onPress: () => void;
  t: ThemeV2;
}) {
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.datePickerBtn,
        {
          backgroundColor: cardBg,
          borderRadius: t.radii.field,
          borderColor: cardBorder,
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons
        name="calendar-outline"
        size={14}
        color={filled ? t.palette.blue.base : t.colors.tertiary}
      />
      <Text
        variant="footnote"
        style={{
          color: filled ? t.colors.label : t.colors.tertiary,
          fontWeight: filled ? '600' : '400',
          marginLeft: 6,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Filter Sheet ──

function FilterSheet({
  open,
  filters,
  partiesById,
  projectsById,
  activeCount,
  onChange,
  onPickProjects,
  onPickParty,
  onClearAll,
  onClose,
}: {
  open: boolean;
  filters: Filters;
  partiesById: Record<string, { id: string; name: string }>;
  projectsById: Record<string, { id: string; name: string }>;
  activeCount: number;
  onChange: (next: Filters) => void;
  onPickProjects: () => void;
  onPickParty: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();

  const projectsLabel =
    filters.projectIds.length === 0
      ? 'All projects'
      : filters.projectIds.length === 1
        ? projectsById[filters.projectIds[0]]?.name ?? '1 project'
        : `${filters.projectIds.length} projects`;

  const selectedParty = filters.partyId ? partiesById[filters.partyId] : null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '88%',
            },
          ]}
        >
          <View
            style={[
              sheetStyles.grabber,
              { backgroundColor: t.colors.tertiary },
            ]}
          />
          <View
            style={[
              sheetStyles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={onClose} hitSlop={8} style={sheetStyles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[sheetStyles.title, { fontWeight: '600' }]}
            >
              Filters
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={[sheetStyles.sideBtn, { alignItems: 'flex-end' }]}
            >
              <Text
                variant="body"
                style={{ color: t.palette.blue.base, fontWeight: '600' }}
              >
                Done
              </Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {/* Projects */}
            <Section label="PROJECTS">
              <Pressable
                onPress={onPickProjects}
                style={({ pressed }) => [
                  sheetStyles.pickerRow,
                  {
                    backgroundColor: t.colors.fill3,
                    borderRadius: t.radii.field,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons
                  name="briefcase-outline"
                  size={15}
                  color={t.palette.blue.base}
                />
                <Text
                  variant="callout"
                  color="label"
                  style={{ flex: 1, marginLeft: 8 }}
                  numberOfLines={1}
                >
                  {projectsLabel}
                </Text>
                {filters.projectIds.length > 0 ? (
                  <Pressable
                    onPress={() => onChange({ ...filters, projectIds: [] })}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={t.colors.tertiary}
                    />
                  </Pressable>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={t.colors.tertiary}
                  />
                )}
              </Pressable>
            </Section>

            {/* Type */}
            <Section label="TYPE">
              <ChipRow
                options={[
                  { key: 'all', label: 'All' },
                  { key: 'payment_in', label: 'Payment in' },
                  { key: 'payment_out', label: 'Payment out' },
                ]}
                value={filters.type}
                onChange={(v) =>
                  onChange({ ...filters, type: v as TransactionType | 'all' })
                }
              />
            </Section>

            {/* Category */}
            <Section label="CATEGORY">
              <ChipRow
                options={[
                  { key: 'all', label: 'All' },
                  ...TRANSACTION_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
                ]}
                value={filters.category}
                onChange={(v) =>
                  onChange({ ...filters, category: v as TransactionCategory | 'all' })
                }
              />
            </Section>

            {/* Method */}
            <Section label="METHOD">
              <ChipRow
                options={[
                  { key: 'all', label: 'All' },
                  ...PAYMENT_METHODS.map((m) => ({ key: m.key, label: m.label })),
                ]}
                value={filters.paymentMethod}
                onChange={(v) =>
                  onChange({ ...filters, paymentMethod: v as PaymentMethod | 'all' })
                }
              />
            </Section>

            {/* Party */}
            <Section label="PARTY">
              <Pressable
                onPress={onPickParty}
                style={({ pressed }) => [
                  sheetStyles.pickerRow,
                  {
                    backgroundColor: t.colors.fill3,
                    borderRadius: t.radii.field,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons
                  name="people-outline"
                  size={15}
                  color={t.palette.blue.base}
                />
                <Text
                  variant="callout"
                  color="label"
                  style={{ flex: 1, marginLeft: 8 }}
                  numberOfLines={1}
                >
                  {selectedParty?.name ?? 'All parties'}
                </Text>
                {filters.partyId ? (
                  <Pressable
                    onPress={() => onChange({ ...filters, partyId: null })}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={t.colors.tertiary}
                    />
                  </Pressable>
                ) : (
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={t.colors.tertiary}
                  />
                )}
              </Pressable>
            </Section>

            {/* Clear all */}
            {activeCount > 0 ? (
              <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
                <Pressable
                  onPress={onClearAll}
                  style={({ pressed }) => [
                    sheetStyles.clearBtn,
                    {
                      backgroundColor:
                        t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                      borderRadius: t.radii.field,
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
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
      <Text
        variant="caption2"
        color="secondary"
        style={{ letterSpacing: 0.4, marginBottom: 8, paddingHorizontal: 4 }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useThemeV2();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6 }}
    >
      {options.map((opt) => {
        const sel = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: sel
                  ? t.mode === 'dark'
                    ? t.palette.blue.softDark
                    : t.palette.blue.soft
                  : t.colors.fill3,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              variant="footnote"
              style={{
                color: sel ? t.palette.blue.base : t.colors.label,
                fontWeight: sel ? '700' : '500',
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Project multi-picker (search + multi-select) ──

function ProjectMultiPickerSheet({
  visible,
  projects,
  selectedIds,
  onClose,
  onSave,
}: {
  visible: boolean;
  projects: { id: string; name: string }[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) {
      setDraft(new Set(selectedIds));
      setSearch('');
    }
  }, [visible, selectedIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, search]);

  const allSelected = draft.size === 0 || draft.size === projects.length;

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '88%',
            },
          ]}
        >
          <View
            style={[sheetStyles.grabber, { backgroundColor: t.colors.tertiary }]}
          />
          <View
            style={[
              sheetStyles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={close} hitSlop={8} style={sheetStyles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[sheetStyles.title, { fontWeight: '600' }]}
            >
              Select projects
            </Text>
            <Pressable
              onPress={() => onSave(Array.from(draft))}
              hitSlop={8}
              style={[sheetStyles.sideBtn, { alignItems: 'flex-end' }]}
            >
              <Text
                variant="body"
                style={{ color: t.palette.blue.base, fontWeight: '600' }}
              >
                Apply
              </Text>
            </Pressable>
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View
              style={[
                sheetStyles.searchBar,
                { backgroundColor: t.colors.fill3, borderRadius: t.radii.field },
              ]}
            >
              <Ionicons name="search" size={16} color={t.colors.tertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search projects"
                placeholderTextColor={t.colors.tertiary}
                style={[
                  sheetStyles.searchInput,
                  { color: t.colors.label, ...t.type.callout },
                ]}
                returnKeyType="search"
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {/* All projects toggle */}
            <Pressable
              onPress={() => setDraft(new Set())}
              style={({ pressed }) => [
                sheetStyles.optionRow,
                pressed && { backgroundColor: t.colors.fill3 },
              ]}
            >
              <Text variant="body" color="label" style={{ flex: 1, fontWeight: '600' }}>
                All projects
              </Text>
              {allSelected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color={t.palette.blue.base}
                />
              ) : (
                <Ionicons
                  name="ellipse-outline"
                  size={20}
                  color={t.colors.tertiary}
                />
              )}
            </Pressable>

            {filtered.map((p) => {
              const checked = draft.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => toggle(p.id)}
                  style={({ pressed }) => [
                    sheetStyles.optionRow,
                    pressed && { backgroundColor: t.colors.fill3 },
                  ]}
                >
                  <Text
                    variant="body"
                    color="label"
                    style={{ flex: 1 }}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  <Ionicons
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={checked ? t.palette.blue.base : t.colors.tertiary}
                  />
                </Pressable>
              );
            })}
            {filtered.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <Text variant="callout" color="secondary">
                  No projects found
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Party picker (search + single-select) ──

function PartyPickerSheet({
  visible,
  parties,
  selectedId,
  onPick,
  onClose,
}: {
  visible: boolean;
  parties: { id: string; name: string }[];
  selectedId: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) setSearch('');
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => p.name.toLowerCase().includes(q));
  }, [parties, search]);

  const close = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '88%',
            },
          ]}
        >
          <View
            style={[sheetStyles.grabber, { backgroundColor: t.colors.tertiary }]}
          />
          <View
            style={[
              sheetStyles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={close} hitSlop={8} style={sheetStyles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[sheetStyles.title, { fontWeight: '600' }]}
            >
              Select party
            </Text>
            <View style={sheetStyles.sideBtn} />
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View
              style={[
                sheetStyles.searchBar,
                { backgroundColor: t.colors.fill3, borderRadius: t.radii.field },
              ]}
            >
              <Ionicons name="search" size={16} color={t.colors.tertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search parties"
                placeholderTextColor={t.colors.tertiary}
                style={[
                  sheetStyles.searchInput,
                  { color: t.colors.label, ...t.type.callout },
                ]}
                returnKeyType="search"
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            <Pressable
              onPress={() => onPick(null)}
              style={({ pressed }) => [
                sheetStyles.optionRow,
                pressed && { backgroundColor: t.colors.fill3 },
              ]}
            >
              <Text
                variant="body"
                color="label"
                style={{ flex: 1, fontWeight: !selectedId ? '600' : '400' }}
              >
                All parties
              </Text>
              {!selectedId ? (
                <Ionicons name="checkmark" size={20} color={t.palette.blue.base} />
              ) : null}
            </Pressable>
            {filtered.map((p) => {
              const sel = selectedId === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onPick(p.id)}
                  style={({ pressed }) => [
                    sheetStyles.optionRow,
                    pressed && { backgroundColor: t.colors.fill3 },
                  ]}
                >
                  <Text
                    variant="body"
                    color="label"
                    style={{ flex: 1, fontWeight: sel ? '600' : '400' }}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                  {sel ? (
                    <Ionicons name="checkmark" size={20} color={t.palette.blue.base} />
                  ) : null}
                </Pressable>
              );
            })}
            {filtered.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <Text variant="callout" color="secondary">
                  No parties found
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Period chip
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  // Custom date row
  customDateRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  datePickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Combined In/Out/Balance card
  totalsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  totalCol: {
    flex: 1,
    alignItems: 'center',
  },
  totalsDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 6,
  },

  // Filter button
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // Transactions header
  txnHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 8,
  },

  // Row
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

  // Empty
  empty: {
    paddingVertical: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 14,
  },

  // Floating
  floatingBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});

const sheetStyles = StyleSheet.create({
  sheet: { paddingTop: 8 },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sideBtn: { minWidth: 70 },
  title: { flex: 1, textAlign: 'center' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, paddingVertical: 0, margin: 0 },

  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
