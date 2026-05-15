/**
 * Notifications — v2 design.
 *
 * Aggregates time-sensitive alerts from across the app:
 *   • approval_transaction — pending expense approvals
 *   • approval_material    — pending material requests
 *   • due / late / overdue — project payments, late handover, follow-ups
 *   • today                — appointments scheduled for today
 *   • txn_*  / mr_*        — recent decisions on items I touched
 *
 * Layout:
 *   1. v2 transparent header (back · "Notifications" + count caption)
 *   2. Per-kind FormGroup-style section cards with tone-tinted IconTile
 *      rows (icon + title + subtitle + colored meta pill + chevron)
 *   3. v2 empty state when there's nothing to show
 *
 * All notification gathering / grouping logic is preserved 1:1 from
 * the previous version — only the visual layer changed.
 */
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/features/auth/useAuth';
import { useProjects } from '@/src/features/projects/useProjects';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import { useLeads } from '@/src/features/crm/useLeads';
import { useAppointments } from '@/src/features/crm/useAppointments';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useOrgMaterialRequests } from '@/src/features/materialRequests/useOrgMaterialRequests';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2, type ThemeV2 } from '@/src/theme/v2';

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
  meta: string;
  weight: number;
  href: string;
};

/**
 * Tone discipline for notifications:
 *   - red    → overdue / error / rejected (act now)
 *   - orange → pending action / warning (act now)
 *   - green  → success / approved / cleared
 *   - neutral → informational status updates (calendar, delivery progress)
 *
 * The kind icon tile is ALWAYS neutral — what matters semantically is the meta
 * pill on the right ("Payment due", "Approved", etc.), not the category icon
 * on the left. This keeps the list calm; only act-now items pull the eye.
 */
type ToneKey = 'red' | 'orange' | 'green' | 'neutral';

type KindMeta = {
  label: string;
  tone: ToneKey;
  icon: keyof typeof Ionicons.glyphMap;
};

const KIND_META: Record<NotificationKind, KindMeta> = {
  due:                  { label: 'Payment due',   tone: 'red',     icon: 'cash-outline' },
  late:                 { label: 'Delayed',       tone: 'orange',  icon: 'time-outline' },
  overdue:              { label: 'Follow-up due', tone: 'red',     icon: 'alert-circle-outline' },
  today:                { label: 'Today',         tone: 'neutral', icon: 'calendar-outline' },
  approval_material:    { label: 'Material',      tone: 'orange',  icon: 'cube-outline' },
  approval_transaction: { label: 'Expense',       tone: 'orange',  icon: 'wallet-outline' },
  txn_approved:         { label: 'Approved',      tone: 'green',   icon: 'checkmark-circle-outline' },
  txn_rejected:         { label: 'Rejected',      tone: 'red',     icon: 'close-circle-outline' },
  txn_cleared:          { label: 'Cleared',       tone: 'green',   icon: 'cash-outline' },
  mr_approved:          { label: 'Approved',      tone: 'green',   icon: 'checkmark-circle-outline' },
  mr_rejected:          { label: 'Rejected',      tone: 'red',     icon: 'close-circle-outline' },
  mr_delivery_update:   { label: 'Delivery',      tone: 'neutral', icon: 'cube-outline' },
};

// ── Component ─────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const refresh = usePullToRefresh();
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

    const visiblePendingTxns = orgTransactions.filter((tx) => {
      if (tx.workflowStatus !== 'pending_approval') return false;
      if (!uid) return false;
      if (canApproveTxnCap) return true;
      return tx.createdBy === uid;
    });
    for (const tx of visiblePendingTxns) {
      const p = projects.find((x) => x.id === tx.projectId);
      const party = tx.partyName || 'Expense';
      out.push({
        id: `at-${tx.id}`,
        kind: 'approval_transaction',
        title: p?.name ?? 'Project',
        subtitle: `${party} · ${inrCompact(tx.amount)} · awaiting approval`,
        meta: 'PENDING',
        weight: 97,
        href: `/(app)/projects/${tx.projectId}/transaction/${tx.id}`,
      });
    }

    // Recent transaction events (last 30 days) — approved / rejected / cleared.
    if (uid) {
      const cutoff = now.getTime() - 30 * 86_400_000;
      type RecentEvent = {
        kind: 'txn_approved' | 'txn_rejected' | 'txn_cleared';
        whenMs: number;
        txn: (typeof orgTransactions)[number];
      };
      const events: RecentEvent[] = [];
      const SAME_WRITE_WINDOW_MS = 5_000;

      for (const tx of orgTransactions) {
        const projName = projects.find((x) => x.id === tx.projectId)?.name;
        if (!projName) continue;

        const clearedMs = tx.settlement?.clearedAt?.toMillis();
        const approvedMs = tx.approvedAt?.toMillis();
        const sameWriteApproveAndClear =
          clearedMs != null &&
          approvedMs != null &&
          Math.abs(clearedMs - approvedMs) < SAME_WRITE_WINDOW_MS;

        if (
          tx.workflowStatus === 'posted' &&
          approvedMs != null &&
          !sameWriteApproveAndClear
        ) {
          if (
            approvedMs >= cutoff &&
            (tx.createdBy === uid || tx.approvedBy === uid)
          ) {
            events.push({ kind: 'txn_approved', whenMs: approvedMs, txn: tx });
          }
        } else if (tx.workflowStatus === 'rejected' && tx.rejectedAt) {
          const ms = tx.rejectedAt.toMillis();
          if (ms >= cutoff && (tx.createdBy === uid || tx.rejectedBy === uid)) {
            events.push({ kind: 'txn_rejected', whenMs: ms, txn: tx });
          }
        }

        if (clearedMs != null) {
          if (
            clearedMs >= cutoff &&
            (tx.createdBy === uid || tx.settlement?.clearedBy === uid)
          ) {
            events.push({ kind: 'txn_cleared', whenMs: clearedMs, txn: tx });
          }
        }
      }

      events.sort((a, b) => b.whenMs - a.whenMs);
      const RECENT_CAP = 15;
      for (const e of events.slice(0, RECENT_CAP)) {
        const tx = e.txn;
        const p = projects.find((x) => x.id === tx.projectId);
        const party = tx.partyName || 'Expense';
        const amt = inrCompact(tx.amount);
        const ago = relPast(new Date(e.whenMs));
        let subtitle: string;
        let metaLabel: string;
        if (e.kind === 'txn_approved') {
          subtitle = `${party} · ${amt} · approved`;
          metaLabel = ago.toUpperCase();
        } else if (e.kind === 'txn_rejected') {
          subtitle = `${party} · ${amt} · rejected${
            tx.rejectionNote ? ` (${tx.rejectionNote})` : ''
          }`;
          metaLabel = ago.toUpperCase();
        } else {
          const isOwn = tx.createdBy === uid;
          const isReimb = tx.submissionKind === 'expense_reimbursement';
          subtitle = isReimb
            ? isOwn
              ? `Reimbursement of ${amt} cleared`
              : `${party} reimbursed · ${amt}`
            : `Paid to ${party} · ${amt}`;
          metaLabel = ago.toUpperCase();
        }
        const ageDays = Math.max(0, (now.getTime() - e.whenMs) / 86_400_000);
        const weight = 60 - Math.min(30, ageDays);
        out.push({
          id: `${e.kind}-${tx.id}-${e.whenMs}`,
          kind: e.kind,
          title: p?.name ?? 'Project',
          subtitle,
          meta: metaLabel,
          weight,
          href: `/(app)/projects/${tx.projectId}/transaction/${tx.id}`,
        });
      }
    }

    // Recent material request events — last 30 days.
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

        if (r.status === 'approved' && !r.autoApproved && r.approvedAt) {
          const ms = r.approvedAt.toMillis();
          if (ms >= cutoff && (r.createdBy === uid || r.approvedBy === uid)) {
            mrEvents.push({ kind: 'mr_approved', whenMs: ms, req: r });
          }
        }

        if (r.status === 'rejected' && r.rejectedAt) {
          const ms = r.rejectedAt.toMillis();
          if (ms >= cutoff && (r.createdBy === uid || r.rejectedBy === uid)) {
            mrEvents.push({ kind: 'mr_rejected', whenMs: ms, req: r });
          }
        }

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
          weight: 100 + Math.abs(balance) / 1_00_000,
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
          weight: 80 + daysLate,
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
        weight: 50 + (24 - at.getHours()),
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
      'txn_approved',
      'txn_rejected',
      'txn_cleared',
      'mr_approved',
      'mr_rejected',
      'mr_delivery_update',
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
            Notifications
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            {notifications.length} {notifications.length === 1 ? 'NOTIFICATION' : 'NOTIFICATIONS'}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyBox}>
          <View
            style={[
              styles.emptyIcon,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft,
                borderRadius: t.radii.tile + 4,
              },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={32}
              color={t.palette.green.base}
            />
          </View>
          <Text
            variant="title3"
            color="label"
            style={{ marginTop: 14, fontWeight: '700' }}
          >
            All caught up
          </Text>
          <Text
            variant="callout"
            color="secondary"
            style={{ marginTop: 6, textAlign: 'center', maxWidth: 320 }}
          >
            No pending approvals, payments due, late projects, overdue
            follow-ups, or appointments today.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl {...refresh.props} />}
        >
          {grouped.map((bucket) => (
            <Section
              key={bucket.kind}
              kind={bucket.kind}
              label={bucket.label}
              items={bucket.items}
              t={t}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Section + Card ────────────────────────────────────────────────────

function Section({
  kind,
  label,
  items,
  t,
}: {
  kind: NotificationKind;
  label: string;
  items: Notification[];
  t: ThemeV2;
}) {
  const meta = KIND_META[kind];

  // Section count badge mirrors the meta pill colour discipline: neutral for
  // informational sections, palette tone for act-now sections.
  let countBg: string;
  let countFg: string;
  if (meta.tone === 'neutral') {
    countBg = t.colors.fill3;
    countFg = t.colors.secondary;
  } else {
    const tone = t.palette[meta.tone];
    countBg = t.mode === 'dark' ? tone.softDark : tone.soft;
    countFg = tone.base;
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ marginTop: 24 }}>
      <View style={styles.sectionHeader}>
        <Text variant="caption2" color="secondary" style={{ letterSpacing: 0.4 }}>
          {label.toUpperCase()}
        </Text>
        <View
          style={[
            styles.countDot,
            {
              backgroundColor: countBg,
              borderRadius: 999,
            },
          ]}
        >
          <Text
            variant="caption2"
            style={{
              color: countFg,
              fontWeight: '700',
              letterSpacing: 0.3,
            }}
          >
            {items.length}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.group,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
        ]}
      >
        {items.map((n, idx) => (
          <NotificationRow
            key={n.id}
            notif={n}
            divider={idx < items.length - 1}
            t={t}
          />
        ))}
      </View>
    </View>
  );
}

function NotificationRow({
  notif,
  divider,
  t,
}: {
  notif: Notification;
  divider: boolean;
  t: ThemeV2;
}) {
  const meta = KIND_META[notif.kind];

  // Icon tile is ALWAYS neutral — categorical, not semantic.
  const iconTileBg = t.colors.fill3;
  const iconTileFg = t.colors.secondary;

  // Meta pill carries the semantic colour: red/orange/green for act-now items,
  // neutral for purely informational updates.
  let pillBg: string;
  let pillFg: string;
  if (meta.tone === 'neutral') {
    pillBg = t.colors.fill3;
    pillFg = t.colors.secondary;
  } else {
    const tone = t.palette[meta.tone];
    pillBg = t.mode === 'dark' ? tone.softDark : tone.soft;
    pillFg = tone.base;
  }

  return (
    <Pressable
      onPress={() => router.push(notif.href as never)}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: t.colors.fill3 },
      ]}
    >
      <View
        style={[
          styles.iconTile,
          {
            backgroundColor: iconTileBg,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Ionicons name={meta.icon} size={16} color={iconTileFg} />
      </View>

      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <Text
            variant="body"
            color="label"
            style={{ flex: 1, fontWeight: '600' }}
            numberOfLines={1}
          >
            {notif.title}
          </Text>
          <View
            style={[
              styles.metaPill,
              {
                backgroundColor: pillBg,
                borderRadius: 999,
                marginLeft: 8,
              },
            ]}
          >
            <Text
              variant="caption2"
              style={{
                color: pillFg,
                fontWeight: '700',
                letterSpacing: 0.4,
              }}
              numberOfLines={1}
            >
              {notif.meta}
            </Text>
          </View>
        </View>
        <Text
          variant="caption1"
          color="secondary"
          style={{ marginTop: 2 }}
          numberOfLines={2}
        >
          {notif.subtitle}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={14}
        color={t.colors.tertiary}
        style={{ marginLeft: 8 }}
      />

      {divider ? (
        <View
          style={[
            styles.rowDivider,
            { backgroundColor: t.colors.separator, left: 60 },
          ]}
        />
      ) : null}
    </Pressable>
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

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 7,
    gap: 8,
  },
  countDot: {
    minWidth: 22,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 64,
    position: 'relative',
  },
  iconTile: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 110,
  },
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  // Empty
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
