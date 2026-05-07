/**
 * Overview tab — Interior OS home layout with live org data.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardTab as FinanceDashboardTab } from '@/src/features/finance/tabs/DashboardTab';
import { ExpensesTab as FinanceExpensesTab } from '@/src/features/finance/tabs/ExpensesTab';
import { StaffTab as FinanceStaffTab } from '@/src/features/finance/tabs/StaffTab';
import { PayrollTab as FinancePayrollTab } from '@/src/features/finance/tabs/PayrollTab';
import { AttendanceTab as FinanceAttendanceTab } from '@/src/features/finance/tabs/AttendanceTab';
import {
  type CriticalReason,
  useCriticalProjects,
} from '@/src/features/finance/useCriticalProjects';

import { useAppointments } from '@/src/features/crm/useAppointments';
import { useLeads } from '@/src/features/crm/useLeads';
import {
  getAppointmentTypeLabel,
  getLeadStatusLabel,
  LEAD_PIPELINE_ACTIVE,
  type Appointment,
  type AppointmentType,
  type Lead,
  type LeadPriority,
} from '@/src/features/crm/types';
import { useOrgFinancesTotals } from '@/src/features/finances/useOrgFinancesTotals';
import { useOrgMaterialRequests } from '@/src/features/materialRequests/useOrgMaterialRequests';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import type { RoleKey } from '@/src/features/org/types';
import { useProjects } from '@/src/features/projects/useProjects';
import type { Task } from '@/src/features/tasks/types';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import type { Transaction, TransactionCategory } from '@/src/features/transactions/types';
import {
  getCategoryLabel,
  normalizeTransactionType,
} from '@/src/features/transactions/types';
import { db } from '@/src/lib/firebase';
import { formatInr } from '@/src/lib/format';
import { Screen } from '@/src/ui/Screen';

const C = {
  bg: '#FFFFFF',
  surface: '#F8FAFC',
  surface2: '#F1F5F9',
  ink: '#0F172A',
  ink2: '#475569',
  ink3: '#94A3B8',
  hairline: '#EEF2F7',
  hairline2: '#E2E8F0',
  accent: '#2563EB',
  accentSoft: '#E8EFFE',
  accentInk: '#1D4ED8',
  success: '#0F9D58',
  successSoft: '#E3F5EB',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
} as const;

const GUTTER = 16;
const RADIUS_CARD = 12;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SegmentKey =
  | 'overview'
  | 'finance'
  | 'expenses'
  | 'staff'
  | 'payroll'
  | 'attendance';
const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: 'overview',   label: 'Overview' },
  { key: 'finance',    label: 'Finance' },
  { key: 'expenses',   label: 'Expenses' },
  { key: 'staff',      label: 'Staff' },
  { key: 'payroll',    label: 'Payroll' },
  { key: 'attendance', label: 'Attendance' },
];

const ORG_PALETTE = ['#2563EB', '#0D9488', '#9333EA', '#DB2777', '#EA580C', '#0891B2', '#65A30D'];

function inrCompact(amount: number): string {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
  if (amount >= 1e3) return `₹${(amount / 1e3).toFixed(1)}k`;
  return formatInr(amount);
}

function monthBounds() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() };
}

function projectCashMtd(transactions: Transaction[]) {
  const { y, m } = monthBounds();
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    const d = t.date?.toDate?.() ?? t.createdAt?.toDate?.();
    if (!d || d.getFullYear() !== y || d.getMonth() !== m) continue;
    const kind = normalizeTransactionType(t.type);
    if (kind === 'payment_in') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

function txnExpenseByLast7Days(transactions: Transaction[]): number[] {
  const dayTotals = [0, 0, 0, 0, 0, 0, 0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    for (const t of transactions) {
      const kind = normalizeTransactionType(t.type);
      if (kind === 'payment_in') continue;
      const dt = t.date?.toDate?.() ?? t.createdAt?.toDate?.();
      if (!dt || dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== day) continue;
      dayTotals[i] += t.amount;
    }
  }
  const max = Math.max(...dayTotals, 1);
  return dayTotals.map((v) => Math.max(12, Math.round((v / max) * 48)));
}

function orgShortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return name.slice(0, 2).toUpperCase() || 'ST';
}

function orgAccentColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * 13) % ORG_PALETTE.length;
  return ORG_PALETTE[h] ?? ORG_PALETTE[0];
}

function roleLineLabel(role: RoleKey | null, userTitle?: string): string {
  if (userTitle?.trim()) return userTitle.trim();
  if (!role) return 'Member';
  const map: Partial<Record<RoleKey, string>> = {
    superAdmin: 'Owner',
    admin: 'Admin',
    manager: 'Manager',
    accountant: 'Accountant',
    siteEngineer: 'Site Engineer',
    supervisor: 'Supervisor',
    viewer: 'Viewer',
    client: 'Client',
  };
  return map[role] ?? role;
}

function leadPriorityRank(p: LeadPriority): number {
  if (p === 'high') return 2;
  if (p === 'medium') return 1;
  return 0;
}

function leadBorderColor(p: LeadPriority) {
  if (p === 'high') return C.warning;
  if (p === 'medium') return C.accent;
  return C.ink2;
}

function txnSortMs(t: Transaction): number {
  return t.date?.toMillis() ?? t.createdAt?.toMillis() ?? 0;
}

const TXN_ICON: Partial<Record<TransactionCategory, keyof typeof Ionicons.glyphMap>> = {
  labour: 'construct-outline',
  material: 'cube-outline',
  transport: 'car-outline',
  equipment: 'hardware-chip-outline',
  sub_contractor: 'briefcase-outline',
  customer: 'person-outline',
  designer: 'color-palette-outline',
  food_and_travel: 'restaurant-outline',
  fuel: 'flame-outline',
  salary: 'cash-outline',
  rent: 'business-outline',
  others: 'ellipsis-horizontal-circle-outline',
};

function hotLeadCount(leads: Lead[]): number {
  return leads.filter(
    (l) => l.priority === 'high' && LEAD_PIPELINE_ACTIVE.includes(l.status),
  ).length;
}

function appointmentsToday(appointments: Appointment[]): Appointment[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return appointments
    .filter((a) => {
      if (a.status !== 'scheduled') return false;
      const t = a.scheduledAt?.toDate();
      if (!t) return false;
      return t >= start && t < end;
    })
    .sort((a, b) => (a.scheduledAt?.toMillis() ?? 0) - (b.scheduledAt?.toMillis() ?? 0));
}

function isTaskDueToday(t: Task): boolean {
  if (t.status === 'completed') return false;
  const end = t.endDate?.toDate();
  const start = t.startDate?.toDate();
  const due = end ?? start;
  if (!due) return false;
  const now = new Date();
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

/** Small chip used inside the critical-projects banner —
 *  conveys the reason a project is flagged. Reason → tone:
 *    overspend → red, late → amber, stale → muted slate. */
function CriticalChip({ reason }: { reason: CriticalReason }) {
  const map: Record<CriticalReason, { fg: string; bg: string; label: string }> = {
    overspend: { fg: C.danger, bg: C.dangerSoft, label: 'DUE' },
    late: { fg: C.warning, bg: C.warningSoft, label: 'LATE' },
    stale: { fg: C.ink2, bg: C.surface2, label: 'STALE' },
  };
  const tone = map[reason];
  return (
    <View style={[styles.criticalChip, { backgroundColor: tone.bg }]}>
      <Text style={[styles.criticalChipText, { color: tone.fg }]}>
        {tone.label}
      </Text>
    </View>
  );
}

function PillSuccess({ children }: { children: string }) {
  return (
    <View style={styles.pillOk}>
      <View style={styles.pillDot} />
      <Text style={styles.pillOkText}>{children}</Text>
    </View>
  );
}

function PillDanger({ children }: { children: string }) {
  return (
    <View style={[styles.pillOk, { backgroundColor: C.dangerSoft, borderColor: 'transparent' }]}>
      <Text style={[styles.pillOkText, { color: C.danger }]}>{children}</Text>
    </View>
  );
}

function PillAccent({ children }: { children: string }) {
  return (
    <View style={[styles.pillOk, { backgroundColor: C.accentSoft, borderColor: 'transparent' }]}>
      <Text style={[styles.pillOkText, { color: C.accentInk }]}>{children}</Text>
    </View>
  );
}

function Thumb({ label, size = 40, radius = 9 }: { label: string; size?: number; radius?: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: radius }]}>
      <Text style={styles.thumbText}>{label}</Text>
    </View>
  );
}

export default function OverviewTabScreen() {
  const insets = useSafeAreaInsets();
  const { data: org } = useCurrentOrganization();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { role, can } = usePermissions();

  const { data: projects } = useProjects();
  const { transactions, totalsByProject, loading: totalsLoading } =
    useProjectTotals(orgId);
  const { mtd: finMtd, loading: finLoading } = useOrgFinancesTotals(orgId);
  const { data: pendingMr } = useOrgMaterialRequests(orgId, 'pending');
  const { data: appointments } = useAppointments(orgId);
  const { data: leads } = useLeads(orgId);

  const [orgTasks, setOrgTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!orgId) {
      setOrgTasks([]);
      return;
    }
    const unsub = db
      .collection('tasks')
      .where('orgId', '==', orgId)
      .limit(120)
      .onSnapshot(
        (snap) => {
          const rows: Task[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Task, 'id'>),
          }));
          setOrgTasks(rows);
        },
        (err) => {
          console.warn('[Overview] org tasks:', err);
          setOrgTasks([]);
        },
      );
    return unsub;
  }, [orgId]);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === 'active'),
    [projects],
  );

  const projectMtd = useMemo(() => projectCashMtd(transactions), [transactions]);

  const combined = useMemo(() => {
    const inTotal = projectMtd.income + finMtd.income;
    const outTotal = projectMtd.expense + finMtd.expense;
    return { in: inTotal, out: outTotal, net: inTotal - outTotal };
  }, [projectMtd, finMtd]);

  const marginPct = useMemo(() => {
    if (combined.in <= 0) return null;
    return ((combined.in - combined.out) / combined.in) * 100;
  }, [combined]);

  // Critical-projects detection — surfaces overspend / late /
  // stale projects below the headline balance card. Hidden when
  // there are zero critical projects (nothing to flag).
  const { rows: criticalRows } = useCriticalProjects();

  // Per-project balance bars — top 6 projects by absolute balance,
  // sorted worst (most negative) → best. Replaces the old 7-day
  // expense column chart, which showed nothing actionable.
  const projectBars = useMemo(() => {
    type Row = { id: string; name: string; balance: number };
    const rows: Row[] = [];
    for (const p of projects) {
      if (p.status !== 'active' && p.status !== 'on_hold') continue;
      const t = totalsByProject.get(p.id);
      if (!t) continue;
      rows.push({ id: p.id, name: p.name, balance: t.balance });
    }
    rows.sort((a, b) => a.balance - b.balance);
    const top = rows.slice(0, 6);
    const maxAbs = Math.max(1, ...top.map((r) => Math.abs(r.balance)));
    return top.map((r) => ({
      ...r,
      pct: Math.max(2, Math.round((Math.abs(r.balance) / maxAbs) * 100)),
      isLoss: r.balance < 0,
    }));
  }, [projects, totalsByProject]);

  const apptsToday = useMemo(() => appointmentsToday(appointments), [appointments]);

  const tasksToday = useMemo(() => {
    const list = orgTasks.filter(isTaskDueToday);
    const byProject = new Map(projects.map((p) => [p.id, p.name]));
    return list
      .map((t) => ({ task: t, projectName: byProject.get(t.projectId) ?? 'Project' }))
      .slice(0, 8);
  }, [orgTasks, projects]);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const leadsHot = useMemo(() => hotLeadCount(leads), [leads]);

  const pipelineLeads = useMemo(
    () =>
      leads
        .filter((l) => LEAD_PIPELINE_ACTIVE.includes(l.status))
        .sort((a, b) => {
          const pr = leadPriorityRank(b.priority) - leadPriorityRank(a.priority);
          if (pr !== 0) return pr;
          return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
        }),
    [leads],
  );

  // Overview is a glance surface — show only the 12 most-recent project
  // transactions. The full ledger lives at `/(app)/more/ledger` (the
  // "View all" link below jumps there).
  const RECENT_LEDGER_LIMIT = 12;
  const ledgerTotalCount = transactions.length;
  const ledgerTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => txnSortMs(b) - txnSortMs(a))
        .slice(0, RECENT_LEDGER_LIMIT),
    [transactions],
  );

  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
  const monthUpper = monthName.toUpperCase();

  const headerDate = useMemo(() => {
    const d = new Date();
    const w = d.toLocaleDateString('en-IN', { weekday: 'short' });
    const day = d.getDate();
    const m = d.toLocaleDateString('en-IN', { month: 'short' });
    return `${w} · ${day} ${m} · ${roleLineLabel(role, userDoc?.role)}`;
  }, [role, userDoc?.role]);

  const orgName = org?.name ?? 'Studio';
  const orgColor = orgAccentColor(orgName);
  const orgInitials = orgShortName(orgName);

  const moneyLoading = totalsLoading || finLoading;

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

  const apptTypeColor = (t: AppointmentType) => {
    if (t === 'site_visit') return C.success;
    if (t === 'office_meeting') return C.accent;
    if (t === 'virtual_call') return C.warning;
    return C.ink2;
  };

  const notifDot = pendingMr.length > 0 || leadsHot > 0;

  // ── Tab pager (Overview | Finance) ────────────────────────────
  // Honours the `?tab=finance` deep-link so the Settings entry can
  // open this screen straight on the Finance page. Pattern matches
  // `app/(app)/(tabs)/crm.tsx` (Leads | Appointments) so the user
  // sees a single, consistent tab interaction across the app.
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const initialTabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialSegment: SegmentKey =
    initialTabParam === 'finance' ||
    initialTabParam === 'expenses' ||
    initialTabParam === 'staff' ||
    initialTabParam === 'payroll' ||
    initialTabParam === 'attendance'
      ? (initialTabParam as SegmentKey)
      : 'overview';

  const [segment, setSegment] = useState<SegmentKey>(initialSegment);
  const canFinanceRead = can('finance.read');
  const pagerRef = useRef<FlatList<(typeof SEGMENTS)[number]> | null>(null);
  const tabBarRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const tabBarWidth = useRef(0);
  const isUserSwipe = useRef(true);

  const onTabBarLayout = useCallback((e: LayoutChangeEvent) => {
    tabBarWidth.current = e.nativeEvent.layout.width;
  }, []);
  const onTabLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabLayouts.current[key] = { x, width };
  }, []);
  const syncTabBarToActive = useCallback(
    (key: SegmentKey, animated = true) => {
      const layout = tabLayouts.current[key];
      if (!layout || !tabBarRef.current) return;
      const targetX = Math.max(0, layout.x - (tabBarWidth.current - layout.width) / 2);
      tabBarRef.current.scrollTo({ x: targetX, animated });
    },
    [],
  );
  const handleSegmentChange = useCallback(
    (next: SegmentKey) => {
      setSegment(next);
      syncTabBarToActive(next, true);
      const idx = SEGMENTS.findIndex((s) => s.key === next);
      if (idx >= 0) {
        isUserSwipe.current = false;
        pagerRef.current?.scrollToIndex({ index: idx, animated: true });
      }
    },
    [syncTabBarToActive],
  );
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!isUserSwipe.current || viewableItems.length === 0) return;
      const key = viewableItems[0].item.key as SegmentKey;
      setSegment(key);
    },
  ).current;
  const onScrollBeginDrag = useCallback(() => {
    isUserSwipe.current = true;
  }, []);
  const onMomentumScrollEnd = useCallback(() => {
    isUserSwipe.current = true;
  }, []);
  useEffect(() => {
    syncTabBarToActive(segment, true);
  }, [segment, syncTabBarToActive]);

  // Existing Overview body — lifted into a const so it can be
  // rendered as Page 0 of the swipeable pager. Reading state /
  // hooks at render time still works because this is a JSX
  // expression evaluated each render, not a memoised closure.
  const overviewBody = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 48 + insets.bottom, backgroundColor: C.bg }}
      showsVerticalScrollIndicator={false}
    >
        {/* Screen already inserts the safe-area top inset via its
            wrapping SafeAreaView (edges=['top','left','right']), so
            the headerRow only needs its own internal padding. The
            previous `paddingTop: 8 + insets.top` was double-applying
            the inset and creating a ~60px empty band on iOS. */}
        <View style={styles.headerRow}>
          {/* Org pill — primary entry to the studio switcher. Tap
              navigates to the full-page Select Company picker
              instead of opening an inline sheet (matches the chip
              behaviour on every other tab). */}
          <Pressable
            style={styles.orgPill}
            onPress={() => router.push('/(app)/select-company' as never)}
          >
            <View style={[styles.orgAvatar, { backgroundColor: orgColor }]}>
              <Text style={styles.orgAvatarText}>{orgInitials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.orgName} numberOfLines={1}>
                  {orgName}
                </Text>
                <Ionicons name="chevron-down" size={12} color={C.ink3} />
              </View>
              <Text style={styles.orgMeta}>{headerDate}</Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push('/(app)/(tabs)/crm' as never)}
          >
            <Ionicons name="calendar-outline" size={17} color={C.ink} />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push('/(app)/notifications' as never)}
          >
            <Ionicons name="notifications-outline" size={17} color={C.ink} />
            {notifDot ? <View style={styles.notifDot} /> : null}
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: GUTTER, paddingBottom: 16 }}>
          <View style={styles.balanceCard}>
            <View style={styles.balanceTop}>
              <Text style={styles.balanceLabel}>{`NET BALANCE · ${monthUpper}`}</Text>
              {marginPct != null && Number.isFinite(marginPct) ? (
                marginPct >= 0 ? (
                  <PillSuccess>{`+${marginPct.toFixed(1)}%`}</PillSuccess>
                ) : (
                  <PillDanger>{`${marginPct.toFixed(1)}%`}</PillDanger>
                )
              ) : null}
            </View>
            {moneyLoading ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={C.accent} />
            ) : (
              <Text style={styles.balanceBig}>{formatInr(combined.net)}</Text>
            )}
            <View style={styles.balanceRow3}>
              <View>
                <Text style={styles.balanceMini}>IN</Text>
                <Text style={[styles.balanceMiniVal, { color: C.success }]}>+{inrCompact(combined.in)}</Text>
              </View>
              <View>
                <Text style={styles.balanceMini}>OUT</Text>
                <Text style={[styles.balanceMiniVal, { color: C.ink }]}>−{inrCompact(combined.out)}</Text>
              </View>
              <View>
                <Text style={styles.balanceMini}>ACTIVE</Text>
                <Text style={styles.balanceMiniVal}>{activeProjects.length} projects</Text>
              </View>
            </View>
            {/* Per-project balance bars — replaces the previous
                7-day expense column chart. Each row = one active /
                on-hold project, sorted worst-balance first. Bar
                fill width is `|balance| / max-|balance|`. Green
                bars = profit, red = loss. Tap a row → project. */}
            {projectBars.length > 0 ? (
              <View style={styles.projectBarsBlock}>
                <Text style={styles.projectBarsLabel}>PROJECTS · BALANCE</Text>
                {projectBars.map((row) => (
                  <Pressable
                    key={row.id}
                    onPress={() =>
                      router.push(`/(app)/projects/${row.id}` as never)
                    }
                    style={({ pressed }) => [
                      styles.projectBarRow,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.projectBarName} numberOfLines={1}>
                      {row.name}
                    </Text>
                    <View style={styles.projectBarTrack}>
                      <View
                        style={[
                          styles.projectBarFill,
                          {
                            width: `${row.pct}%`,
                            backgroundColor: row.isLoss ? C.danger : C.success,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.projectBarValue,
                        { color: row.isLoss ? C.danger : C.success },
                      ]}
                      numberOfLines={1}
                    >
                      {row.isLoss ? '−' : '+'}
                      {inrCompact(Math.abs(row.balance))}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {/* Critical-projects banner — surfaces only when at least
            one active project is flagged (overspend / late /
            stale). Hidden silently when nothing's wrong, so the
            page stays clean on a healthy month. */}
        {criticalRows.length > 0 ? (
          <View style={{ paddingHorizontal: GUTTER, paddingBottom: 16 }}>
            <View style={styles.criticalCard}>
              <View style={styles.criticalHead}>
                <Ionicons name="warning-outline" size={16} color={C.danger} />
                <Text style={styles.criticalHeadText}>
                  {criticalRows.length} project{criticalRows.length === 1 ? '' : 's'} need attention
                </Text>
              </View>
              {criticalRows.slice(0, 4).map((row) => (
                <Pressable
                  key={row.project.id}
                  onPress={() =>
                    router.push(`/(app)/projects/${row.project.id}` as never)
                  }
                  style={({ pressed }) => [
                    styles.criticalRow,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.criticalRowName} numberOfLines={1}>
                    {row.project.name}
                  </Text>
                  <View style={styles.criticalChips}>
                    {row.reasons.map((r) => (
                      <CriticalChip key={r} reason={r} />
                    ))}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={C.ink3}
                    style={{ marginLeft: 4 }}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.quickRow}>
          <Pressable
            style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.9 }]}
            onPress={() => {
              if (can('finance.write')) router.push('/(app)/finance/new-expense' as never);
            }}
            disabled={!can('finance.write')}
          >
            <View style={styles.quickIconWrap}>
              <Ionicons name="add" size={15} color={C.accent} />
            </View>
            <Text style={styles.quickLabel}>Add expense</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.9 }]}
            onPress={() => router.push('/(app)/notifications' as never)}
          >
            <View style={styles.quickIconWrap}>
              <Ionicons name="checkmark-circle-outline" size={15} color={C.accent} />
            </View>
            <Text style={styles.quickLabel}>Approvals</Text>
            {pendingMr.length > 0 ? (
              <View style={styles.quickBadge}>
                <Text style={styles.quickBadgeText}>{pendingMr.length > 9 ? '9+' : String(pendingMr.length)}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.9 }]}
            onPress={() => router.push('/(app)/(tabs)/crm' as never)}
          >
            <View style={styles.quickIconWrap}>
              <Ionicons name="locate-outline" size={15} color={C.accent} />
            </View>
            <Text style={styles.quickLabel}>Leads</Text>
            {can('crm.write') && leadsHot > 0 ? (
              <View style={styles.quickBadge}>
                <Text style={styles.quickBadgeText}>{leadsHot > 9 ? '9+' : String(leadsHot)}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickTile, pressed && { opacity: 0.9 }]}
            onPress={() => router.push('/(app)/(tabs)/crm' as never)}
          >
            <View style={styles.quickIconWrap}>
              <Ionicons name="calendar-outline" size={15} color={C.accent} />
            </View>
            <Text style={styles.quickLabel}>Schedule</Text>
          </Pressable>
        </View>

        {pendingMr.length > 0 ? (
          <View style={{ paddingBottom: 22 }}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { fontFamily: 'Menlo' }]}>
                PENDING APPROVALS · {pendingMr.length}
              </Text>
              <Pressable onPress={() => pendingMr[0] && router.push(`/(app)/projects/${pendingMr[0].projectId}/material-request/${pendingMr[0].id}` as never)}>
                <Text style={styles.sectionLink}>Open</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {pendingMr.slice(0, 8).map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => router.push(`/(app)/projects/${r.projectId}/material-request/${r.id}` as never)}
                  style={[styles.apptCard, { borderLeftColor: C.warning }]}
                >
                  <Text style={styles.apptKind}>MATERIAL</Text>
                  <Text style={styles.apptTitle} numberOfLines={2}>
                    {r.title}
                  </Text>
                  <Text style={styles.apptWhere} numberOfLines={1}>
                    {formatInr(r.totalValue)} · {projectById.get(r.projectId)?.name ?? 'Project'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {apptsToday.length > 0 ? (
          <View style={{ paddingBottom: 22 }}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                TODAY · {apptsToday.length} APPOINTMENT{apptsToday.length === 1 ? '' : 'S'}
              </Text>
              <Pressable onPress={() => router.push('/(app)/(tabs)/crm' as never)}>
                <Text style={styles.sectionLink}>See schedule</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {apptsToday.map((a) => {
                const start = a.scheduledAt?.toDate() ?? new Date();
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/(app)/crm/appointment/${a.id}` as never)}
                    style={[styles.apptCard, { borderLeftColor: apptTypeColor(a.type) }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View>
                        <Text style={styles.apptTime}>{fmtTime(start)}</Text>
                        <Text style={styles.apptKind}>{getAppointmentTypeLabel(a.type).toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.apptTitle}>{a.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
                      <Ionicons name="location-outline" size={11} color={C.ink3} />
                      <Text style={styles.apptWhere} numberOfLines={1}>
                        {a.location ?? a.clientAddress ?? '—'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {can('crm.write') ? (
          <View style={{ paddingBottom: 22 }}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { fontFamily: 'Menlo' }]}>
                LEADS · PIPELINE · {pipelineLeads.length}
              </Text>
              <Pressable onPress={() => router.push('/(app)/(tabs)/crm' as never)}>
                <Text style={styles.sectionLink}>See all</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRail}>
              {pipelineLeads.length === 0 ? (
                <Text style={[styles.ledgerSub, { paddingHorizontal: GUTTER, paddingVertical: 8 }]}>
                  No open leads. Add one from CRM.
                </Text>
              ) : (
                <>
                  {pipelineLeads.slice(0, 14).map((lead) => (
                    <Pressable
                      key={lead.id}
                      onPress={() => router.push(`/(app)/crm/lead/${lead.id}` as never)}
                      style={[styles.leadCard, { borderLeftColor: leadBorderColor(lead.priority) }]}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Thumb label={orgShortName(lead.name)} size={36} radius={8} />
                        {lead.priority === 'high' ? <PillAccent>HOT</PillAccent> : null}
                      </View>
                      <Text style={styles.apptKind}>{getLeadStatusLabel(lead.status).toUpperCase()}</Text>
                      <Text style={styles.leadName} numberOfLines={2}>
                        {lead.name}
                      </Text>
                      <Text style={styles.apptWhere} numberOfLines={2}>
                        {[lead.location, lead.budget != null ? formatInr(lead.budget) : null]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={styles.newLeadCard}
                    onPress={() => router.push('/(app)/crm/add-lead' as never)}
                  >
                    <Ionicons name="add" size={22} color={C.ink3} />
                    <Text style={styles.newLeadText}>Add lead</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        ) : null}

        {tasksToday.length > 0 ? (
          <View style={{ paddingBottom: 22 }}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { fontFamily: 'Menlo' }]}>TODAY · {tasksToday.length}</Text>
              <Pressable onPress={() => router.push('/(app)/(tabs)/index' as never)}>
                <Text style={styles.sectionLink}>All tasks</Text>
              </Pressable>
            </View>
            <View style={styles.groupBorder}>
              {tasksToday.map(({ task, projectName }, i) => (
                <Pressable
                  key={task.id}
                  onPress={() => router.push(`/(app)/projects/${task.projectId}/task/${task.id}` as never)}
                  style={[styles.taskRow, i < tasksToday.length - 1 && styles.ledgerRowDivider]}
                >
                  <View style={styles.taskCheck} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.ledgerTitle} numberOfLines={1}>
                      {task.title}
                    </Text>
                    <Text style={styles.ledgerSub} numberOfLines={1}>
                      {`${projectName} · ${fmtTime((task.endDate ?? task.startDate)?.toDate() ?? new Date())}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={C.ink3} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {can('transaction.read') ? (
          <View style={{ paddingBottom: 20 }}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { fontFamily: 'Menlo' }]}>
                LEDGER · RECENT · {ledgerTransactions.length}
                {ledgerTotalCount > ledgerTransactions.length
                  ? ` OF ${ledgerTotalCount}`
                  : ''}
              </Text>
              <Pressable
                onPress={() => {
                  router.push({ pathname: '/(app)/more/ledger', params: { title: 'Ledger' } } as never);
                }}
              >
                <Text style={styles.sectionLink}>View all</Text>
              </Pressable>
            </View>
            <View style={styles.groupBorder}>
              {ledgerTransactions.map((row, i) => {
                const kind = normalizeTransactionType(row.type);
                const cat = (row.category ?? 'others') as TransactionCategory;
                const ion = TXN_ICON[cat] ?? 'receipt-outline';
                const dt = row.date?.toDate() ?? row.createdAt?.toDate();
                const rel = dt
                  ? dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  : '—';
                const projName = projectById.get(row.projectId)?.name ?? 'Project';
                const subtitle = `${projName} · ${getCategoryLabel(cat)} · ${rel}`;
                const isIn = kind === 'payment_in';
                const amt = isIn ? `+${formatInr(row.amount)}` : `−${formatInr(row.amount)}`;
                const status = row.status?.toUpperCase() ?? '—';
                const title = row.description?.trim() || getCategoryLabel(cat);
                return (
                  <Pressable
                    key={row.id}
                    onPress={() =>
                      router.push(`/(app)/projects/${row.projectId}/transaction/${row.id}` as never)
                    }
                    style={[styles.ledgerRow, i < ledgerTransactions.length - 1 && styles.ledgerRowDivider]}
                  >
                    <View style={styles.ledgerIconWrap}>
                      <Ionicons name={ion} size={16} color={C.ink2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.ledgerTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      <Text style={styles.ledgerSub} numberOfLines={1}>
                        {row.partyName ? `${row.partyName} · ${subtitle}` : subtitle}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[styles.ledgerAmt, { color: isIn ? C.success : C.ink }]}
                      >
                        {amt}
                      </Text>
                      <Text
                        style={[
                          styles.ledgerStatus,
                          { color: row.status === 'pending' ? C.warning : C.ink3 },
                        ]}
                      >
                        {status}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={C.ink3} style={{ marginLeft: 4 }} />
                  </Pressable>
                );
              })}
              {ledgerTransactions.length === 0 ? (
                <View style={{ padding: GUTTER }}>
                  <Text style={styles.ledgerSub}>No project transactions yet.</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
  );

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: C.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Underline tab strip — Overview · Finance.
          Same render shape as `app/(app)/(tabs)/crm.tsx` so the
          two surfaces feel consistent. The Finance tab is hidden
          for roles without `finance.read` — site / supervisor /
          client land directly on Overview with no tab strip
          showing. */}
      {canFinanceRead ? (
        <ScrollView
          ref={tabBarRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
          onLayout={onTabBarLayout}
        >
          {SEGMENTS.map((item) => {
            const active = segment === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => handleSegmentChange(item.key)}
                style={styles.tabBtn}
                onLayout={(e) => onTabLayout(item.key, e)}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: active ? C.ink : C.ink2,
                      fontWeight: active ? '600' : '500',
                    },
                  ]}
                >
                  {item.label}
                </Text>
                <View
                  style={[
                    styles.tabUnderline,
                    active && { backgroundColor: C.accent },
                  ]}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {can('finance.read') ? (
        <FlatList
          ref={pagerRef}
          data={SEGMENTS}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
              {item.key === 'overview' ? (
                overviewBody
              ) : item.key === 'finance' ? (
                <FinanceDashboardTab />
              ) : item.key === 'expenses' ? (
                <FinanceExpensesTab />
              ) : item.key === 'staff' ? (
                <FinanceStaffTab />
              ) : item.key === 'payroll' ? (
                <FinancePayrollTab />
              ) : (
                <FinanceAttendanceTab />
              )}
            </View>
          )}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onScrollBeginDrag={onScrollBeginDrag}
          onMomentumScrollEnd={onMomentumScrollEnd}
        />
      ) : (
        // Roles without finance.read: render the Overview body
        // directly — no tab strip, no pager, just the page they've
        // always seen.
        overviewBody
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ── Per-project balance bars (replaces 7-day expense chart)
  projectBarsBlock: { marginTop: 14, gap: 8 },
  projectBarsLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: C.ink3,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  projectBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectBarName: {
    width: 96,
    fontSize: 12,
    color: C.ink,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  projectBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  projectBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  projectBarValue: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'right',
  },

  // ── Critical-projects banner
  criticalCard: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: RADIUS_CARD,
    padding: 12,
    gap: 6,
  },
  criticalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  criticalHeadText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.danger,
    letterSpacing: 0.2,
  },
  criticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.hairline,
  },
  criticalRowName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
    letterSpacing: -0.1,
  },
  criticalChips: {
    flexDirection: 'row',
    gap: 4,
  },
  criticalChip: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  criticalChipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  // Tab pager — Overview · Finance
  tabBar: {
    flexGrow: 0,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.hairline2,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline2,
  },
  tabBarContent: { paddingHorizontal: GUTTER },
  tabBtn: { paddingHorizontal: 12, paddingTop: 10 },
  tabLabel: {
    fontSize: 13,
    paddingBottom: 8,
  },
  tabUnderline: {
    height: 2,
    backgroundColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: GUTTER,
    paddingBottom: 14,
  },
  orgPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 10,
    // Soft-square corners to match the avatar (8px) and the icon
    // buttons next to it (10px). The earlier 999 pill shape made
    // the outer container fight the squarish avatar inside it.
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.hairline2,
  },
  orgAvatar: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: -0.2 },
  orgName: { fontSize: 13, fontWeight: '700', color: C.ink, letterSpacing: -0.2, maxWidth: 160 },
  orgMeta: { fontSize: 11, color: C.ink2, marginTop: 2 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.hairline2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
  },
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.danger,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  balanceCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: C.bg,
    borderRadius: RADIUS_CARD,
    borderWidth: 1,
    borderColor: C.hairline2,
    // No `elevation` either — on Android the OS paints the grey
    // Material shadow one frame BEFORE the card's white background
    // catches up, so users see standalone grey rectangles flashing
    // behind the cards on Projects→Overview transitions (heaviest
    // tab swap → longest paint window). iOS ignores elevation, which
    // is why the artifact was Android-only. Hairline border above is
    // enough visual depth.
  },
  balanceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  balanceBig: {
    fontSize: 30,
    fontWeight: '700',
    color: C.ink,
    marginTop: 6,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  balanceRow3: { flexDirection: 'row', gap: 16, marginTop: 4 },
  balanceMini: {
    fontSize: 10,
    color: C.ink3,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  balanceMiniVal: { fontSize: 13, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  barChart: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 32,
  },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', minHeight: 3, borderRadius: 2 },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  barLabelChar: { fontSize: 9.5, color: C.ink3, fontWeight: '600', letterSpacing: 0.6 },
  pillOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: C.successSoft,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  pillOkText: { fontSize: 11, fontWeight: '600', color: C.success, letterSpacing: 0.1 },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: GUTTER,
    paddingBottom: 22,
  },
  quickTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.hairline2,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.bg,
    position: 'relative',
    // No iOS shadow* AND no Android elevation — both rendered the
    // grey Material shadow under each tile a frame before the white
    // background painted, leaving ghost rectangles flashing during
    // Projects→Overview. Border alone gives the same visual hint
    // without the OS-level shadow render race.
  },
  quickIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: 11,
    color: C.ink,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  quickBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  quickBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: GUTTER,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    color: C.ink3,
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  sectionLink: { fontSize: 13, color: C.accent, fontWeight: '600' },
  hRail: {
    flexDirection: 'row',
    paddingHorizontal: GUTTER,
    paddingBottom: 4,
    gap: 10,
    alignItems: 'stretch',
  },
  apptCard: {
    width: 220,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.hairline2,
    borderLeftWidth: 3,
    marginRight: 10,
  },
  apptTime: { fontSize: 13, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  apptKind: { fontSize: 10, color: C.ink3, fontWeight: '600', letterSpacing: 0.4, marginTop: 2 },
  apptTitle: { fontSize: 13, fontWeight: '600', color: C.ink, marginTop: 8, lineHeight: 17, letterSpacing: -0.1 },
  apptWhere: { fontSize: 11, color: C.ink2, flex: 1 },
  leadCard: {
    width: 220,
    padding: 12,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.hairline2,
    borderLeftWidth: 3,
    marginRight: 10,
  },
  leadName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
    marginTop: 6,
    lineHeight: 18,
    letterSpacing: -0.15,
  },
  newLeadCard: {
    width: 140,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.hairline2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginRight: 10,
  },
  newLeadText: { fontSize: 12, color: C.ink3, marginTop: 6 },
  thumb: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbText: { fontSize: 11, fontWeight: '500', color: C.ink2, letterSpacing: 0.5 },
  groupBorder: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.hairline,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: GUTTER,
    paddingVertical: 8,
  },
  ledgerRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.hairline,
  },
  ledgerIconWrap: {
    width: 32,
    height: 32,
    marginRight: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerTitle: { fontSize: 15, fontWeight: '500', color: C.ink, letterSpacing: -0.1 },
  ledgerSub: { fontSize: 13, color: C.ink2, marginTop: 2, lineHeight: 16 },
  ledgerAmt: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  ledgerStatus: { fontSize: 10, letterSpacing: 0.5, marginTop: 2, fontFamily: 'Menlo' },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: GUTTER,
    paddingVertical: 8,
  },
  taskCheck: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: C.hairline2,
    marginRight: 12,
    borderRadius: 2,
  },
});
