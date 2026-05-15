/**
 * CRM tab — v2 design (Leads · Appointments · Quotation · Invoice).
 *
 * Layout (top → bottom):
 *   1. Inline header — "CRM" title (left) + OrgSwitcher chip (right)
 *   2. Sub-tabs strip — Leads · Appointments · Quotation · Invoice
 *   3. KPI strip (3 small tiles): Pipeline · Hot · Conversion
 *   4. Search bar
 *   5. Status filter chips (horizontal scroll, only visible on Leads)
 *   6. List of LeadCards (or AppointmentCards / Coming-soon)
 *   7. Footer: "{N} leads · Synced just now"
 *   8. FAB (+) — context-aware: New lead on Leads, New appointment on Appointments
 *
 * The bottom floating tab bar is rendered by `(tabs)/_layout.tsx` via
 * `<AppTabBar>`, so this screen does NOT render its own.
 */
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppointments } from '@/src/features/crm/useAppointments';
import { useLeads } from '@/src/features/crm/useLeads';
import {
  type Appointment,
  type AppointmentStatus,
  type Lead,
  type LeadPriority,
  type LeadStatus,
  getLeadSourceLabel,
} from '@/src/features/crm/types';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import {
  AppointmentCard,
  type AppointmentCardData,
} from '@/src/ui/v2/AppointmentCard';
import { FAB } from '@/src/ui/v2/FAB';
import { FilterChip } from '@/src/ui/v2/FilterChip';
import { KpiCard } from '@/src/ui/v2/KpiCard';
import {
  LeadCard,
  type LeadCardData,
  type LeadCardPriority,
  type LeadCardStage,
} from '@/src/ui/v2/LeadCard';
import { OrgSwitcher } from '@/src/ui/v2/OrgSwitcher';
import { SearchBar } from '@/src/ui/v2/SearchBar';
import { SubTabs } from '@/src/ui/v2/SubTabs';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

// ── Sub-tab keys ────────────────────────────────────────────────────

type SubTabKey = 'leads' | 'appointments' | 'quotation' | 'invoice';
const SUB_TABS: { key: SubTabKey; label: string }[] = [
  { key: 'leads',        label: 'Leads' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'quotation',    label: 'Quotation' },
  { key: 'invoice',      label: 'Invoice' },
];

// ── Filter for Leads sub-tab ────────────────────────────────────────

type LeadFilterKey = 'all' | LeadStatus;

const LEAD_FILTERS: { key: LeadFilterKey; label: string }[] = [
  { key: 'all',                  label: 'All' },
  { key: 'new',                  label: 'New' },
  { key: 'contacted',            label: 'Contacted' },
  { key: 'site_visit_scheduled', label: 'Site visit' },
  { key: 'proposal_sent',        label: 'Proposal' },
  { key: 'negotiation',          label: 'Negotiation' },
  { key: 'converted',            label: 'Won' },
];

// ── Filter for Appointments sub-tab ────────────────────────────────

type ApptFilterKey = 'all' | AppointmentStatus;

const APPT_FILTERS: { key: ApptFilterKey; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'no_show',   label: 'No show' },
];

// ── Helpers ─────────────────────────────────────────────────────────

function priorityToCard(p: LeadPriority): LeadCardPriority {
  if (p === 'high') return 'high';
  if (p === 'low') return 'low';
  return 'medium';
}

function stageToCard(s: LeadStatus): LeadCardStage {
  switch (s) {
    case 'new': return 'new';
    case 'contacted': return 'contacted';
    case 'site_visit_scheduled': return 'site_visit';
    case 'proposal_sent': return 'proposal';
    case 'negotiation': return 'negotiation';
    case 'converted': return 'won';
    case 'lost': return 'lost';
  }
}

function relCreated(ts: Lead['createdAt']): string {
  if (!ts) return '—';
  const d = ts.toDate();
  const ms = Date.now() - d.getTime();
  const days = Math.round(ms / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  return `${Math.round(days / 365)} y ago`;
}

function followUpOverdueLabel(ts: Lead['followUpAt']): string | undefined {
  if (!ts) return undefined;
  const target = ts.toDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t0 = new Date(target);
  t0.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - t0.getTime()) / 86_400_000);
  if (days <= 0) return undefined; // not overdue
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

/** Compact INR for the Pipeline KPI value. */
function inrCompactPipeline(amount: number): string {
  if (amount <= 0) return '₹0';
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)} Cr`;
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)} L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}k`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

// ── Phone helpers (mirror production) ───────────────────────────────

function dialPhone(phone: string) {
  if (!phone) return;
  const cleaned = phone.replace(/[^0-9+]/g, '');
  void Linking.openURL(`tel:${cleaned}`);
}
function whatsappPhone(phone: string) {
  if (!phone) return;
  const cleaned = phone.replace(/[^0-9]/g, '');
  void Linking.openURL(`https://wa.me/${cleaned}`);
}

// ── Screen ──────────────────────────────────────────────────────────

export default function CrmTabScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const refresh = usePullToRefresh();

  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;

  const { data: leads, loading: leadsLoading } = useLeads(orgId);
  const { data: appointments, loading: appointmentsLoading } = useAppointments(orgId);

  const [subTab, setSubTab] = useState<SubTabKey>('leads');
  const [filter, setFilter] = useState<LeadFilterKey>('all');
  const [apptFilter, setApptFilter] = useState<ApptFilterKey>('all');
  const [query, setQuery] = useState('');

  // Counts per filter, used as badges on the chips
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: leads.length };
    for (const l of leads) {
      m[l.status] = (m[l.status] ?? 0) + 1;
    }
    return m;
  }, [leads]);

  // KPI metrics derived from leads
  const kpi = useMemo(() => {
    const open = leads.filter((l) => l.status !== 'converted' && l.status !== 'lost');
    const pipeline = open.reduce((sum, l) => sum + (l.budget ?? 0), 0);
    const hot = open.filter((l) => l.priority === 'high').length;
    const won = leads.filter((l) => l.status === 'converted').length;
    const total = leads.length;
    const conversionPct = total > 0 ? Math.round((won / total) * 100) : 0;
    return { pipeline, hot, won, conversionPct, openCount: open.length };
  }, [leads]);

  // Filtered + searched leads list
  const visibleLeads = useMemo(() => {
    let list = leads;
    if (filter !== 'all') list = list.filter((l) => l.status === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.toLowerCase().includes(q) ||
          (l.location ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [leads, filter, query]);

  // ── Appointments derivations ─────────────────────────────────────

  // Counts per appointment-filter, used as badges on the chips
  const apptCounts = useMemo(() => {
    const m: Record<string, number> = { all: appointments.length };
    for (const a of appointments) {
      m[a.status] = (m[a.status] ?? 0) + 1;
    }
    return m;
  }, [appointments]);

  // KPI metrics derived from appointments
  // - Today: scheduled today (any status)
  // - This week: scheduled in the next 7 days from today (any status)
  // - Past due: status === 'scheduled' AND scheduledAt < now
  const apptKpi = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const inAWeek = new Date(today.getTime() + 7 * 86_400_000);

    let todayCount = 0;
    let weekCount = 0;
    let pastDueCount = 0;

    for (const a of appointments) {
      const at = a.scheduledAt?.toDate();
      if (!at) continue;
      const ms = at.getTime();
      if (ms >= today.getTime() && ms < tomorrow.getTime()) todayCount++;
      if (ms >= today.getTime() && ms < inAWeek.getTime()) weekCount++;
      if (a.status === 'scheduled' && ms < Date.now()) pastDueCount++;
    }
    return { todayCount, weekCount, pastDueCount };
  }, [appointments]);

  // Filtered + searched appointments list
  const visibleAppointments = useMemo(() => {
    let list = appointments;
    if (apptFilter !== 'all') list = list.filter((a) => a.status === apptFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          (a.title ?? '').toLowerCase().includes(q) ||
          (a.clientName ?? '').toLowerCase().includes(q) ||
          (a.location ?? '').toLowerCase().includes(q) ||
          (a.clientPhone ?? '').toLowerCase().includes(q),
      );
    }
    // Sort by scheduledAt asc, missing dates at the end
    list = [...list].sort((a, b) => {
      const ax = a.scheduledAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      const bx = b.scheduledAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      return ax - bx;
    });
    return list;
  }, [appointments, apptFilter, query]);

  // Map an Appointment → AppointmentCardData for the card component.
  // (Address intentionally NOT passed — the compact card shows only key
  // details: title, datetime, duration, withName, status, call action.)
  const toApptCardData = (a: Appointment): AppointmentCardData => {
    const lead = a.leadId ? leads.find((l) => l.id === a.leadId) : undefined;
    return {
      id: a.id,
      title: a.title || 'Appointment',
      type: a.type,
      status: a.status,
      scheduledAt: a.scheduledAt?.toDate() ?? null,
      durationMins: a.durationMins,
      withName: a.clientName ?? lead?.name,
      phone: a.clientPhone ?? lead?.phone,
    };
  };

  // Map a Lead → LeadCardData for the card component
  const toCardData = (l: Lead): LeadCardData => ({
    id: l.id,
    initial: (l.name?.[0] ?? '?').toUpperCase(),
    name: l.name,
    sub: [l.projectType ? l.projectType.toUpperCase() : null, l.location].filter(Boolean).join(' · ') || undefined,
    priority: priorityToCard(l.priority),
    stage: stageToCard(l.status),
    budget: l.budget,
    source: l.source ? getLeadSourceLabel(l.source) : undefined,
    ageLabel: relCreated(l.createdAt),
    overdueLabel: followUpOverdueLabel(l.followUpAt),
  });

  // FAB action depends on the active sub-tab
  const onFabPress = () => {
    if (subTab === 'leads') router.push('/(app)/crm/add-lead' as never);
    else if (subTab === 'appointments') router.push('/(app)/crm/add-appointment' as never);
    // Quotation / Invoice are placeholder tabs — FAB is hidden in those (handled below)
  };

  const showFab = subTab === 'leads' || subTab === 'appointments';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <AmbientBackground />

      {/* Single-line header: "CRM" title (left) + OrgSwitcher chip (right) */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text variant="title2" color="label" style={{ fontWeight: '700' }}>
          CRM
        </Text>
        <OrgSwitcher />
      </View>

      {/* Sub-tabs strip */}
      <SubTabs items={SUB_TABS} selected={subTab} onChange={(k) => setSubTab(k)} />

      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: t.region.tabBarBuffer + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl {...refresh.props} />}
      >
        {/* KPI strip — Leads tab shows pipeline/hot/conversion;
            Appointments tab shows today/week/past-due. */}
        {subTab === 'leads' ? (
          <View style={styles.kpiRow}>
            <KpiCard
              caption="Pipeline"
              value={inrCompactPipeline(kpi.pipeline)}
              icon="cube-outline"
              sub={`${kpi.openCount} open`}
            />
            <KpiCard
              caption="Hot"
              value={String(kpi.hot)}
              icon="flash-outline"
              sub="follow-up"
            />
            <KpiCard
              caption="Conversion"
              value={`${kpi.conversionPct}%`}
              icon="checkmark-outline"
              sub={`${kpi.won} won`}
            />
          </View>
        ) : subTab === 'appointments' ? (
          <View style={styles.kpiRow}>
            <KpiCard
              caption="Today"
              value={String(apptKpi.todayCount)}
              icon="today-outline"
              sub="scheduled"
            />
            <KpiCard
              caption="This week"
              value={String(apptKpi.weekCount)}
              icon="calendar-outline"
              sub="next 7 days"
            />
            <KpiCard
              caption="Past due"
              value={String(apptKpi.pastDueCount)}
              icon="alert-circle-outline"
              sub="needs action"
            />
          </View>
        ) : null}

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder={
              subTab === 'leads'
                ? 'Search leads, phone, location'
                : subTab === 'appointments'
                  ? 'Search appointments'
                  : 'Search'
            }
          />
        </View>

        {/* Filter chips — Leads → status chips, Appointments → status chips. */}
        {subTab === 'leads' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            {LEAD_FILTERS.map((opt) => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                count={counts[opt.key] ?? 0}
                selected={filter === opt.key}
                onPress={() => setFilter(opt.key)}
              />
            ))}
          </ScrollView>
        ) : subTab === 'appointments' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            {APPT_FILTERS.map((opt) => (
              <FilterChip
                key={opt.key}
                label={opt.label}
                count={apptCounts[opt.key] ?? 0}
                selected={apptFilter === opt.key}
                onPress={() => setApptFilter(opt.key)}
              />
            ))}
          </ScrollView>
        ) : null}

        {/* Body */}
        <View style={styles.body}>
          {subTab === 'leads' ? (
            leadsLoading && leads.length === 0 ? (
              <EmptyOrLoading icon="hourglass-outline" title="Loading leads…" />
            ) : visibleLeads.length === 0 ? (
              <EmptyOrLoading
                icon="people-outline"
                title={query || filter !== 'all' ? 'No matching leads' : 'No leads yet'}
                cta={
                  !query && filter === 'all'
                    ? { label: 'Add your first lead', onPress: () => router.push('/(app)/crm/add-lead' as never) }
                    : undefined
                }
              />
            ) : (
              <>
                <View style={styles.list}>
                  {visibleLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={toCardData(lead)}
                      onPress={() => router.push(`/(app)/crm/lead/${lead.id}` as never)}
                      onCall={() => dialPhone(lead.phone)}
                      onWhatsApp={() => whatsappPhone(lead.phone)}
                    />
                  ))}
                </View>
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={styles.footerLine}
                >
                  {visibleLeads.length} {visibleLeads.length === 1 ? 'lead' : 'leads'} · Synced just now
                </Text>
              </>
            )
          ) : subTab === 'appointments' ? (
            appointmentsLoading && appointments.length === 0 ? (
              <EmptyOrLoading icon="hourglass-outline" title="Loading appointments…" />
            ) : visibleAppointments.length === 0 ? (
              <EmptyOrLoading
                icon="calendar-outline"
                title={
                  query || apptFilter !== 'all'
                    ? 'No matching appointments'
                    : 'No appointments yet'
                }
                cta={
                  !query && apptFilter === 'all'
                    ? {
                        label: 'Schedule your first one',
                        onPress: () => router.push('/(app)/crm/add-appointment' as never),
                      }
                    : undefined
                }
              />
            ) : (
              <>
                <View style={styles.list}>
                  {visibleAppointments.map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appointment={toApptCardData(appt)}
                      onPress={() =>
                        router.push(`/(app)/crm/appointment/${appt.id}` as never)
                      }
                      onCall={() => {
                        const phone = appt.clientPhone
                          ?? (appt.leadId ? leads.find((l) => l.id === appt.leadId)?.phone : undefined);
                        if (phone) dialPhone(phone);
                      }}
                    />
                  ))}
                </View>
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={styles.footerLine}
                >
                  {visibleAppointments.length}{' '}
                  {visibleAppointments.length === 1 ? 'appointment' : 'appointments'} · Synced just now
                </Text>
              </>
            )
          ) : (
            <ComingSoon
              icon={subTab === 'quotation' ? 'document-text-outline' : 'receipt-outline'}
              title={subTab === 'quotation' ? 'Quotation' : 'Invoice'}
              message={
                subTab === 'quotation'
                  ? 'Generate quotations from leads, send via WhatsApp, and convert won quotations to projects in one tap.'
                  : 'GST-ready invoices linked to projects and parties — track paid · partial · pending against the project ledger.'
              }
            />
          )}
        </View>
      </ScrollView>

      {/* FAB — context-aware */}
      {showFab ? (
        <FAB
          icon="add"
          onPress={onFabPress}
          accessibilityLabel={subTab === 'leads' ? 'New lead' : 'New appointment'}
        />
      ) : null}
    </View>
  );
}

// ── Empty / Coming-soon ─────────────────────────────────────────────

function EmptyOrLoading({
  icon,
  title,
  cta,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  cta?: { label: string; onPress: () => void };
}) {
  const t = useThemeV2();
  return (
    <View style={styles.emptyWrap}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: t.colors.fill3, borderRadius: t.radii.tile },
        ]}
      >
        <Ionicons name={icon} size={28} color={t.colors.tertiary} />
      </View>
      <Text variant="headline" color="label" style={{ marginTop: 14 }}>
        {title}
      </Text>
      {cta ? (
        <Pressable onPress={cta.onPress} hitSlop={6} style={{ marginTop: 8 }}>
          <Text variant="footnote" style={{ color: t.palette.blue.base, fontWeight: '600' }}>
            {cta.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ComingSoon({
  icon,
  title,
  message,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
}) {
  const t = useThemeV2();
  return (
    <View style={styles.emptyWrap}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: t.palette.blue.soft, borderRadius: t.radii.tile },
        ]}
      >
        <Ionicons name={icon} size={28} color={t.palette.blue.base} />
      </View>
      <Text variant="headline" color="label" style={{ marginTop: 14 }}>
        {title}
      </Text>
      <View style={[styles.csBadge, { backgroundColor: t.palette.blue.base }]}>
        <Text style={styles.csBadgeText}>COMING SOON</Text>
      </View>
      <Text
        variant="footnote"
        color="secondary"
        style={{ marginTop: 8, textAlign: 'center', maxWidth: 320 }}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingTop: 0,
  },

  // Single-line header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },

  // KPI strip
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // Filter chips
  filtersRow: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Body
  body: {
    paddingTop: 14,
  },
  list: {
    paddingHorizontal: 12,
    gap: 10,
  },

  // Footer
  footerLine: {
    paddingHorizontal: 20,
    paddingTop: 16,
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Empty / coming-soon
  emptyWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  csBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  csBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
});
