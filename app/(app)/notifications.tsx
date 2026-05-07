/**
 * Notifications — aggregates time-sensitive alerts from across the app
 * into a single InteriorOS-styled card list.
 *
 *   • DUE       — projects where payment-out > payment-in (client owes)
 *   • LATE      — projects past their handover date and still not done
 *   • OVERDUE   — leads with a follow-up date in the past
 *   • TODAY     — appointments scheduled for today (still scheduled)
 *
 * Cards mirror the visual language of the project / lead / appointment
 * lists: hairline border, sharp corners, soft shadow, mono uppercase
 * meta + a colored alert chip. Tapping a card jumps to the source.
 */
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { useProjects } from '@/src/features/projects/useProjects';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import { useLeads } from '@/src/features/crm/useLeads';
import { useAppointments } from '@/src/features/crm/useAppointments';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useOrgMaterialRequests } from '@/src/features/materialRequests/useOrgMaterialRequests';
import { Screen } from '@/src/ui/Screen';
import { color, screenInset, space } from '@/src/theme';
import { fontFamily } from '@/src/theme/tokens';

// ── Helpers ───────────────────────────────────────────────────────────

function inrCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) {
    const v = n / 1_00_000;
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    return `₹${s.endsWith('.0') ? s.slice(0, -2) : s}L`;
  }
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n}`;
}

function relPast(d: Date): string {
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function fmtTime(d: Date): string {
  return d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
}

// ── Notification model ────────────────────────────────────────────────

type NotificationKind =
  | 'due'
  | 'late'
  | 'overdue'
  | 'today'
  | 'approval_material'
  | 'approval_transaction'
  | 'txn_approved'
  | 'txn_rejected'
  | 'txn_cleared'
  | 'mr_approved'
  | 'mr_rejected'
  | 'mr_delivery_update';

type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  subtitle: string;
  meta: string; // small uppercase right-side text (e.g. "5D AGO")
  /** Sort key — bigger number = more urgent. */
  weight: number;
  href: string;
};

const KIND_META: Record<
  NotificationKind,
  { label: string; bg: string; chipFg: string; iconBg: string; iconFg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  due: {
    label: 'PAYMENT DUE',
    bg: color.danger,
    chipFg: '#fff',
    iconBg: color.dangerSoft,
    iconFg: color.danger,
    icon: 'cash-outline',
  },
  late: {
    label: 'DELAYED',
    bg: color.warning,
    chipFg: '#fff',
    iconBg: color.warningSoft,
    iconFg: color.warning,
    icon: 'time-outline',
  },
  overdue: {
    label: 'FOLLOW-UP DUE',
    bg: color.danger,
    chipFg: '#fff',
    iconBg: color.dangerSoft,
    iconFg: color.danger,
    icon: 'alert-circle-outline',
  },
  today: {
    label: 'TODAY',
    bg: color.primary,
    chipFg: '#fff',
    iconBg: color.primarySoft,
    iconFg: color.primary,
    icon: 'calendar-outline',
  },
  approval_material: {
    label: 'MATERIAL',
    bg: color.primary,
    chipFg: '#fff',
    iconBg: color.primarySoft,
    iconFg: color.primary,
    icon: 'cube-outline',
  },
  approval_transaction: {
    label: 'EXPENSE',
    bg: color.warning,
    chipFg: '#fff',
    iconBg: color.warningSoft,
    iconFg: color.warning,
    icon: 'wallet-outline',
  },
  txn_approved: {
    label: 'APPROVED',
    bg: color.success,
    chipFg: '#fff',
    iconBg: color.successSoft,
    iconFg: color.success,
    icon: 'checkmark-circle-outline',
  },
  txn_rejected: {
    label: 'REJECTED',
    bg: color.danger,
    chipFg: '#fff',
    iconBg: color.dangerSoft,
    iconFg: color.danger,
    icon: 'close-circle-outline',
  },
  txn_cleared: {
    label: 'CLEARED',
    bg: color.success,
    chipFg: '#fff',
    iconBg: color.successSoft,
    iconFg: color.success,
    icon: 'cash-outline',
  },
  mr_approved: {
    label: 'APPROVED',
    bg: color.success,
    chipFg: '#fff',
    iconBg: color.successSoft,
    iconFg: color.success,
    icon: 'checkmark-circle-outline',
  },
  mr_rejected: {
    label: 'REJECTED',
    bg: color.danger,
    chipFg: '#fff',
    iconBg: color.dangerSoft,
    iconFg: color.danger,
    icon: 'close-circle-outline',
  },
  mr_delivery_update: {
    label: 'DELIVERY',
    bg: color.primary,
    chipFg: '#fff',
    iconBg: color.primarySoft,
    iconFg: color.primary,
    icon: 'cube-outline',
  },
};

// ── Component ─────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { can } = usePermissions();
  const canApproveMaterial = can('material.request.approve');
  const canApproveTxnCap = can('transaction.approve');

  const { data: projects } = useProjects();
  const { totalsByProject, transactions: orgTransactions } = useProjectTotals(orgId);
  const { data: leads } = useLeads(orgId);
  const { data: appointments } = useAppointments(orgId);
  // Fetch ALL material requests for the org (no status filter) so the
  // same hook drives both the "pending approvals" rows and the new
  // "Recent" entries (approved / rejected / delivery-update events from
  // the last 30 days). Cheaper than firing two listeners.
  const { data: allMaterialsOrg } = useOrgMaterialRequests(orgId);
  const pendingMaterialsOrg = useMemo(
    () => allMaterialsOrg.filter((r) => r.status === 'pending'),
    [allMaterialsOrg],
  );

  const notifications = useMemo<Notification[]>(() => {
    const out: Notification[] = [];
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const uid = user?.uid;
    const visiblePendingMaterials = pendingMaterialsOrg.filter((r) => {
      if (!uid) return false;
      if (canApproveMaterial) return true;
      if (r.createdBy === uid) return true;
      return r.designatedApproverUids?.includes(uid) ?? false;
    });
    for (const r of visiblePendingMaterials) {
      const p = projects.find((x) => x.id === r.projectId);
      out.push({
        id: `am-${r.id}`,
        kind: 'approval_material',
        title: p?.name ?? 'Project',
        subtitle: `${r.title || 'Material request'} · awaiting approval`,
        meta: 'PENDING',
        weight: 96,
        href: `/(app)/projects/${r.projectId}/material-request/${r.id}`,
      });
    }

    const visiblePendingTxns = orgTransactions.filter((t) => {
      if (t.workflowStatus !== 'pending_approval') return false;
      if (!uid) return false;
      if (canApproveTxnCap) return true;
      return t.createdBy === uid;
    });
    for (const t of visiblePendingTxns) {
      const p = projects.find((x) => x.id === t.projectId);
      const party = t.partyName || 'Expense';
      out.push({
        id: `at-${t.id}`,
        kind: 'approval_transaction',
        title: p?.name ?? 'Project',
        subtitle: `${party} · ${inrCompact(t.amount)} · awaiting approval`,
        meta: 'PENDING',
        weight: 97,
        href: `/(app)/projects/${t.projectId}/transaction/${t.id}`,
      });
    }

    // Recent transaction events (last 30 days) — approved / rejected / cleared.
    // Surface only events the viewer participated in:
    //   - they submitted the txn (createdBy), OR
    //   - they made the decision (approvedBy / rejectedBy / cleared by them).
    // Keeps the bell scoped to "things that happened to me" — admins won't be
    // spammed with every txn the studio approved, just ones they touched.
    if (uid) {
      const cutoff = now.getTime() - 30 * 86_400_000;
      type RecentEvent = {
        kind: 'txn_approved' | 'txn_rejected' | 'txn_cleared';
        whenMs: number;
        txn: (typeof orgTransactions)[number];
      };
      const events: RecentEvent[] = [];
      // When admin uses "Approve & Clear" in one tap, both approvedAt and
      // settlement.clearedAt are written by the same Firestore update —
      // their timestamps land within the same server batch (typically a
      // few ms apart, well under a second). The bell would otherwise show
      // two separate entries for the same admin action, which is noise.
      // Treat the cleared event as the canonical one in that case (it
      // implies approval) and suppress the duplicate approved entry.
      const SAME_WRITE_WINDOW_MS = 5_000;

      for (const t of orgTransactions) {
        const projName = projects.find((x) => x.id === t.projectId)?.name;
        if (!projName) continue;

        const clearedMs = t.settlement?.clearedAt?.toMillis();
        const approvedMs = t.approvedAt?.toMillis();
        const sameWriteApproveAndClear =
          clearedMs != null &&
          approvedMs != null &&
          Math.abs(clearedMs - approvedMs) < SAME_WRITE_WINDOW_MS;

        // Approved — skip when this txn was approved-and-cleared together
        // (the cleared entry below already represents the same admin action).
        if (
          t.workflowStatus === 'posted' &&
          approvedMs != null &&
          !sameWriteApproveAndClear
        ) {
          if (
            approvedMs >= cutoff &&
            (t.createdBy === uid || t.approvedBy === uid)
          ) {
            events.push({ kind: 'txn_approved', whenMs: approvedMs, txn: t });
          }
        } else if (t.workflowStatus === 'rejected' && t.rejectedAt) {
          const ms = t.rejectedAt.toMillis();
          if (ms >= cutoff && (t.createdBy === uid || t.rejectedBy === uid)) {
            events.push({ kind: 'txn_rejected', whenMs: ms, txn: t });
          }
        }

        // Cleared — surfaces on its own; for clear-later flows it's a
        // distinct event from the earlier approval (which gets its own
        // entry timestamped at approval time).
        if (clearedMs != null) {
          if (
            clearedMs >= cutoff &&
            (t.createdBy === uid || t.settlement?.clearedBy === uid)
          ) {
            events.push({ kind: 'txn_cleared', whenMs: clearedMs, txn: t });
          }
        }
      }

      events.sort((a, b) => b.whenMs - a.whenMs);
      const RECENT_CAP = 15;
      for (const e of events.slice(0, RECENT_CAP)) {
        const t = e.txn;
        const p = projects.find((x) => x.id === t.projectId);
        const party = t.partyName || 'Expense';
        const amt = inrCompact(t.amount);
        const ago = relPast(new Date(e.whenMs));
        let subtitle: string;
        let metaLabel: string;
        if (e.kind === 'txn_approved') {
          subtitle = `${party} · ${amt} · approved`;
          metaLabel = ago.toUpperCase();
        } else if (e.kind === 'txn_rejected') {
          subtitle = `${party} · ${amt} · rejected${
            t.rejectionNote ? ` (${t.rejectionNote})` : ''
          }`;
          metaLabel = ago.toUpperCase();
        } else {
          // cleared
          const isOwn = t.createdBy === uid;
          const isReimb = t.submissionKind === 'expense_reimbursement';
          subtitle = isReimb
            ? isOwn
              ? `Reimbursement of ${amt} cleared`
              : `${party} reimbursed · ${amt}`
            : `Paid to ${party} · ${amt}`;
          metaLabel = ago.toUpperCase();
        }
        // Decided/cleared events weight below pending. Newer events float to
        // the top of the recent group via whenMs; we squash to the 30–60 band.
        const ageDays = Math.max(0, (now.getTime() - e.whenMs) / 86_400_000);
        const weight = 60 - Math.min(30, ageDays); // newest = 60, oldest = 30
        out.push({
          id: `${e.kind}-${t.id}-${e.whenMs}`,
          kind: e.kind,
          title: p?.name ?? 'Project',
          subtitle,
          meta: metaLabel,
          weight,
          href: `/(app)/projects/${t.projectId}/transaction/${t.id}`,
        });
      }
    }

    // Recent material request events — last 30 days, scoped to events the
    // viewer participated in (creator OR the admin who acted on it).
    // Each event uses a dedicated timestamp field so the bell reflects
    // the actual moment of the event, not a proxy.
    if (uid) {
      const cutoff = now.getTime() - 30 * 86_400_000;
      type MrEvent = {
        kind: 'mr_approved' | 'mr_rejected' | 'mr_delivery_update';
        whenMs: number;
        req: (typeof allMaterialsOrg)[number];
      };
      const mrEvents: MrEvent[] = [];
      for (const r of allMaterialsOrg) {
        const projName = projects.find((x) => x.id === r.projectId)?.name;
        if (!projName) continue;

        // Approved — skip auto-approvals (silent self-actions don't deserve a
        // "look at this" line in the bell).
        if (r.status === 'approved' && !r.autoApproved && r.approvedAt) {
          const ms = r.approvedAt.toMillis();
          if (ms >= cutoff && (r.createdBy === uid || r.approvedBy === uid)) {
            mrEvents.push({ kind: 'mr_approved', whenMs: ms, req: r });
          }
        }

        // Rejected — surface for both the creator AND the admin who rejected.
        if (r.status === 'rejected' && r.rejectedAt) {
          const ms = r.rejectedAt.toMillis();
          if (ms >= cutoff && (r.createdBy === uid || r.rejectedBy === uid)) {
            mrEvents.push({ kind: 'mr_rejected', whenMs: ms, req: r });
          }
        }

        // Delivery updates — surface for the creator and the admin who made
        // the change. Bell shows a single rolled-up entry per request; the
        // granular per-item info goes via push notifications.
        if (r.status === 'approved' && r.lastDeliveryUpdateAt) {
          const ms = r.lastDeliveryUpdateAt.toMillis();
          if (
            ms >= cutoff &&
            (r.createdBy === uid || r.lastDeliveryUpdateBy === uid)
          ) {
            mrEvents.push({ kind: 'mr_delivery_update', whenMs: ms, req: r });
          }
        }
      }

      mrEvents.sort((a, b) => b.whenMs - a.whenMs);
      const MR_RECENT_CAP = 15;
      for (const e of mrEvents.slice(0, MR_RECENT_CAP)) {
        const r = e.req;
        const p = projects.find((x) => x.id === r.projectId);
        const ago = relPast(new Date(e.whenMs));
        let subtitle: string;
        if (e.kind === 'mr_approved') {
          subtitle = `${r.title || 'Material request'} · approved`;
        } else if (e.kind === 'mr_rejected') {
          subtitle = `${r.title || 'Material request'} · rejected${
            r.rejectionNote ? ` (${r.rejectionNote})` : ''
          }`;
        } else {
          const inFlight = r.items.filter((i) => i.deliveryStatus !== 'pending').length;
          const total = r.items.length;
          subtitle = `${r.title || 'Material request'} · ${inFlight}/${total} items in transit`;
        }
        const ageDays = Math.max(0, (now.getTime() - e.whenMs) / 86_400_000);
        const weight = 60 - Math.min(30, ageDays);
        out.push({
          id: `${e.kind}-${r.id}-${e.whenMs}`,
          kind: e.kind,
          title: p?.name ?? 'Project',
          subtitle,
          meta: ago.toUpperCase(),
          weight,
          href: `/(app)/projects/${r.projectId}/material-request/${r.id}`,
        });
      }
    }

    // Project alerts
    for (const p of projects) {
      if (p.status === 'completed' || p.status === 'archived') continue;
      const totals = totalsByProject.get(p.id);
      const balance = totals ? totals.income - totals.expense : 0;
      const isLoss = totals && totals.expense > totals.income && totals.expense > 0;
      if (isLoss) {
        out.push({
          id: `due-${p.id}`,
          kind: 'due',
          title: p.name,
          subtitle: `Client owes ${inrCompact(Math.abs(balance))} · received +${inrCompact(totals.income)} / spent −${inrCompact(totals.expense)}`,
          meta: 'NOW',
          weight: 100 + Math.abs(balance) / 1_00_000, // bigger loss → higher
          href: `/(app)/projects/${p.id}`,
        });
      }

      const endDate = p.endDate?.toDate() ?? null;
      if (endDate && endDate.getTime() < today.getTime()) {
        const daysLate = Math.floor((today.getTime() - endDate.getTime()) / 86_400_000);
        out.push({
          id: `late-${p.id}`,
          kind: 'late',
          title: p.name,
          subtitle: `Handover was due ${endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — ${daysLate} day${daysLate === 1 ? '' : 's'} ago`,
          meta: `${daysLate}D LATE`,
          weight: 80 + daysLate, // longer delay → higher
          href: `/(app)/projects/${p.id}`,
        });
      }
    }

    // Lead overdue follow-ups
    for (const l of leads) {
      if (l.status === 'converted' || l.status === 'lost') continue;
      const f = l.followUpAt?.toDate();
      if (!f || f.getTime() >= now.getTime()) continue;
      const daysLate = Math.floor((now.getTime() - f.getTime()) / 86_400_000);
      out.push({
        id: `overdue-${l.id}`,
        kind: 'overdue',
        title: l.name,
        subtitle: `Follow-up was due ${relPast(f)} · ${l.phone}`,
        meta: `${Math.max(daysLate, 1)}D LATE`,
        weight: 70 + daysLate,
        href: `/(app)/crm/lead/${l.id}`,
      });
    }

    // Today's appointments (still scheduled)
    for (const a of appointments) {
      if (a.status !== 'scheduled') continue;
      const at = a.scheduledAt?.toDate();
      if (!at) continue;
      const sameDay =
        at.getFullYear() === today.getFullYear() &&
        at.getMonth() === today.getMonth() &&
        at.getDate() === today.getDate();
      if (!sameDay) continue;
      out.push({
        id: `today-${a.id}`,
        kind: 'today',
        title: a.title,
        subtitle: `${fmtTime(at)}${a.clientName ? ` · with ${a.clientName}` : ''}${a.location ? ` · ${a.location}` : ''}`,
        meta: fmtTime(at).toUpperCase(),
        weight: 50 + (24 - at.getHours()), // earlier today = higher (more imminent)
        href: `/(app)/crm/appointment/${a.id}`,
      });
    }

    out.sort((a, b) => b.weight - a.weight);
    return out;
  }, [
    projects,
    totalsByProject,
    leads,
    appointments,
    pendingMaterialsOrg,
    allMaterialsOrg,
    orgTransactions,
    user?.uid,
    canApproveMaterial,
    canApproveTxnCap,
  ]);

  // Group by kind for section headers
  const grouped = useMemo(() => {
    const buckets: { kind: NotificationKind; label: string; items: Notification[] }[] = [];
    const map = new Map<NotificationKind, Notification[]>();
    for (const n of notifications) {
      if (!map.has(n.kind)) map.set(n.kind, []);
      map.get(n.kind)!.push(n);
    }
    const order: NotificationKind[] = [
      'approval_transaction',
      'approval_material',
      'due',
      'late',
      'overdue',
      'today',
    ];
    for (const kind of order) {
      const items = map.get(kind);
      if (items && items.length > 0) {
        buckets.push({ kind, label: KIND_META[kind].label, items });
      }
    }
    return buckets;
  }, [notifications]);

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={22} color={color.textMuted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <RNText style={styles.eyebrow}>
            {notifications.length} {notifications.length === 1 ? 'NOTIFICATION' : 'NOTIFICATIONS'}
          </RNText>
          <RNText style={styles.title}>Notifications</RNText>
        </View>
        <View style={styles.navBtn} />
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={36} color={color.success} />
          <RNText style={styles.emptyTitle}>All caught up</RNText>
          <RNText style={styles.emptySub}>
            No pending approvals, payments due, late projects, overdue follow-ups, or appointments
            today.
          </RNText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {grouped.map((bucket) => {
            const meta = KIND_META[bucket.kind];
            return (
              <View key={bucket.kind} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <RNText style={styles.sectionLabel}>
                    {bucket.label}
                  </RNText>
                  <View style={[styles.countDot, { backgroundColor: meta.bg }]}>
                    <RNText style={styles.countDotText}>{bucket.items.length}</RNText>
                  </View>
                </View>
                {bucket.items.map((n) => (
                  <NotificationCard key={n.id} notif={n} />
                ))}
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </Screen>
  );
}

// ── Card ──────────────────────────────────────────────────────────────

function NotificationCard({ notif }: { notif: Notification }) {
  const meta = KIND_META[notif.kind];
  return (
    <Pressable
      onPress={() => router.push(notif.href as never)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.cardIcon, { backgroundColor: meta.iconBg }]}>
        <Ionicons name={meta.icon} size={18} color={meta.iconFg} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <RNText style={styles.cardTitle} numberOfLines={1}>
            {notif.title}
          </RNText>
          <View style={[styles.metaPill, { backgroundColor: meta.bg }]}>
            <RNText style={styles.metaPillText}>{notif.meta}</RNText>
          </View>
        </View>
        <RNText style={styles.cardSub} numberOfLines={2}>
          {notif.subtitle}
        </RNText>
      </View>
      <Ionicons
        name="chevron-forward"
        size={14}
        color={color.textFaint}
        style={{ alignSelf: 'center' }}
      />
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.4,
  },
  title: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.4,
    marginTop: 1,
  },

  // Scroll
  scroll: {
    paddingTop: space.md,
    paddingBottom: 40,
  },

  // Section
  section: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: 8,
    gap: 6,
  },
  sectionLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 0.8,
  },
  countDot: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  countDotText: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },

  // Card (matches project/lead/appointment card style)
  card: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: screenInset,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
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
    lineHeight: 15,
    color: color.textMuted,
    marginTop: 2,
  },
  metaPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  metaPillText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.6,
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
    marginTop: 8,
  },
  emptySub: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
    color: color.textMuted,
    textAlign: 'center',
  },
});
