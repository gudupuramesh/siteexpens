/**
 * Studio-wide Ledger — every transaction across every project the
 * caller can see. Filters refine the on-screen list AND the generated
 * PDF (same filtered set is exported).
 */
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

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
import { Screen } from '@/src/ui/Screen';
import { Spinner } from '@/src/ui/Spinner';
import { Text } from '@/src/ui/Text';
import { TutorialEmptyState } from '@/src/ui/TutorialEmptyState';
import { color, fontFamily } from '@/src/theme/tokens';

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
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
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

function fmtAmount(n: number): string {
  return `₹${Math.abs(n).toLocaleString('en-IN')}`;
}

function fmtTxnDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function LedgerScreen() {
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';

  const { data: projects, loading: projectsLoading } = useProjects();
  const { data: parties } = useParties(orgId);
  const { members } = useOrgMembers(orgId);
  const { transactions: txns, loading: txnsLoading } = useProjectTotals(orgId);

  const [period, setPeriod] = useState<PeriodKey>('all');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(true);
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
      .filter((t) => {
        if (filters.projectIds.length > 0 && !filters.projectIds.includes(t.projectId)) return false;
        const tt = normalizeTransactionType(t.type);
        if (filters.type !== 'all' && tt !== filters.type) return false;
        if (filters.category !== 'all' && t.category !== filters.category) return false;
        if (filters.paymentMethod !== 'all' && t.paymentMethod !== filters.paymentMethod) return false;
        if (filters.partyId && t.partyId !== filters.partyId) return false;
        if (range.from && t.date && t.date.toDate() < range.from) return false;
        if (range.to) {
          const end = new Date(range.to);
          end.setHours(23, 59, 59, 999);
          if (t.date && t.date.toDate() > end) return false;
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
    for (const t of filteredTxns) {
      if (normalizeTransactionType(t.type) === 'payment_in') income += t.amount;
      else expense += t.amount;
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
          type: filters.type !== 'all' ? (filters.type === 'payment_in' ? 'Payment In' : 'Payment Out') : undefined,
          category: filters.category !== 'all' ? getCategoryLabel(filters.category) : undefined,
          paymentMethod: filters.paymentMethod !== 'all' ? getPaymentMethodLabel(filters.paymentMethod) : undefined,
          party: partyName,
        },
      });
    } catch (e) {
      Alert.alert('Could not generate PDF', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [orgId, period, filters, filteredTxns, projectsById, partiesById, memberNames]);

  const selectedParty = filters.partyId ? partiesById[filters.partyId] : null;

  const projectsLabel =
    filters.projectIds.length === 0
      ? 'All projects'
      : filters.projectIds.length === 1
        ? projectsById[filters.projectIds[0]]?.name ?? '1 project'
        : `${filters.projectIds.length} projects`;

  const renderRow = useCallback(
    ({ item: t }: { item: Transaction }) => {
      const dir = normalizeTransactionType(t.type);
      const isIn = dir === 'payment_in';
      const projName = projectsById[t.projectId]?.name ?? 'Project';
      const cat = t.category ? getCategoryLabel(t.category as TransactionCategory) : null;
      const meth = t.paymentMethod
        ? getPaymentMethodLabel(t.paymentMethod as PaymentMethod)
        : null;
      const subline = [cat, meth, t.description].filter(Boolean).join(' · ') || '—';
      return (
        <Pressable
          onPress={() =>
            router.push(`/(app)/projects/${t.projectId}/transaction/${t.id}` as never)
          }
          style={({ pressed }) => [styles.txnRow, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.txnDateCol}>
            <Text style={styles.txnDate}>{fmtTxnDate(t.date)}</Text>
          </View>
          <View style={styles.txnBody}>
            <Text style={styles.txnTitle} numberOfLines={1}>
              {t.partyName || '—'}
              <Text style={styles.txnProj}> · {projName}</Text>
            </Text>
            <Text style={styles.txnSub} numberOfLines={1}>
              {subline}
            </Text>
          </View>
          <View style={styles.txnAmtCol}>
            <Text style={[styles.txnAmt, { color: isIn ? '#059669' : '#dc2626' }]}>
              {isIn ? '+' : '−'}
              {fmtAmount(t.amount)}
            </Text>
          </View>
        </Pressable>
      );
    },
    [projectsById],
  );

  const isLoading = txnsLoading || projectsLoading;

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={color.textMuted} />
        </Pressable>
        <View style={styles.navTitleWrap}>
          <Text style={styles.navTitle} numberOfLines={1}>Ledger</Text>
          <Text style={styles.navSub} numberOfLines={1}>
            STUDIO TRANSACTIONS · {filteredTxns.length}
          </Text>
        </View>
        <Pressable
          onPress={handleGenerate}
          disabled={generating || isLoading || filteredTxns.length === 0}
          hitSlop={12}
          style={({ pressed }) => [
            styles.navIconBtn,
            pressed && { opacity: 0.6 },
            (generating || isLoading || filteredTxns.length === 0) && { opacity: 0.4 },
          ]}
          accessibilityLabel="Generate PDF"
        >
          {generating ? (
            <ActivityIndicator size="small" color={color.primary} />
          ) : (
            <Ionicons name="document-text-outline" size={16} color={color.primary} />
          )}
        </Pressable>
      </View>

      <FlatList
        data={filteredTxns}
        keyExtractor={(t) => t.id}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* Period chips */}
            <Text style={styles.sectionLabel}>PERIOD</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
            >
              {PERIOD_OPTIONS.map((opt) => {
                const sel = opt.key === period;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setPeriod(opt.key)}
                    style={[styles.periodChip, sel ? styles.periodChipActive : undefined]}
                  >
                    <Text
                      style={
                        sel
                          ? [styles.periodChipText, styles.periodChipTextActive]
                          : styles.periodChipText
                      }
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Custom date range (only when period === 'custom') */}
            {period === 'custom' && (
              <View style={styles.dateRow}>
                <Pressable
                  onPress={() => setDatePicker('from')}
                  style={[styles.pickerBtn, { flex: 1 }]}
                >
                  <Ionicons name="calendar-outline" size={14} color={color.primary} />
                  <Text style={styles.pickerBtnText} numberOfLines={1}>
                    {filters.dateFrom ? fmtShortDate(filters.dateFrom) : 'From'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setDatePicker('to')}
                  style={[styles.pickerBtn, { flex: 1 }]}
                >
                  <Ionicons name="calendar-outline" size={14} color={color.primary} />
                  <Text style={styles.pickerBtnText} numberOfLines={1}>
                    {filters.dateTo ? fmtShortDate(filters.dateTo) : 'To'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Totals */}
            <View style={styles.totalsRow}>
              <View style={[styles.totalCell, styles.totalIn]}>
                <Text style={styles.totalLabel}>TOTAL IN</Text>
                <Text style={[styles.totalValue, { color: '#059669' }]}>
                  +{fmtAmount(totals.income)}
                </Text>
              </View>
              <View style={[styles.totalCell, styles.totalOut]}>
                <Text style={styles.totalLabel}>TOTAL OUT</Text>
                <Text style={[styles.totalValue, { color: '#dc2626' }]}>
                  −{fmtAmount(totals.expense)}
                </Text>
              </View>
              <View style={[styles.totalCell, styles.totalBal]}>
                <Text style={styles.totalLabel}>BALANCE</Text>
                <Text style={[styles.totalValue, { color: '#2563eb' }]}>
                  {totals.balance < 0 ? '−' : ''}
                  {fmtAmount(totals.balance)}
                </Text>
              </View>
            </View>

            {/* Filter card header (collapsible) */}
            <Pressable
              onPress={() => setFiltersOpen((v) => !v)}
              style={styles.filterToggle}
            >
              <Ionicons name="options-outline" size={15} color={color.text} />
              <Text style={styles.filterToggleText}>Filters</Text>
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
              <Ionicons
                name={filtersOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={color.textMuted}
                style={{ marginLeft: 'auto' }}
              />
            </Pressable>

            {filtersOpen && (
              <View style={styles.card}>
                <FilterSection label="Projects">
                  <Pressable
                    onPress={() => setProjectPickerOpen(true)}
                    style={styles.pickerBtn}
                  >
                    <Ionicons name="briefcase-outline" size={15} color={color.primary} />
                    <Text style={styles.pickerBtnText}>{projectsLabel}</Text>
                    {filters.projectIds.length > 0 ? (
                      <Pressable
                        onPress={() => setFilters((f) => ({ ...f, projectIds: [] }))}
                        hitSlop={8}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Ionicons name="close-circle" size={16} color={color.textFaint} />
                      </Pressable>
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={color.textFaint}
                        style={{ marginLeft: 'auto' }}
                      />
                    )}
                  </Pressable>
                </FilterSection>

                <FilterSection label="Type">
                  <ChipRow
                    options={[
                      { key: 'all', label: 'All' },
                      { key: 'payment_in', label: 'Payment In' },
                      { key: 'payment_out', label: 'Payment Out' },
                    ]}
                    value={filters.type}
                    onChange={(v) =>
                      setFilters((f) => ({ ...f, type: v as TransactionType | 'all' }))
                    }
                  />
                </FilterSection>

                <FilterSection label="Category">
                  <ChipRow
                    options={[
                      { key: 'all', label: 'All' },
                      ...TRANSACTION_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
                    ]}
                    value={filters.category}
                    onChange={(v) =>
                      setFilters((f) => ({ ...f, category: v as TransactionCategory | 'all' }))
                    }
                  />
                </FilterSection>

                <FilterSection label="Payment Method">
                  <ChipRow
                    options={[
                      { key: 'all', label: 'All' },
                      ...PAYMENT_METHODS.map((m) => ({ key: m.key, label: m.label })),
                    ]}
                    value={filters.paymentMethod}
                    onChange={(v) =>
                      setFilters((f) => ({ ...f, paymentMethod: v as PaymentMethod | 'all' }))
                    }
                  />
                </FilterSection>

                <FilterSection label="Party">
                  <Pressable
                    onPress={() => setPartyPickerOpen(true)}
                    style={styles.pickerBtn}
                  >
                    <Ionicons name="people-outline" size={15} color={color.primary} />
                    <Text style={styles.pickerBtnText}>
                      {selectedParty?.name ?? 'All parties'}
                    </Text>
                    {filters.partyId ? (
                      <Pressable
                        onPress={() => setFilters((f) => ({ ...f, partyId: null }))}
                        hitSlop={8}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Ionicons name="close-circle" size={16} color={color.textFaint} />
                      </Pressable>
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={color.textFaint}
                        style={{ marginLeft: 'auto' }}
                      />
                    )}
                  </Pressable>
                </FilterSection>

                {activeFilterCount > 0 && (
                  <Pressable
                    onPress={() => {
                      setFilters(EMPTY_FILTERS);
                      setPeriod('all');
                    }}
                    hitSlop={6}
                    style={styles.clearAll}
                  >
                    <Ionicons name="close-circle-outline" size={14} color={color.primary} />
                    <Text style={styles.clearAllText}>Clear all filters</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Transactions header */}
            <View style={styles.txnHeader}>
              <Text style={styles.sectionLabel}>TRANSACTIONS</Text>
              {filteredTxns.length > 0 && (
                <Text style={styles.txnCount}>{filteredTxns.length} entries</Text>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <Spinner size={24} />
            </View>
          ) : (
            <TutorialEmptyState
              pageKey="ledger"
              fallback={
                <View style={styles.empty}>
                  <Ionicons name="receipt-outline" size={32} color={color.textFaint} />
                  <Text style={styles.emptyTitle}>
                    {activeFilterCount > 0 ? 'No transactions match these filters' : 'No transactions yet'}
                  </Text>
                  {activeFilterCount > 0 && (
                    <Pressable
                      onPress={() => {
                        setFilters(EMPTY_FILTERS);
                        setPeriod('all');
                      }}
                      style={styles.emptyClearBtn}
                    >
                      <Text style={styles.emptyClearText}>Clear filters</Text>
                    </Pressable>
                  )}
                </View>
              }
            />
          )
        }
      />

      {/* Floating Generate Report button */}
      {filteredTxns.length > 0 && (
        <View style={styles.floatingBar}>
          <Pressable
            onPress={handleGenerate}
            disabled={generating}
            style={({ pressed }) => [
              styles.generateBtn,
              pressed && { opacity: 0.85 },
              generating && { opacity: 0.6 },
            ]}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="document-text-outline" size={16} color="#fff" />
            )}
            <Text style={styles.generateBtnText}>
              {generating ? 'Generating…' : `Generate Report (${filteredTxns.length})`}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Project picker modal */}
      <ProjectMultiPicker
        visible={projectPickerOpen}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        selectedIds={filters.projectIds}
        onClose={() => setProjectPickerOpen(false)}
        onSave={(ids) => {
          setFilters((f) => ({ ...f, projectIds: ids }));
          setProjectPickerOpen(false);
        }}
      />

      {/* Party picker modal */}
      <Modal
        visible={partyPickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPartyPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPartyPickerOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Party</Text>
              <Pressable onPress={() => setPartyPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={color.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              <Pressable
                onPress={() => {
                  setFilters((f) => ({ ...f, partyId: null }));
                  setPartyPickerOpen(false);
                }}
                style={styles.partyRow}
              >
                <Text style={styles.partyName}>All parties</Text>
                {!filters.partyId ? (
                  <Ionicons name="checkmark" size={18} color={color.primary} />
                ) : null}
              </Pressable>
              {parties.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setFilters((f) => ({ ...f, partyId: p.id }));
                    setPartyPickerOpen(false);
                  }}
                  style={styles.partyRow}
                >
                  <Text style={styles.partyName}>{p.name}</Text>
                  {filters.partyId === p.id ? (
                    <Ionicons name="checkmark" size={18} color={color.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Date picker — Android shows native dialog (auto-closes); iOS uses an
          inline calendar inside a modal sheet so we get an explicit Done button. */}
      {datePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          value={(datePicker === 'from' ? filters.dateFrom : filters.dateTo) ?? new Date()}
          mode="date"
          display="default"
          onChange={(_, d) => {
            const which = datePicker;
            setDatePicker(null);
            if (d) {
              setFilters((f) => ({
                ...f,
                ...(which === 'from' ? { dateFrom: d } : { dateTo: d }),
              }));
            }
          }}
        />
      ) : null}

      {Platform.OS === 'ios' && (
        <Modal
          visible={datePicker !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setDatePicker(null)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setDatePicker(null)} />
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {datePicker === 'from' ? 'From Date' : 'To Date'}
                </Text>
                <Pressable onPress={() => setDatePicker(null)} hitSlop={12}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={(datePicker === 'from' ? filters.dateFrom : filters.dateTo) ?? new Date()}
                mode="date"
                display="inline"
                onChange={(_, d) => {
                  if (!d) return;
                  const which = datePicker;
                  setFilters((f) => ({
                    ...f,
                    ...(which === 'from' ? { dateFrom: d } : { dateTo: d }),
                  }));
                }}
              />
            </View>
          </View>
        </Modal>
      )}
    </Screen>
  );
}

function ProjectMultiPicker({
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
  const [draft, setDraft] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState('');

  // Re-sync when sheet opens
  useMemo(() => {
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Projects</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={color.textMuted} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={color.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search projects"
              placeholderTextColor={color.textMuted}
              style={styles.searchInput}
            />
          </View>

          <Pressable
            onPress={() => setDraft(new Set())}
            style={styles.partyRow}
          >
            <Text style={[styles.partyName, { fontWeight: '700' }]}>All projects</Text>
            {allSelected ? (
              <Ionicons name="checkmark-circle" size={18} color={color.primary} />
            ) : (
              <Ionicons name="ellipse-outline" size={18} color={color.textFaint} />
            )}
          </Pressable>

          <ScrollView style={{ maxHeight: 360 }}>
            {filtered.map((p) => {
              const checked = draft.has(p.id);
              return (
                <Pressable key={p.id} onPress={() => toggle(p.id)} style={styles.partyRow}>
                  <Text style={styles.partyName} numberOfLines={1}>{p.name}</Text>
                  <Ionicons
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={checked ? color.primary : color.textFaint}
                  />
                </Pressable>
              );
            })}
            {filtered.length === 0 && (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: color.textMuted }}>No projects found</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable onPress={() => onSave(Array.from(draft))} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>
                {draft.size === 0
                  ? 'Apply (All)'
                  : draft.size === 1
                    ? 'Apply (1 project)'
                    : `Apply (${draft.size} projects)`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterSection}>
      <Text style={styles.filterLabel}>{label}</Text>
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
            style={[styles.chip, sel ? styles.chipActive : undefined]}
          >
            <Text style={sel ? [styles.chipText, styles.chipTextActive] : styles.chipText}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
    gap: 8,
  },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleWrap: { flex: 1 },
  navTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.3,
  },
  navSub: {
    fontFamily: fontFamily.sans,
    fontSize: 9,
    fontWeight: '500',
    color: color.textMuted,
    letterSpacing: 0.6,
    marginTop: 1,
  },

  listContent: {
    padding: 12,
    paddingBottom: 100,
    gap: 8,
  },

  sectionLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '700',
    color: color.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  chipScroll: {
    gap: 6,
    paddingVertical: 6,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  periodChipActive: { backgroundColor: color.primary, borderColor: color.primary },
  periodChipText: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '600',
    color: color.textMuted,
  },
  periodChipTextActive: { color: '#fff' },

  dateRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },

  totalsRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 10 },
  totalCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  totalIn: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  totalOut: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  totalBal: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  totalLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: color.textMuted,
    marginBottom: 4,
  },
  totalValue: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  filterToggleText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
  },
  filterBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
    backgroundColor: color.primary,
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  card: {
    backgroundColor: color.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },

  filterSection: { marginTop: 10 },
  filterLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '700',
    color: color.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: color.primary },
  chipText: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '500',
    color: color.textMuted,
  },
  chipTextActive: { color: color.primary, fontWeight: '600' },

  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pickerBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.text,
    flexShrink: 1,
  },

  clearAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  clearAllText: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.primary,
    fontWeight: '600',
  },

  txnHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 4,
  },
  txnCount: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textMuted,
  },

  txnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.bg,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
    marginBottom: 6,
  },
  txnDateCol: {
    width: 44,
    alignItems: 'center',
  },
  txnDate: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '600',
    color: color.textMuted,
  },
  txnBody: {
    flex: 1,
    minWidth: 0,
  },
  txnTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
  },
  txnProj: {
    fontWeight: '400',
    color: color.textMuted,
    fontSize: 11,
  },
  txnSub: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textMuted,
    marginTop: 2,
  },
  txnAmtCol: {
    alignItems: 'flex-end',
  },
  txnAmt: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
    textAlign: 'center',
  },
  emptyClearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: color.primary,
  },
  emptyClearText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },

  floatingBar: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: color.primary,
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  generateBtnText: {
    color: '#fff',
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
  },

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
    maxHeight: '85%',
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  modalTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
  },
  doneText: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '700',
    color: color.primary,
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  saveBtn: {
    backgroundColor: color.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.text,
    padding: 0,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  partyName: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: color.text,
    flex: 1,
    marginRight: 12,
  },
});
