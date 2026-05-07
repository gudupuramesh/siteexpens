import { router, Stack, useLocalSearchParams } from 'expo-router';
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
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { useProject } from '@/src/features/projects/useProject';
import { useProjectParties } from '@/src/features/parties/useProjectParties';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { generateTransactionReport, type ReportMode } from '@/src/features/transactions/transactionReportPdf';
import {
  TRANSACTION_CATEGORIES,
  PAYMENT_METHODS,
  isTransactionCountedInTotals,
  normalizeTransactionType,
  type TransactionCategory,
  type TransactionType,
  type PaymentMethod,
} from '@/src/features/transactions/types';
import { Screen } from '@/src/ui/Screen';
import { Spinner } from '@/src/ui/Spinner';
import { Text } from '@/src/ui/Text';
import { color, fontFamily } from '@/src/theme/tokens';

type PeriodKey = 'all' | 'today' | 'week' | 'month' | 'lastMonth';

type Filters = {
  type: TransactionType | 'all';
  category: TransactionCategory | 'all';
  paymentMethod: PaymentMethod | 'all';
  partyId: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
};

const EMPTY_FILTERS: Filters = {
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
];

function periodRange(p: PeriodKey): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (p === 'all') return { from: null, to: null };
  if (p === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to: now };
  }
  if (p === 'week') {
    // Monday of the current week → today.
    const d = new Date(now);
    const day = d.getDay(); // 0 = Sunday
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

export default function TransactionReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading: projectLoading } = useProject(id);
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { parties } = useProjectParties(orgId, id);
  const { members } = useOrgMembers(orgId);
  const { data: txns, loading: txnsLoading } = useTransactions(id);

  const [period, setPeriod] = useState<PeriodKey>('all');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
  const [datePicker, setDatePicker] = useState<'from' | 'to' | null>(null);
  const [generating, setGenerating] = useState<'summary' | 'report' | 'custom' | null>(null);

  const memberNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.uid] = m.displayName;
    return map;
  }, [members]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.type !== 'all') n++;
    if (filters.category !== 'all') n++;
    if (filters.paymentMethod !== 'all') n++;
    if (filters.partyId) n++;
    if (filters.dateFrom) n++;
    if (filters.dateTo) n++;
    return n;
  }, [filters]);

  const applyFilters = useCallback(
    (dateOverride?: { from: Date | null; to: Date | null }) => {
      const from = dateOverride ? dateOverride.from : filters.dateFrom;
      const to = dateOverride ? dateOverride.to : filters.dateTo;

      return txns
        .filter(isTransactionCountedInTotals)
        .filter((t) => {
          const tt = normalizeTransactionType(t.type);
          if (filters.type !== 'all' && tt !== filters.type) return false;
          if (filters.category !== 'all' && t.category !== filters.category) return false;
          if (filters.paymentMethod !== 'all' && t.paymentMethod !== filters.paymentMethod) return false;
          if (filters.partyId && t.partyId !== filters.partyId) return false;
          if (from && t.date && t.date.toDate() < from) return false;
          if (to) {
            const end = new Date(to);
            end.setHours(23, 59, 59, 999);
            if (t.date && t.date.toDate() > end) return false;
          }
          return true;
        });
    },
    [txns, filters],
  );

  const handleGenerate = useCallback(
    async (mode: 'summary' | 'report' | 'custom') => {
      if (!project) return;
      setGenerating(mode);
      try {
        const reportMode: ReportMode = mode === 'summary' ? 'summary' : 'report';
        // Period chips drive the date range for the preset cards;
        // custom uses whatever's set in the filter pickers.
        const dateOverride = mode === 'custom' ? undefined : periodRange(period);
        const filtered = applyFilters(dateOverride);
        const dateFrom = dateOverride ? dateOverride.from : filters.dateFrom;
        const dateTo = dateOverride ? dateOverride.to : filters.dateTo;

        await generateTransactionReport({
          project,
          transactions: filtered,
          orgId,
          mode: reportMode,
          dateFrom,
          dateTo,
          memberNames,
        });
      } catch (e) {
        Alert.alert('Could not generate PDF', e instanceof Error ? e.message : String(e));
      } finally {
        setGenerating(null);
      }
    },
    [project, orgId, period, filters, applyFilters, memberNames],
  );

  if (projectLoading || !project) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <Spinner size={28} />
        </View>
      </Screen>
    );
  }

  const selectedParty = filters.partyId
    ? parties.find((p) => p.id === filters.partyId)
    : null;

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.navBackBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={color.textMuted} />
        </Pressable>
        <View style={styles.navTitleWrap}>
          <Text style={styles.navTitle} numberOfLines={1}>Payment Report</Text>
          <Text style={styles.navSub} numberOfLines={1}>
            {project.name.toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Period quick chips */}
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
                  style={sel ? [styles.periodChipText, styles.periodChipTextActive] : styles.periodChipText}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Two preset report cards */}
        <View style={styles.presetRow}>
          <Pressable
            onPress={() => handleGenerate('summary')}
            disabled={generating !== null || txnsLoading}
            style={({ pressed }) => [
              styles.presetCard,
              pressed && { opacity: 0.85 },
              generating === 'summary' && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.presetIcon, { backgroundColor: '#EFF6FF' }]}>
              {generating === 'summary' ? (
                <ActivityIndicator size="small" color={color.primary} />
              ) : (
                <Ionicons name="pie-chart-outline" size={20} color={color.primary} />
              )}
            </View>
            <Text style={styles.presetTitle}>Payment Summary</Text>
            <Text style={styles.presetDesc}>Categories & methods</Text>
          </Pressable>

          <Pressable
            onPress={() => handleGenerate('report')}
            disabled={generating !== null || txnsLoading}
            style={({ pressed }) => [
              styles.presetCard,
              pressed && { opacity: 0.85 },
              generating === 'report' && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.presetIcon, { backgroundColor: '#ECFDF5' }]}>
              {generating === 'report' ? (
                <ActivityIndicator size="small" color="#0F9D58" />
              ) : (
                <Ionicons name="document-text-outline" size={20} color="#0F9D58" />
              )}
            </View>
            <Text style={styles.presetTitle}>Payment Report</Text>
            <Text style={styles.presetDesc}>Full ledger</Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or customize</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Custom filter controls */}
        <View style={styles.card}>
          <FilterSection label="Type">
            <ChipRow
              options={[
                { key: 'all', label: 'All' },
                { key: 'payment_in', label: 'Payment In' },
                { key: 'payment_out', label: 'Payment Out' },
              ]}
              value={filters.type}
              onChange={(v) => setFilters((f) => ({ ...f, type: v as TransactionType | 'all' }))}
            />
          </FilterSection>

          <FilterSection label="Category">
            <ChipRow
              options={[
                { key: 'all', label: 'All' },
                ...TRANSACTION_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
              ]}
              value={filters.category}
              onChange={(v) => setFilters((f) => ({ ...f, category: v as TransactionCategory | 'all' }))}
            />
          </FilterSection>

          <FilterSection label="Payment Method">
            <ChipRow
              options={[
                { key: 'all', label: 'All' },
                ...PAYMENT_METHODS.map((m) => ({ key: m.key, label: m.label })),
              ]}
              value={filters.paymentMethod}
              onChange={(v) => setFilters((f) => ({ ...f, paymentMethod: v as PaymentMethod | 'all' }))}
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
                <Ionicons name="chevron-forward" size={14} color={color.textFaint} style={{ marginLeft: 'auto' }} />
              )}
            </Pressable>
          </FilterSection>

          <FilterSection label="Custom Date Range">
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
          </FilterSection>

          {activeFilterCount > 0 ? (
            <Pressable
              onPress={() => setFilters(EMPTY_FILTERS)}
              hitSlop={6}
              style={styles.clearAll}
            >
              <Ionicons name="close-circle-outline" size={14} color={color.primary} />
              <Text style={styles.clearAllText}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Custom Generate PDF button */}
        <Pressable
          onPress={() => handleGenerate('custom')}
          disabled={generating !== null || txnsLoading}
          style={({ pressed }) => [
            styles.generateBtn,
            pressed && { opacity: 0.85 },
            (generating === 'custom' || txnsLoading) && { opacity: 0.6 },
          ]}
        >
          {generating === 'custom' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="document-outline" size={16} color="#fff" />
          )}
          <Text style={styles.generateBtnText}>
            {generating === 'custom' ? 'Generating…' : 'Generate Custom Report'}
          </Text>
        </Pressable>
      </ScrollView>

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
            <ScrollView style={{ maxHeight: 400 }}>
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

      {/* Date picker */}
      {datePicker ? (
        <DateTimePicker
          value={
            (datePicker === 'from' ? filters.dateFrom : filters.dateTo) ?? new Date()
          }
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, d) => {
            const which = datePicker;
            if (Platform.OS === 'android') setDatePicker(null);
            if (d) {
              setFilters((f) => ({
                ...f,
                ...(which === 'from' ? { dateFrom: d } : { dateTo: d }),
              }));
            }
            if (Platform.OS === 'ios') setDatePicker(null);
          }}
        />
      ) : null}
    </Screen>
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  navBackBtn: {
    width: 32,
    height: 32,
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
    fontSize: 10,
    fontWeight: '500',
    color: color.textMuted,
    letterSpacing: 0.6,
    marginTop: 1,
  },

  body: {
    padding: 12,
    paddingBottom: 40,
    gap: 10,
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
    paddingVertical: 2,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  periodChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  periodChipText: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '600',
    color: color.textMuted,
  },
  periodChipTextActive: {
    color: '#fff',
  },

  // Preset cards
  presetRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  presetCard: {
    flex: 1,
    backgroundColor: color.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 8,
  },
  presetIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '700',
    color: color.text,
    textAlign: 'center',
  },
  presetDesc: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textMuted,
    textAlign: 'center',
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
  },
  dividerText: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textMuted,
    fontWeight: '500',
  },

  card: {
    backgroundColor: color.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // Filter controls
  filterSection: {
    marginTop: 10,
  },
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
  chipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: color.primary,
  },
  chipText: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '500',
    color: color.textMuted,
  },
  chipTextActive: {
    color: color.primary,
    fontWeight: '600',
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: color.bg,
  },
  pickerBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.text,
  },
  dateRow: { flexDirection: 'row', gap: 8 },
  clearAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    alignSelf: 'flex-start',
  },
  clearAllText: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '600',
    color: color.primary,
  },

  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: color.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  generateBtnText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // Party modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: color.borderStrong,
    marginTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
  },
  modalTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  partyName: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    color: color.text,
  },
});
