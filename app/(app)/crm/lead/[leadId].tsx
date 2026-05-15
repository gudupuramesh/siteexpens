/**
 * Lead detail / preview — v2 design.
 *
 * Layout (top → bottom):
 *   1. Inline top bar — ‹ Back · "Lead" title · Edit link
 *   2. Hero card — gradient avatar + name + priority pill, phone + meta sublines,
 *      hairline divider, then status pill row with "Change" link
 *   3. Inline overdue banner (only when follow-up is overdue)
 *   4. Quick action row — Call · WhatsApp · Status (3 tinted buttons)
 *   5. Stage progress card — colored progress bar + NEW → WON labels
 *   6. FormGroup "Details" — every key/value field
 *   7. FormGroup "Requirements" / "Tags" / "Notes" (conditional)
 *   8. Destructive "Delete lead" button at the bottom
 *
 * Pickers use v2 `<SelectSheet>`. Delete uses native `Alert.alert`
 * (iOS-native destructive confirmation). Overdue uses an inline banner
 * instead of a separate alert sheet — simpler, more visible, one less tap.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

// ── Status helpers ──────────────────────────────────────────────────

/** Status → progress bar percent. Hand-tuned so each step feels meaningful;
 *  "converted" lands at 100, "lost" resets to 0 (the bar is just visual). */
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

// Tone for the priority pill — 90/10 discipline: only "Hot" earns colour
// (red, an explicit alarm). Medium and Low both go neutral.
function priorityTone(t: ReturnType<typeof useThemeV2>, priority: LeadPriority) {
  if (priority === 'high') return { fg: t.palette.red.base, bg: t.palette.red.soft, label: 'Hot' };
  if (priority === 'medium') return { fg: t.colors.secondary, bg: t.colors.fill3, label: 'Medium' };
  return { fg: t.colors.secondary, bg: t.colors.fill3, label: 'Low' };
}

/**
 * Neutral tone for the status pill in the hero card.
 *
 * Color discipline: lead stages (new / contacted / site visit / proposal /
 * negotiation / converted / lost) are descriptive labels along a pipeline,
 * not actionable status. Per the app-wide rule (only blue/red/orange/green
 * carry meaning), all stages render with the neutral tone (fill3 + secondary).
 * Mirrors what we already do on the LeadCard stage pill so the list and
 * detail screens read consistently.
 *
 * The "lost" outcome stays neutral here too; the progress bar below the
 * status pill already paints itself red when the deal is lost / green when
 * won, so the win/lose semantics are still visible without needing to
 * re-color this pill.
 */
function statusTone(t: ReturnType<typeof useThemeV2>) {
  return { fg: t.colors.secondary, bg: t.colors.fill3 };
}

// ── Screen ──────────────────────────────────────────────────────────

export default function LeadDetailScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: lead, loading } = useLead(leadId);
  const { members } = useOrgMembers(orgId);

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    void Linking.openURL(`tel:${lead.phone.replace(/\s/g, '')}`);
  }

  function openWhatsApp() {
    if (!lead?.phone) return;
    void Linking.openURL(`https://wa.me/${digitsForWhatsApp(lead.phone)}`);
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

  const onDelete = () => {
    if (!lead) return;
    Alert.alert(
      'Delete lead?',
      `This will permanently remove "${lead.name}" from your CRM. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await deleteLead(lead.id);
              router.back();
            } catch (e) {
              console.warn(e);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  // Loading / not-found shells
  if (loading && !lead) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <TopBar title="Lead" rightLabel="" onBack={() => router.back()} />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Loading…</Text>
        </View>
      </View>
    );
  }
  if (!lead) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <TopBar title="Lead" rightLabel="" onBack={() => router.back()} />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Lead not found</Text>
        </View>
      </View>
    );
  }

  const isTerminal = lead.status === 'converted' || lead.status === 'lost';
  const progressPct = STATUS_PROGRESS[lead.status] ?? 0;
  const isLost = lead.status === 'lost';
  const isWon = lead.status === 'converted';
  const pr = priorityTone(t, lead.priority);
  const stTone = statusTone(t);

  // Overdue follow-up — only matters while the lead is in active pipeline.
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

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <AmbientBackground />

      {/* Top bar — ‹ Back · "Lead" · Edit */}
      <TopBar
        title="Lead"
        rightLabel="Edit"
        onBack={() => router.back()}
        onRight={() => router.push(`/(app)/crm/add-lead?leadId=${lead.id}` as never)}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingBottom: 40 + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: t.colors.surface,
              borderRadius: t.radii.card,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.04)',
              borderWidth: t.hairline,
            },
            t.shadows.resting,
          ]}
        >
          {/* Top row — neutral avatar + name + priority pill.
              Avatar uses neutral fill3 + secondary glyph per the color
              discipline; the per-lead gradient was decorative only. */}
          <View style={styles.heroRow1}>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: t.colors.fill3,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Text
                style={{
                  color: t.colors.secondary,
                  fontSize: 18,
                  fontWeight: '700',
                }}
              >
                {lead.name.charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.heroMeta}>
              <View style={styles.heroNameRow}>
                <Text
                  variant="title3"
                  color="label"
                  style={{ flex: 1, marginRight: 8, fontWeight: '700' }}
                  numberOfLines={1}
                >
                  {lead.name}
                </Text>
                <Pressable
                  onPress={() => setShowPriorityPicker(true)}
                  hitSlop={6}
                  style={[styles.prioPill, { backgroundColor: pr.bg }]}
                >
                  <View style={[styles.prioDot, { backgroundColor: pr.fg }]} />
                  <Text
                    variant="caption2"
                    style={{
                      color: pr.fg,
                      fontWeight: '700',
                      marginLeft: 5,
                      letterSpacing: 0.1,
                    }}
                  >
                    {pr.label}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={11}
                    color={pr.fg}
                    style={{ marginLeft: 3 }}
                  />
                </Pressable>
              </View>

              <Text variant="footnote" color="secondary" style={{ marginTop: 2 }} numberOfLines={1}>
                {lead.phone}
              </Text>
              <Text variant="caption1" color="tertiary" style={{ marginTop: 2 }} numberOfLines={1}>
                {[
                  lead.projectType ? getProjectTypeLabel(lead.projectType) : 'Project',
                  lead.location ?? 'Unknown city',
                ].join(' · ')}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View
            style={[
              styles.heroDivider,
              {
                backgroundColor:
                  t.mode === 'dark'
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.06)',
              },
            ]}
          />

          {/* Status pill + Change link */}
          <View style={styles.heroStatusRow}>
            <View style={[styles.statusPill, { backgroundColor: stTone.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: stTone.fg }]} />
              <Text
                variant="footnote"
                style={{
                  color: stTone.fg,
                  fontWeight: '700',
                  marginLeft: 6,
                  letterSpacing: 0.1,
                }}
              >
                {getLeadStatusLabel(lead.status)}
              </Text>
            </View>
            <Pressable onPress={() => setShowStatusPicker(true)} hitSlop={8}>
              <Text variant="footnote" style={{ color: t.palette.blue.base, fontWeight: '600' }}>
                Change
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Overdue banner (inline, no separate alert sheet) */}
        {isFollowUpOverdue ? (
          <View
            style={[
              styles.overdueBanner,
              {
                backgroundColor: t.palette.red.soft,
                borderRadius: t.radii.field,
                borderColor: t.palette.red.base + '40',
                borderWidth: t.hairline,
              },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={t.palette.red.base} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text variant="footnote" style={{ color: t.palette.red.base, fontWeight: '700' }}>
                Follow-up overdue
              </Text>
              <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                {daysOverdue === 1
                  ? `${lead.name}'s follow-up was due yesterday.`
                  : `${lead.name}'s follow-up was due ${daysOverdue} days ago.`}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push(`/(app)/crm/add-lead?leadId=${lead.id}` as never)}
              hitSlop={6}
            >
              <Text variant="footnote" style={{ color: t.palette.red.base, fontWeight: '700' }}>
                Edit
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Quick actions — Call (blue) · WhatsApp (green brand) · Status (blue) */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon="call"
            label="Call"
            tint={t.palette.blue.base}
            tintBg={t.palette.blue.soft}
            onPress={openCall}
          />
          <ActionButton
            icon="logo-whatsapp"
            label="WhatsApp"
            tint={t.palette.green.base}
            tintBg={t.palette.green.soft}
            onPress={openWhatsApp}
          />
          <ActionButton
            icon="flag"
            label="Status"
            tint={t.palette.blue.base}
            tintBg={t.palette.blue.soft}
            onPress={() => setShowStatusPicker(true)}
          />
        </View>

        {/* Stage progress */}
        <FormGroup header="Stage">
          <View style={styles.stageBlock}>
            <View style={styles.stageHead}>
              <Text variant="callout" color="label">
                {getLeadStatusLabel(lead.status)}
              </Text>
              <Text
                variant="footnote"
                color="secondary"
               
              >
                {progressPct}%
              </Text>
            </View>
            <View
              style={[
                styles.progressTrack,
                { backgroundColor: t.colors.fill3 },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    // 90/10: progress bar fills in interactive blue while
                    // active. Won doesn't earn green any more (the label
                    // "Won" already says success); lost still earns red.
                    width: `${progressPct}%`,
                    backgroundColor: isLost
                      ? t.palette.red.base
                      : t.palette.blue.base,
                  },
                ]}
              />
            </View>
            <View style={styles.stageFoot}>
              <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.6 }}>
                NEW
              </Text>
              <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.6 }}>
                WON
              </Text>
            </View>
            {isTerminal ? (
              <Text
                variant="caption1"
                style={{
                  // 90/10: only "lost" terminal state earns red. "Won" reads
                  // in neutral — its label is celebration enough.
                  color: isLost ? t.palette.red.base : t.colors.secondary,
                  marginTop: 8,
                  fontWeight: '600',
                }}
              >
                Terminal · {getLeadStatusLabel(lead.status)}
              </Text>
            ) : null}
          </View>
        </FormGroup>

        {/* Details */}
        <FormGroup header="Details">
          <Row label="Source" value={getLeadSourceLabel(lead.source)} />
          <Row
            label="Priority"
            value={getLeadPriorityLabel(lead.priority)}
            chevron
            onPress={() => setShowPriorityPicker(true)}
          />
          <Row
            label="Project type"
            value={lead.projectType ? getProjectTypeLabel(lead.projectType) : '—'}
          />
          <Row label="Location" value={lead.location ?? '—'} />
          <Row
            label="Budget"
            value={
              lead.budget !== undefined && lead.budget !== null
                ? `₹ ${lead.budget.toLocaleString('en-IN')}`
                : '—'
            }
          />
          <Row label="Assigned" value={assignedName} />
          <Row
            label="Expected start"
            value={fmtDateTime(lead.expectedStartDate?.toDate())}
          />
          <Row
            label="Follow-up"
            value={fmtDateTime(lead.followUpAt?.toDate())}
            valueColor={isFollowUpOverdue ? t.palette.red.base : undefined}
          />
          <Row
            label="Created"
            value={fmtDateTime(lead.createdAt?.toDate())}
            divider={false}
          />
        </FormGroup>

        {/* Requirements */}
        {lead.requirements ? (
          <FormGroup header="Requirements">
            <View style={styles.notePad}>
              <Text variant="body" color="label">
                {lead.requirements}
              </Text>
            </View>
          </FormGroup>
        ) : null}

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 ? (
          <FormGroup header="Tags">
            <View style={styles.tagPad}>
              {lead.tags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.tagPill,
                    {
                      backgroundColor: t.colors.fill3,
                      borderRadius: t.radii.pill,
                    },
                  ]}
                >
                  <Text variant="footnote" color="label" style={{ fontWeight: '500' }}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          </FormGroup>
        ) : null}

        {/* Notes */}
        {lead.notes ? (
          <FormGroup header="Notes">
            <View style={styles.notePad}>
              <Text variant="body" color="label">
                {lead.notes}
              </Text>
            </View>
          </FormGroup>
        ) : null}

        {/* Delete — destructive button at bottom */}
        <View style={styles.dangerWrap}>
          <Pressable
            onPress={onDelete}
            disabled={deleting}
            style={({ pressed }) => [
              styles.dangerBtn,
              {
                backgroundColor:
                  t.mode === 'dark'
                    ? 'rgba(255,69,58,0.12)'
                    : 'rgba(255,59,48,0.08)',
                borderRadius: t.radii.field,
                borderColor:
                  t.mode === 'dark'
                    ? 'rgba(255,69,58,0.3)'
                    : 'rgba(255,59,48,0.25)',
                borderWidth: t.hairline,
              },
              (pressed || deleting) && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="trash-outline" size={16} color={t.palette.red.base} />
            <Text
              variant="body"
              style={{ color: t.palette.red.base, fontWeight: '600', marginLeft: 6 }}
            >
              {deleting ? 'Deleting…' : 'Delete lead'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Pickers */}
      <SelectSheet
        open={showStatusPicker}
        title="Change status"
        options={statusOptions}
        selected={lead.status}
        onPick={(key) => void pickStatus(key)}
        onClose={() => setShowStatusPicker(false)}
      />
      <SelectSheet
        open={showPriorityPicker}
        title="Change priority"
        options={priorityOptions}
        selected={lead.priority}
        onPick={(key) => void pickPriority(key)}
        onClose={() => setShowPriorityPicker(false)}
      />
    </View>
  );
}

// ── Local helpers ──────────────────────────────────────────────────

function TopBar({
  title,
  rightLabel,
  onBack,
  onRight,
}: {
  title: string;
  rightLabel: string;
  onBack: () => void;
  onRight?: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        topStyles.bar,
        { paddingTop: insets.top + 6 },
      ]}
    >
      {/* Left — content-sized, hugs the left edge (after paddingHorizontal). */}
      <Pressable onPress={onBack} hitSlop={8} style={topStyles.leftSide}>
        <Ionicons name="chevron-back" size={22} color={t.palette.blue.base} />
        <Text variant="body" style={{ color: t.palette.blue.base, marginLeft: -2 }}>
          Back
        </Text>
      </Pressable>

      {/* Title — flexes through the middle, centered in the remaining space. */}
      <Text variant="headline" color="label" style={topStyles.title} numberOfLines={1}>
        {title}
      </Text>

      {/* Right — content-sized, hugs the right edge. */}
      <Pressable onPress={onRight} hitSlop={8} style={topStyles.rightSide}>
        {rightLabel ? (
          <Text variant="body" style={{ color: t.palette.blue.base, fontWeight: '600' }}>
            {rightLabel}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  tint,
  tintBg,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  tintBg: string;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        actStyles.btn,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        t.shadows.resting,
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={[actStyles.iconWrap, { backgroundColor: tintBg }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text variant="caption1" color="label" style={{ marginTop: 6, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingTop: 8,
  },

  // Hero card
  hero: {
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  heroRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroMeta: {
    flex: 1,
    minWidth: 0,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,
  },
  prioDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  heroDivider: {
    height: 0.5,
    marginVertical: 12,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Overdue inline banner
  overdueBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Quick actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 16,
  },

  // Stage block (inside FormGroup)
  stageBlock: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  stageFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },

  // Notes / Requirements / Tags pads
  notePad: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tagPad: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  // Delete button
  dangerWrap: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  dangerBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});

const topStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  leftSide: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    // content-sized — hugs the left edge
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 36,
    // content-sized — hugs the right edge
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 8,
  },
});

const actStyles = StyleSheet.create({
  btn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
