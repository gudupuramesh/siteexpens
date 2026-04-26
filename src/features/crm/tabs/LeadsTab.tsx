/**
 * Leads tab — InteriorOS-styled pipeline screen.
 *
 * 1:1 with `interior os/src/screens-leads.jsx > LeadsPanel`:
 *   - KPI cards (Pipeline / Hot / Conv) with corner icons + compact INR
 *   - Search bar + list/board view toggle
 *   - Rounded stage filter chips with counts
 *   - List cards: tinted-by-name avatar, score pill, status pill,
 *     BUDGET · SOURCE · CREATED meta strip, Call + WhatsApp actions
 *   - Board cards (kanban) with stage dots + per-stage totals
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LEAD_STATUSES,
  type Lead,
  type LeadStatus,
  getLeadStatusLabel,
  getLeadSourceLabel,
} from '@/src/features/crm/types';
import { useLeads } from '@/src/features/crm/useLeads';
import { AlertSheet } from '@/src/ui/io';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';
import { fontFamily } from '@/src/theme/tokens';

type FilterKey = 'all' | LeadStatus;

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  ...LEAD_STATUSES.map((s) => ({ key: s.key, label: s.label })),
];

// ── Helpers ────────────────────────────────────────────────────────────────

/** Compact INR like ₹1.32Cr / ₹25.5L / ₹9,000. */
function inrCompact(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount) || amount <= 0) return '—';
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`;
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** Relative date like "-3 days ago" / "today". Lives only here for now. */
function relDate(ts: Lead['createdAt']): string {
  if (!ts) return '—';
  const d = ts.toDate();
  const ms = Date.now() - d.getTime();
  const days = Math.round(ms / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  return `${Math.round(days / 365)} y ago`;
}

/** Forward-looking version: "today", "tomorrow", "in 3 days", "5 days ago". */
function followUpRel(ts: Lead['followUpAt']): { label: string; days: number } | null {
  if (!ts) return null;
  const target = ts.toDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t0 = new Date(target);
  t0.setHours(0, 0, 0, 0);
  const days = Math.round((t0.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { label: 'today', days };
  if (days === 1) return { label: 'tomorrow', days };
  if (days === -1) return { label: 'yesterday', days };
  if (days > 0) return { label: `in ${days} days`, days };
  return { label: `${Math.abs(days)} days ago`, days };
}

/** True when followUpAt is **before today** and the lead is still active.
 *  Same-day follow-ups (any time today) are NOT overdue — they're due today. */
function isOverdue(lead: Lead): boolean {
  if (!lead.followUpAt) return false;
  if (lead.status === 'converted' || lead.status === 'lost') return false;
  const fu = lead.followUpAt.toDate();
  fu.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return fu.getTime() < today.getTime();
}

/** Calendar-day delta between today (start of day) and a follow-up date.
 *  Returns 0 when the follow-up is today, positive when overdue. */
function daysOverdueFor(ts: Lead['followUpAt']): number {
  if (!ts) return 0;
  const fu = ts.toDate();
  fu.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - fu.getTime()) / 86_400_000));
}

const AVATAR_PALETTE: { bg: string; fg: string }[] = [
  { bg: '#EDE9FE', fg: '#6D28D9' }, // violet
  { bg: '#CCFBF1', fg: '#0F766E' }, // teal
  { bg: '#FEF3C7', fg: '#B45309' }, // amber
  { bg: '#FFE4E6', fg: '#BE123C' }, // rose
  { bg: '#DBEAFE', fg: '#1D4ED8' }, // indigo / blue
  { bg: '#DCFCE7', fg: '#15803D' }, // emerald
];

function avatarTone(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function statusTone(status: LeadStatus): { bg: string; fg: string } {
  switch (status) {
    case 'new': return { bg: color.infoSoft, fg: color.primary };
    case 'contacted': return { bg: color.surfaceAlt, fg: color.textMuted };
    case 'site_visit_scheduled': return { bg: color.successSoft, fg: color.success };
    case 'proposal_sent': return { bg: color.warningSoft, fg: color.warning };
    case 'negotiation': return { bg: color.warningSoft, fg: color.warning };
    case 'converted': return { bg: color.successSoft, fg: color.success };
    case 'lost': return { bg: color.dangerSoft, fg: color.danger };
    default: return { bg: color.surfaceAlt, fg: color.textMuted };
  }
}

function priorityTone(priority: Lead['priority']): { bg: string; fg: string; label: string } {
  switch (priority) {
    case 'high': return { bg: color.dangerSoft, fg: color.danger, label: 'High' };
    case 'medium': return { bg: color.warningSoft, fg: color.warning, label: 'Medium' };
    default: return { bg: color.surfaceAlt, fg: color.textMuted, label: 'Low' };
  }
}

function dialPhone(phone: string | undefined) {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
}

function whatsappPhone(phone: string | undefined) {
  if (!phone) return;
  const clean = phone.replace(/[^\d]/g, '');
  Linking.openURL(`https://wa.me/${clean}`).catch(() => {});
}

// ── List card ─────────────────────────────────────────────────────────────

function LeadListCard({ item }: { item: Lead }) {
  const initial = item.name.charAt(0).toUpperCase();
  const statusLabel = getLeadStatusLabel(item.status);
  const status = statusTone(item.status);
  const score = priorityTone(item.priority);
  const av = avatarTone(item.name);
  const created = relDate(item.createdAt);
  const budget = inrCompact(item.budget);
  const overdue = isOverdue(item);
  const followUp = followUpRel(item.followUpAt);
  const daysLate = overdue ? daysOverdueFor(item.followUpAt) : 0;
  const [alertOpen, setAlertOpen] = useState(false);

  const lateLine =
    daysLate === 1
      ? `${item.name}'s follow-up was due yesterday.`
      : `${item.name}'s follow-up was due ${daysLate} days ago.`;

  return (
    <Pressable
      onPress={() => router.push(`/(app)/crm/lead/${item.id}` as never)}
      style={({ pressed }) => [
        styles.leadCard,
        overdue && styles.leadCardOverdue,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.leadCardHeader}>
        <View style={[styles.avatar, { backgroundColor: av.bg }]}>
          <RNText style={[styles.avatarText, { color: av.fg }]}>{initial}</RNText>
        </View>
        <View style={styles.leadBody}>
          <View style={styles.titleRow}>
            <RNText style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </RNText>
            <View style={[styles.scorePill, { backgroundColor: score.bg }]}>
              <View style={[styles.scoreDot, { backgroundColor: score.fg }]} />
              <RNText style={[styles.pillText, { color: score.fg }]}>{score.label}</RNText>
            </View>
            {overdue ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setAlertOpen(true);
                }}
                hitSlop={6}
                style={styles.overdueChip}
              >
                <Ionicons name="alert-circle" size={11} color="#fff" />
                <RNText style={styles.overdueChipText}>OVERDUE</RNText>
              </Pressable>
            ) : null}
          </View>
          <RNText style={styles.cardSub} numberOfLines={1}>
            {item.projectType ?? 'Project'} · {item.location ?? 'Unknown city'}
          </RNText>
        </View>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <View style={[styles.scoreDot, { backgroundColor: status.fg }]} />
          <RNText style={[styles.pillText, { color: status.fg }]}>{statusLabel}</RNText>
        </View>
      </View>

      <View style={styles.metaStrip}>
        <View style={styles.metaCol}>
          <RNText style={styles.metaLabel}>BUDGET</RNText>
          <RNText style={styles.metaValue}>{budget}</RNText>
        </View>
        <View style={styles.metaCol}>
          <RNText style={styles.metaLabel}>
            {followUp ? 'FOLLOW-UP' : 'SOURCE'}
          </RNText>
          <RNText
            style={
              overdue
                ? [styles.metaValue, { color: color.danger, fontWeight: '700' }]
                : styles.metaValue
            }
          >
            {followUp ? followUp.label : getLeadSourceLabel(item.source)}
          </RNText>
        </View>
        <View style={styles.metaCol}>
          <RNText style={styles.metaLabel}>CREATED</RNText>
          <RNText style={styles.metaValue}>{created}</RNText>
        </View>
        <View style={styles.actionCol}>
          <Pressable
            hitSlop={6}
            onPress={(e) => { e.stopPropagation(); dialPhone(item.phone); }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
            accessibilityLabel="Call lead"
          >
            <Ionicons name="call-outline" size={14} color={color.text} />
          </Pressable>
          <Pressable
            hitSlop={6}
            onPress={(e) => { e.stopPropagation(); whatsappPhone(item.phone); }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}
            accessibilityLabel="WhatsApp lead"
          >
            <Ionicons name="logo-whatsapp" size={14} color={color.text} />
          </Pressable>
        </View>
      </View>

      {item.notes ? (
        <View style={styles.noteBox}>
          <RNText style={styles.noteText} numberOfLines={2}>
            {item.notes}
          </RNText>
        </View>
      ) : null}

      <AlertSheet
        visible={alertOpen}
        onClose={() => setAlertOpen(false)}
        tone="danger"
        icon="alert-circle"
        title="Follow-up overdue"
        message={`${lateLine}\n\nReach out today or push the follow-up date so the lead stays warm.`}
        actions={[
          { label: 'Dismiss', variant: 'default' },
          {
            label: 'Open lead',
            variant: 'primary',
            onPress: () => router.push(`/(app)/crm/lead/${item.id}` as never),
          },
        ]}
      />
    </Pressable>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────

type Props = {
  orgId: string | undefined;
};

export function LeadsTab({ orgId }: Props) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const { data: leads, loading } = useLeads(orgId);

  const filtered = useMemo(() => {
    let out = leads;
    if (filter !== 'all') out = out.filter((l) => l.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((l) =>
        `${l.name} ${l.phone} ${l.location ?? ''} ${l.notes ?? ''} ${l.source}`.toLowerCase().includes(q),
      );
    }
    return out;
  }, [leads, filter, search]);

  const pipelineValue = useMemo(() => leads
    .filter((l) => l.status !== 'lost' && l.status !== 'converted')
    .reduce((sum, l) => sum + (l.budget ?? 0), 0), [leads]);
  const openCount = useMemo(() => leads
    .filter((l) => l.status !== 'lost' && l.status !== 'converted').length, [leads]);
  const hot = useMemo(() => leads
    .filter((l) => l.priority === 'high' && l.status !== 'lost' && l.status !== 'converted').length, [leads]);
  const won = useMemo(() => leads.filter((l) => l.status === 'converted').length, [leads]);
  const conv = leads.length > 0 ? Math.round((won / leads.length) * 100) : 0;

  return (
    <View style={styles.flex}>
      {/* ── KPI grid — Pipeline / Hot / Conv (compact) */}
      <View style={styles.headerBlock}>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiHead}>
              <Text variant="caption" color="textMuted" style={styles.kpiCaption}>PIPELINE</Text>
              <Ionicons name="ellipse-outline" size={10} color={color.textFaint} />
            </View>
            <Text variant="bodyStrong" color="text" style={styles.kpiValue}>
              {inrCompact(pipelineValue)}
            </Text>
            <Text variant="caption" color="textMuted" style={styles.kpiSub}>{openCount} open</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiHead}>
              <Text variant="caption" color="textMuted" style={styles.kpiCaption}>HOT</Text>
              <Ionicons name="flame-outline" size={10} color={color.danger} />
            </View>
            <Text variant="bodyStrong" color="danger" style={styles.kpiValue}>{hot}</Text>
            <Text variant="caption" color="textMuted" style={styles.kpiSub}>needs follow-up</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiHead}>
              <Text variant="caption" color="textMuted" style={styles.kpiCaption}>CONV</Text>
              <Ionicons name="checkmark-circle-outline" size={10} color={color.success} />
            </View>
            <Text variant="bodyStrong" color="success" style={styles.kpiValue}>{conv}%</Text>
            <Text variant="caption" color="textMuted" style={styles.kpiSub}>{won} won this Q</Text>
          </View>
        </View>
      </View>

      {/* ── Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={14} color={color.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search leads..."
            placeholderTextColor={color.textFaint}
            style={styles.searchInput}
          />
        </View>
      </View>

      {/* ── Stage filter chips */}
      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.key;
            const count = opt.key === 'all'
              ? leads.length
              : leads.filter((l) => l.status === opt.key).length;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setFilter(opt.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  variant="meta"
                  style={{
                    color: active ? color.onPrimary : color.text,
                    fontSize: 12,
                    lineHeight: 14,
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  variant="caption"
                  style={{
                    color: active ? color.onPrimary : color.textFaint,
                    marginLeft: 4,
                    fontSize: 10,
                    lineHeight: 12,
                  }}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Body */}
      {loading && leads.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">
            Loading leads…
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={32} color={color.textFaint} />
          <Text variant="body" color="textMuted" align="center" style={styles.sub}>
            {filter === 'all'
              ? 'Add leads from walk-ins, Instagram, referrals and more.'
              : 'No leads in this stage yet.'}
          </Text>
          <Pressable onPress={() => router.push('/(app)/crm/add-lead' as never)}>
            <Text variant="metaStrong" color="primary">
              Add your first lead
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <LeadListCard item={item} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/(app)/crm/add-lead' as never);
        }}
        style={({ pressed }) => [
          styles.fab,
          { bottom: 24 + insets.bottom },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add lead"
      >
        <Ionicons name="add" size={26} color={color.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // ── Header (just the KPI grid now)
  headerBlock: {
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },

  // KPI grid (compact)
  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 56,
  },
  kpiHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  kpiCaption: { fontSize: 9, lineHeight: 11, letterSpacing: 0.4 },
  kpiValue: { fontSize: 14, lineHeight: 16, marginBottom: 1 },
  kpiSub: { fontSize: 10, lineHeight: 12 },

  // ── Search (fixed height row so layout never collapses)
  searchRow: {
    height: 50,
    paddingHorizontal: screenInset,
    paddingTop: 8,
    paddingBottom: 8,
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: color.text,
    paddingVertical: 0,
    height: 32,
  },

  // ── Filter chips (rectangular, InteriorOS style)
  filterWrap: {
    height: 36,
    paddingBottom: 6,
  },
  filterRow: {
    paddingHorizontal: screenInset,
    gap: 6,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
  },
  filterChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },

  // ── List
  listContent: { paddingHorizontal: screenInset, paddingTop: space.xs, paddingBottom: 100 },
  leadCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 8,
    // Soft elevation matching the project card
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  leadCardOverdue: {
    backgroundColor: color.dangerSoft,
    borderColor: color.danger,
  },
  leadCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  // Overdue alert chip — same visual language as the project card's DUE/LATE chips.
  overdueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: color.danger,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  overdueChipText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.6,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
    gap: space.sm,
  },
  sub: { marginTop: space.xs, maxWidth: 300 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Card text — same scale as project + appointment cards
  cardTitle: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },
  cardSub: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 14,
    color: color.textMuted,
    marginTop: 1,
  },

  // Pill text (status / score) — same as project status pill
  pillText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // Meta strip text
  metaLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 0.8,
  },
  metaValue: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '600',
    color: color.text,
    marginTop: 1,
  },

  // Notes preview
  noteText: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    lineHeight: 14,
    color: color.textMuted,
    fontStyle: 'italic',
  },
  leadBody: { flex: 1, minWidth: 0 },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  scoreDot: { width: 5, height: 5, borderRadius: 3 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginLeft: 'auto',
  },

  // Meta strip with action buttons on the right
  metaStrip: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaCol: { marginRight: 14 },
  actionCol: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgGrouped,
  },

  noteBox: {
    marginTop: 8,
    backgroundColor: color.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // ── FAB
  fab: {
    position: 'absolute',
    right: screenInset,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
