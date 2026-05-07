/**
 * Lead detail / preview — InteriorOS layout.
 *
 * Hero card (avatar + name + priority pill + status pill), single
 * progress-bar stage card, quick action buttons, then InteriorOS
 * `Group` + `Row` for Details / Notes / Tags / Requirements /
 * Appointments. Sticky bottom action: Schedule appointment
 * (no Convert button, per product spec).
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { deleteLead, updateLead } from '@/src/features/crm/leads';
import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  type LeadPriority,
  type LeadStatus,
  getLeadPriorityLabel,
  getLeadSourceLabel,
  getLeadStatusLabel,
  getProjectTypeLabel,
} from '@/src/features/crm/types';
import { useLead } from '@/src/features/crm/useLeads';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { AlertSheet, Group, Row, SelectModal } from '@/src/ui/io';
import { Screen } from '@/src/ui/Screen';
import { color, radius, screenInset, space } from '@/src/theme';
import { fontFamily } from '@/src/theme/tokens';

/**
 * Status → progress %. Hand-tuned so each step feels meaningful and the
 * terminal "converted" lands at 100. "Lost" is shown via styling; the
 * bar itself just resets to 0.
 */
const STATUS_PROGRESS: Record<LeadStatus, number> = {
  new: 10,
  contacted: 25,
  site_visit_scheduled: 45,
  proposal_sent: 65,
  negotiation: 85,
  converted: 100,
  lost: 0,
};

function digitsForWhatsApp(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  return d;
}

function priorityTone(
  priority: 'low' | 'medium' | 'high',
): { bg: string; fg: string; label: string } {
  if (priority === 'high') return { bg: color.dangerSoft, fg: color.danger, label: 'High' };
  if (priority === 'medium')
    return { bg: color.warningSoft, fg: color.warning, label: 'Medium' };
  return { bg: color.surfaceAlt, fg: color.textMuted, label: 'Low' };
}

function fmtDateTime(d?: Date): string {
  if (!d) return '—';
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function LeadDetailScreen() {
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: lead, loading } = useLead(leadId);
  const { members } = useOrgMembers(orgId);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [showOverdueSheet, setShowOverdueSheet] = useState(false);

  const statusOptions = useMemo(
    () => LEAD_STATUSES.map((s) => ({ key: s.key, label: s.label })),
    [],
  );
  const priorityOptions = useMemo(
    () => LEAD_PRIORITIES.map((p) => ({ key: p.key, label: p.label })),
    [],
  );

  const assignedName = lead?.assignedTo
    ? members.find((m) => m.uid === lead.assignedTo)?.displayName ?? lead.assignedTo
    : '—';

  function openCall() {
    if (!lead?.phone) return;
    Linking.openURL(`tel:${lead.phone.replace(/\s/g, '')}`);
  }

  function openWhatsApp() {
    if (!lead?.phone) return;
    const n = digitsForWhatsApp(lead.phone);
    Linking.openURL(`https://wa.me/${n}`);
  }

  async function pickStatus(key: string) {
    if (!lead) return;
    try {
      await updateLead(lead.id, { status: key as LeadStatus });
    } catch (e) {
      console.warn(e);
    }
  }

  async function pickPriority(key: string) {
    if (!lead) return;
    try {
      await updateLead(lead.id, { priority: key as LeadPriority });
    } catch (e) {
      console.warn(e);
    }
  }

  async function performDelete() {
    if (!lead) return;
    try {
      setDeleting(true);
      await deleteLead(lead.id);
      router.back();
    } catch (e) {
      console.warn(e);
    } finally {
      setDeleting(false);
    }
  }

  if (loading && !lead) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <RNText style={styles.bodyText}>Loading…</RNText>
      </Screen>
    );
  }

  if (!lead) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <RNText style={styles.bodyText}>Lead not found</RNText>
        <Pressable onPress={() => router.back()} style={{ marginTop: space.md }}>
          <RNText style={styles.linkAction}>Back</RNText>
        </Pressable>
      </Screen>
    );
  }

  const isTerminal = lead.status === 'converted' || lead.status === 'lost';
  const progressPct = STATUS_PROGRESS[lead.status] ?? 0;
  const isLost = lead.status === 'lost';
  const isWon = lead.status === 'converted';
  const pr = priorityTone(lead.priority);

  // Overdue follow-up — only matters while the lead is in active pipeline.
  // Uses a calendar-day comparison so a follow-up scheduled for today
  // (any time) is NOT yet considered overdue.
  const followUpDate = lead.followUpAt?.toDate();
  const isFollowUpOverdue = (() => {
    if (!followUpDate || isTerminal) return false;
    const fu = new Date(followUpDate);
    fu.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return fu.getTime() < today.getTime();
  })();
  const daysOverdue = (() => {
    if (!isFollowUpOverdue || !followUpDate) return 0;
    const fu = new Date(followUpDate);
    fu.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((today.getTime() - fu.getTime()) / 86_400_000));
  })();

  function showOverdueExplainer() {
    setShowOverdueSheet(true);
  }

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={color.primary} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <RNText style={styles.topEyebrow}>CRM</RNText>
          <RNText style={styles.topTitle} numberOfLines={1}>Lead</RNText>
        </View>
        <Pressable
          onPress={() => router.push(`/(app)/crm/add-lead?leadId=${lead.id}` as never)}
          hitSlop={12}
        >
          <RNText style={styles.topAction}>Edit</RNText>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — avatar, name, priority + meta + status pill */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.avatar}>
              <RNText style={styles.avatarText}>
                {lead.name.charAt(0).toUpperCase()}
              </RNText>
            </View>
            <View style={styles.heroInfo}>
              <View style={styles.heroTitleRow}>
                <RNText style={styles.heroName} numberOfLines={1}>
                  {lead.name}
                </RNText>
                <Pressable
                  onPress={() => setShowPriorityPicker(true)}
                  hitSlop={6}
                  style={[styles.scorePill, { backgroundColor: pr.bg }]}
                >
                  <RNText style={[styles.pillText, { color: pr.fg }]}>
                    {pr.label}
                  </RNText>
                  <Ionicons
                    name="chevron-down"
                    size={11}
                    color={pr.fg}
                    style={{ marginLeft: 3 }}
                  />
                </Pressable>
                {isFollowUpOverdue ? (
                  <Pressable
                    onPress={showOverdueExplainer}
                    hitSlop={6}
                    style={styles.overdueChip}
                  >
                    <Ionicons name="alert-circle" size={11} color="#fff" />
                    <RNText style={styles.overdueChipText}>OVERDUE</RNText>
                  </Pressable>
                ) : null}
              </View>
              <RNText style={styles.heroMeta} numberOfLines={1}>
                {lead.projectType ? getProjectTypeLabel(lead.projectType) : 'Project'} ·{' '}
                {lead.location ?? 'Unknown city'}
              </RNText>
              <RNText style={styles.heroMeta}>{lead.phone}</RNText>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusPill}>
              <RNText style={styles.statusPillText}>
                {getLeadStatusLabel(lead.status)}
              </RNText>
            </View>
            <Pressable onPress={() => setShowStatusPicker(true)} hitSlop={8}>
              <RNText style={styles.linkAction}>Change</RNText>
            </Pressable>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} onPress={openCall}>
            <Ionicons name="call-outline" size={20} color={color.primary} />
            <RNText style={[styles.actionLabel, { color: color.primary }]}>Call</RNText>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={openWhatsApp}>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
            <RNText style={styles.actionLabel}>WhatsApp</RNText>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => setShowStatusPicker(true)}>
            <Ionicons name="flag-outline" size={20} color={color.primary} />
            <RNText style={[styles.actionLabel, { color: color.primary }]}>Status</RNText>
          </Pressable>
        </View>

        {/* Stage progress */}
        <RNText style={styles.sectionLabel}>STAGE</RNText>
        <View style={styles.stageCard}>
          <View style={styles.stageHead}>
            <RNText style={styles.stageStatus}>
              {getLeadStatusLabel(lead.status)}
            </RNText>
            <RNText style={styles.stagePct}>{progressPct}%</RNText>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPct}%`,
                  backgroundColor: isWon
                    ? color.success
                    : isLost
                    ? color.danger
                    : color.primary,
                },
              ]}
            />
          </View>
          <View style={styles.stageFoot}>
            <RNText style={styles.stageFootLabel}>NEW</RNText>
            <RNText style={styles.stageFootLabel}>WON</RNText>
          </View>
          {isTerminal ? (
            <View style={styles.terminalNote}>
              <RNText
                style={[
                  styles.terminalText,
                  { color: isWon ? color.success : color.danger },
                ]}
              >
                Terminal · {getLeadStatusLabel(lead.status)}
              </RNText>
            </View>
          ) : null}
        </View>

        {/* Details */}
        <Group header="Details">
          <Row title="Source" meta={getLeadSourceLabel(lead.source)} />
          <Row
            title="Priority"
            meta={getLeadPriorityLabel(lead.priority)}
            onPress={() => setShowPriorityPicker(true)}
            chevron
          />
          <Row
            title="Project type"
            meta={lead.projectType ? getProjectTypeLabel(lead.projectType) : '—'}
          />
          <Row title="Location" meta={lead.location ?? '—'} />
          <Row
            title="Budget"
            meta={
              lead.budget !== undefined && lead.budget !== null
                ? `₹ ${lead.budget.toLocaleString('en-IN')}`
                : '—'
            }
          />
          <Row title="Assigned" meta={assignedName} />
          <Row
            title="Expected start"
            meta={fmtDateTime(lead.expectedStartDate?.toDate())}
          />
          <Row
            title="Follow-up"
            meta={
              isFollowUpOverdue
                ? `${fmtDateTime(lead.followUpAt?.toDate())} · ${daysOverdue}D OVERDUE`
                : fmtDateTime(lead.followUpAt?.toDate())
            }
            destructive={isFollowUpOverdue}
            onPress={isFollowUpOverdue ? showOverdueExplainer : undefined}
            chevron={isFollowUpOverdue}
          />
          <Row
            title="Created"
            meta={fmtDateTime(lead.createdAt?.toDate())}
            last
          />
        </Group>

        {/* Requirements */}
        {lead.requirements ? (
          <Group header="Requirements">
            <View style={styles.notePad}>
              <RNText style={styles.bodyText}>{lead.requirements}</RNText>
            </View>
          </Group>
        ) : null}

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 ? (
          <Group header="Tags">
            <View style={styles.tagPad}>
              {lead.tags.map((t) => (
                <View key={t} style={styles.tagPill}>
                  <RNText style={styles.tagText}>{t}</RNText>
                </View>
              ))}
            </View>
          </Group>
        ) : null}

        {/* Notes */}
        {lead.notes ? (
          <Group header="Notes">
            <View style={styles.notePad}>
              <RNText style={styles.bodyText}>{lead.notes}</RNText>
            </View>
          </Group>
        ) : null}

        {/* Danger zone */}
        <Group header="Danger zone">
          <Row
            title={deleting ? 'Deleting…' : 'Delete lead'}
            subtitle="Permanently remove from CRM"
            left={<Ionicons name="trash-outline" size={18} color={color.danger} />}
            onPress={() => setShowDeleteSheet(true)}
            destructive
            last
          />
        </Group>
      </ScrollView>

      <SelectModal
        visible={showStatusPicker}
        title="Change status"
        options={statusOptions}
        value={lead.status}
        onClose={() => setShowStatusPicker(false)}
        onPick={pickStatus}
      />

      <SelectModal
        visible={showPriorityPicker}
        title="Change priority"
        options={priorityOptions}
        value={lead.priority}
        onClose={() => setShowPriorityPicker(false)}
        onPick={pickPriority}
      />

      <AlertSheet
        visible={showOverdueSheet}
        onClose={() => setShowOverdueSheet(false)}
        tone="danger"
        icon="alert-circle"
        title="Follow-up overdue"
        message={
          daysOverdue === 1
            ? `${lead.name}'s follow-up was due yesterday.\n\nReach out today, or open Edit to push the follow-up date.`
            : `${lead.name}'s follow-up was due ${daysOverdue} days ago.\n\nReach out today, or open Edit to push the follow-up date.`
        }
        actions={[
          { label: 'Dismiss', variant: 'default' },
          {
            label: 'Edit lead',
            variant: 'primary',
            onPress: () => router.push(`/(app)/crm/add-lead?leadId=${lead.id}` as never),
          },
        ]}
      />

      <AlertSheet
        visible={showDeleteSheet}
        onClose={() => setShowDeleteSheet(false)}
        tone="danger"
        icon="trash"
        title="Delete lead?"
        message={`This will permanently remove "${lead.name}" from your CRM. This can't be undone.`}
        actions={[
          { label: 'Cancel', variant: 'default' },
          {
            label: deleting ? 'Deleting…' : 'Delete',
            variant: 'destructive',
            onPress: () => void performDelete(),
          },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ── Unified type scale (matches io.tsx form scale + card scale) ──
  // Section labels (uppercase, between groups)
  sectionLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '500',
    color: color.textFaint,
    letterSpacing: 0.8,
    paddingHorizontal: screenInset,
    paddingBottom: 8,
  },
  // Body / multiline (notes, requirements)
  bodyText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 20,
    color: color.text,
  },
  // Hero name
  heroName: {
    flex: 1,
    flexShrink: 1,
    fontFamily: fontFamily.sans,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.3,
  },
  heroMeta: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 16,
    color: color.textMuted,
    marginTop: 2,
  },
  // Avatar text
  avatarText: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: color.primary,
  },
  // Pills (priority + status — same scale as card pills)
  pillText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  statusPillText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.primary,
  },
  // Inline link action ("Change", "Back", "Edit")
  linkAction: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '500',
    color: color.primary,
  },
  // Top bar
  topEyebrow: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '500',
    color: color.textFaint,
    letterSpacing: 0.8,
  },
  topTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.1,
  },
  topAction: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.primary,
  },
  // Quick action labels
  actionLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '600',
    color: color.text,
    marginTop: 2,
  },
  // Stage card
  stageStatus: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
  },
  stagePct: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: color.textMuted,
    fontVariant: ['tabular-nums'],
  },
  stageFootLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 0.8,
  },
  terminalText: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  // Tag chip text
  tagText: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textMuted,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  topTitleWrap: { flex: 1, alignItems: 'center' },

  scroll: {
    paddingTop: space.md,
    paddingBottom: space.xxl,
  },

  // Hero
  hero: {
    marginHorizontal: screenInset,
    marginBottom: space.md,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroInfo: { flex: 1, minWidth: 0 },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  overdueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: color.danger,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  overdueChipText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.6,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  statusPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: color.primarySoft,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: screenInset,
    marginBottom: space.md,
  },
  actionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  // Stage card
  stageCard: {
    marginHorizontal: screenInset,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.md,
    marginBottom: space.lg,
  },
  stageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressTrack: {
    height: 6,
    backgroundColor: color.separator,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.primary,
  },
  stageFoot: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  terminalNote: {
    marginTop: space.sm,
    paddingTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },

  // Notes / requirements / tags
  notePad: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: color.surface,
  },
  tagPad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: color.surface,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },

  // Footer
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.xs,
    paddingBottom: space.md,
    paddingHorizontal: 0,
    backgroundColor: color.bgGrouped,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
  },
});
