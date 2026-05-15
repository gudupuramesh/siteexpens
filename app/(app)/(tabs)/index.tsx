/**
 * Projects tab — v2 design.
 *
 * Layout (top → bottom):
 *   1. AmbientBackground (soft radial glows)
 *   2. Single-line header — "Projects" title2 · OrgSwitcher · notif
 *   3. Unified summary card — period label + margin pill, hero NET
 *      BALANCE amount with inline IN/OUT caption, hairline, and a
 *      3-cell counts strip (ACTIVE / OPEN TASKS / MATERIAL). The
 *      finance zone hides for client roles, leaving just the counts.
 *   4. Search field + filter button
 *   5. Active filter chip (only when set)
 *   6. Project list — each project is its OWN card (LeadCard-style),
 *      stacked with a 10px gap. Two zones split by a hairline:
 *        TOP: 40px building avatar (typology icon in neutral fill3) +
 *             optional LATE/DUE overlay dot at the top-right + project
 *             name with location subline + lifecycle status pill on
 *             the right (Active / On Hold / Completed / Archived).
 *        BOTTOM: labelled meta cells — PROGRESS · IN · OUT. The +IN
 *             value paints green and the −OUT value paints red so
 *             polarity reads at a glance. Roles without finance access
 *             see only the PROGRESS cell.
 *   7. Floating action button (v2 FAB, bottom-right) → /projects/new
 *
 * Filter sheet uses v2 SelectSheet (status) + v2 DateTimeSheet (date).
 */
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOrgMaterialRequests } from '@/src/features/materialRequests/useOrgMaterialRequests';
import { useOrgFinancesTotals } from '@/src/features/finances/useOrgFinancesTotals';
import {
  type Project,
  type ProjectStatus,
  type ProjectTypology,
} from '@/src/features/projects/types';
import { useProjects } from '@/src/features/projects/useProjects';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useOrgOpenTaskCount } from '@/src/features/tasks/useOrgOpenTaskCount';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import { normalizeTransactionType, type Transaction } from '@/src/features/transactions/types';
import { formatInr } from '@/src/lib/format';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import {
  ProjectAmountSparkline,
  type SparkBar,
} from '@/src/ui/v2/ProjectAmountSparkline';
import { FAB } from '@/src/ui/v2/FAB';
import { OrgSwitcher } from '@/src/ui/v2/OrgSwitcher';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { inrCompact, useThemeV2, type ThemeV2 } from '@/src/theme/v2';

function getAreaFromSiteAddress(siteAddress?: string): string | undefined {
  if (!siteAddress) return undefined;
  const firstChunk = siteAddress.split(',')[0]?.trim();
  return firstChunk || undefined;
}

/** Sum project transactions that fall in the current month, split by direction.
 *  Mirrors the same helper used on the Overview tab so both surfaces report
 *  identical numbers. */
function projectCashMtd(transactions: Transaction[]) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    const d = tx.date?.toDate?.() ?? tx.createdAt?.toDate?.();
    if (!d || d.getFullYear() !== y || d.getMonth() !== m) continue;
    const kind = normalizeTransactionType(tx.type);
    if (kind === 'payment_in') income += tx.amount;
    else expense += tx.amount;
  }
  return { income, expense };
}

/** Per-project MTD net balance (income − expense) for the current
 *  month. Returned sorted by descending |balance| so the most-active
 *  projects render leftmost in the hero-zone sparkline. Used to feed
 *  `<ProjectAmountSparkline>`; the dummy padding is added downstream. */
function projectMtdBalances(transactions: Transaction[]): number[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const map = new Map<string, number>();
  for (const tx of transactions) {
    const d = tx.date?.toDate?.() ?? tx.createdAt?.toDate?.();
    if (!d || d.getFullYear() !== y || d.getMonth() !== m) continue;
    const kind = normalizeTransactionType(tx.type);
    const sign = kind === 'payment_in' ? 1 : -1;
    map.set(tx.projectId, (map.get(tx.projectId) ?? 0) + sign * tx.amount);
  }
  const arr = Array.from(map.values()).filter((v) => v !== 0);
  arr.sort((a, b) => Math.abs(b) - Math.abs(a));
  return arr;
}

/** Hero-zone sparkline target slot count. Real per-project bars fill
 *  from the left; remaining slots are padded with grey dummies so the
 *  chart always has a stable shape — even on a fresh studio with one
 *  project. */
const SPARKLINE_TARGET_BARS = 8;

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

/** Building icon picked by the project's typology. Falls back to a
 *  generic cube when the typology is unset or "other". */
const BUILDING_ICON: Record<ProjectTypology, keyof typeof Ionicons.glyphMap> = {
  residential: 'home',
  commercial: 'business',
  hospitality: 'restaurant',
  industrial: 'construct',
  other: 'cube-outline',
};

/** Window (in days) before `endDate` where an active project is treated
 *  as "DUE soon" and earns the orange overlay badge. Past `endDate` it
 *  graduates to the red LATE badge. */
const DUE_SOON_DAYS = 7;

/** Lifecycle status pill — the small chip beside the project name on
 *  the title row. LATE/DUE are NOT handled here; they show up as a
 *  round overlay on the avatar instead. on_hold gets orange, every
 *  other status reads neutral. */
function getStatusPill(
  status: ProjectStatus,
  t: ThemeV2,
): {
  bg: string;
  fg: string;
  label: string;
} {
  if (status === 'on_hold') {
    return {
      bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
      fg: t.palette.orange.base,
      label: STATUS_LABELS.on_hold,
    };
  }
  return {
    bg: t.colors.fill3,
    fg: t.colors.secondary,
    label: STATUS_LABELS[status],
  };
}

/** Round avatar-overlay badge for time-based alerts on active projects.
 *  Matches the user's "round style like the member" cue — a tiny
 *  white-bordered colored circle that lifts off the building avatar. */
function getOverlayBadge(
  status: ProjectStatus,
  endDate: Date | null,
  t: ThemeV2,
): { color: string; icon: keyof typeof Ionicons.glyphMap; label: string } | null {
  if (status !== 'active' || !endDate) return null;
  const now = Date.now();
  const end = endDate.getTime();
  if (end < now) {
    return { color: t.palette.red.base, icon: 'alert', label: 'LATE' };
  }
  const daysLeft = (end - now) / (1000 * 60 * 60 * 24);
  if (daysLeft <= DUE_SOON_DAYS) {
    return { color: t.palette.orange.base, icon: 'time', label: 'DUE' };
  }
  return null;
}

const STATUS_OPTIONS: { key: 'all' | ProjectStatus; label: string }[] = [
  { key: 'all',       label: 'All statuses' },
  { key: 'active',    label: 'Active' },
  { key: 'on_hold',   label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived',  label: 'Archived' },
];

export default function ProjectsTabScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const refresh = usePullToRefresh();
  const { data: projects, loading } = useProjects();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const {
    transactions,
    totalsByProject,
    loading: totalsLoading,
  } = useProjectTotals(orgId);
  const { mtd: finMtd, loading: finLoading } = useOrgFinancesTotals(orgId);
  const { can, role } = usePermissions();
  const canCreateProject = can('project.create');

  const { data: materialRequests } = useOrgMaterialRequests(orgId);
  const { openCount } = useOrgOpenTaskCount(orgId);

  const pendingMaterialCount = useMemo(
    () => materialRequests.filter((r) => r.status === 'pending').length,
    [materialRequests],
  );
  // Transactions a supervisor / site engineer submitted for an admin
  // to review (workflowStatus === 'pending_approval'). Drives the
  // home-tab summary card's APPROVALS cell + the org-wide approvals
  // inbox screen. Same `transactions` array that feeds the hero
  // numbers, so the count is always in lock-step with the ledger.
  const pendingApprovalCount = useMemo(
    () =>
      transactions.filter((t) => t.workflowStatus === 'pending_approval').length,
    [transactions],
  );

  const canSeeProjectFinance =
    role === 'superAdmin'
    || role === 'admin'
    || role === 'manager'
    || role === 'accountant'
    || role === 'viewer'
    || role === 'siteEngineer';

  // Month-to-date hero card data — combines per-project transaction totals
  // (rich finance) with org-level direct entries (e.g. office expenses).
  // Mirrors the same computation on the Overview tab so the two screens
  // never disagree.
  const projectMtd = useMemo(() => projectCashMtd(transactions), [transactions]);
  // Per-project bars for the hero-zone sparkline. Real bars come from
  // `projectMtdBalances` (sorted by |balance|, biggest first); we then
  // pad with grey dummies up to SPARKLINE_TARGET_BARS so the chart has
  // a stable shape — even on day-one studios with one project. As the
  // user adds projects + revenue, real bars displace the dummies from
  // the left.
  const sparklineBars = useMemo<SparkBar[]>(() => {
    const real = projectMtdBalances(transactions).slice(0, SPARKLINE_TARGET_BARS);
    const realBars: SparkBar[] = real.map((v) => ({ value: v }));
    if (realBars.length >= SPARKLINE_TARGET_BARS) return realBars;
    const padCount = SPARKLINE_TARGET_BARS - realBars.length;
    const dummies: SparkBar[] = Array.from({ length: padCount }, () => ({
      value: 0,
      isDummy: true,
    }));
    return [...realBars, ...dummies];
  }, [transactions]);
  const combined = useMemo(() => {
    const inTotal = projectMtd.income + finMtd.income;
    const outTotal = projectMtd.expense + finMtd.expense;
    return { in: inTotal, out: outTotal, net: inTotal - outTotal };
  }, [projectMtd, finMtd]);
  const marginPct = useMemo(() => {
    if (combined.in <= 0) return null;
    return ((combined.in - combined.out) / combined.in) * 100;
  }, [combined]);
  const moneyLoading = totalsLoading || finLoading;
  const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });

  const [query, setQuery] = useState('');
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [filterDate, setFilterDate] = useState<Date | null>(null);
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | null>(null);

  const hasActiveFilters = filterDate !== null || filterStatus !== null;

  const filtered = useMemo(() => {
    let list: Project[] = projects;

    if (filterStatus) list = list.filter((p) => p.status === filterStatus);

    if (filterDate) {
      const fd = filterDate.getTime();
      list = list.filter((p) => {
        if (!p.endDate) return false;
        const end = p.endDate.toDate();
        end.setHours(0, 0, 0, 0);
        return end.getTime() <= fd;
      });
    }

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q)
          || p.siteAddress.toLowerCase().includes(q),
      );
    }
    return list;
  }, [projects, query, filterStatus, filterDate]);

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(app)/projects/new');
  };

  const clearFilters = useCallback(() => {
    setFilterDate(null);
    setFilterStatus(null);
  }, []);

  const filterChipLabel = useMemo(() => {
    const parts: string[] = [];
    if (filterStatus) {
      const lbl = STATUS_OPTIONS.find((s) => s.key === filterStatus)?.label;
      if (lbl) parts.push(lbl);
    }
    if (filterDate) {
      parts.push(
        `Due by ${filterDate.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        })}`,
      );
    }
    return parts.join(' · ');
  }, [filterStatus, filterDate]);

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — "Projects" + OrgSwitcher + notifications. The "new
          project" action lives in the floating action button at the
          bottom-right of the screen, not here. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text variant="title2" color="label" style={{ fontWeight: '700' }}>
          Projects
        </Text>
        <View style={{ flex: 1 }} />
        <OrgSwitcher />
        <Pressable
          onPress={() => router.push('/(app)/notifications' as never)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: t.colors.surface,
              borderRadius: 999,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.06)',
              borderWidth: t.hairline,
            },
            t.shadows.resting,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Notifications"
        >
          <Ionicons
            name="notifications-outline"
            size={16}
            color={t.colors.label}
          />
        </Pressable>
      </View>

      {/* Single unified summary card — replaces the old hero card +
          3-tile KPI strip with one surface that has up to three zones:
            1. Header  : period label + margin pill (finance only)
            2. Hero    : big NET BALANCE amount with a small inline
                         IN/OUT breakdown underneath (finance only)
            3. Counts  : 3-cell strip — ACTIVE · OPEN TASKS · MATERIAL
                         (always shown — even for client roles)
          When the role can't see project finance, zones 1 + 2 are
          hidden and the card collapses to just the counts strip. */}
      <View style={styles.summaryWrap}>
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: t.colors.surface,
              borderRadius: t.radii.card,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.04)',
              borderWidth: t.hairline,
            },
          ]}
        >
          {canSeeProjectFinance ? (
            <View style={styles.summaryFinance}>
              {/* Zone 1 — period label + margin pill (full-width row). */}
              <View style={styles.summaryTopRow}>
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={{ letterSpacing: 0.5 }}
                >
                  {`NET BALANCE · ${monthName.toUpperCase()}`}
                </Text>
                {marginPct != null && Number.isFinite(marginPct) ? (
                  <MarginPill pct={marginPct} />
                ) : null}
              </View>

              {/* Zone 2 — split row: text left, sparkline right.
                  Text column flexes; sparkline is a fixed 120 × 40
                  block so it never crowds the headline number. */}
              <View style={styles.summaryHeroRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {moneyLoading ? (
                    <ActivityIndicator
                      style={{ marginTop: 4, alignSelf: 'flex-start' }}
                      color={t.palette.blue.base}
                    />
                  ) : (
                    <Text
                      variant="title2"
                      style={{
                        marginTop: 2,
                        // Negative net = the studio is bleeding money this
                        // month → red. Positive net stays neutral.
                        color:
                          combined.net < 0
                            ? t.palette.red.base
                            : t.colors.label,
                      }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {formatInr(combined.net)}
                    </Text>
                  )}

                  <Text
                    variant="caption1"
                    color="secondary"
                    numberOfLines={1}
                    style={{ marginTop: 4 }}
                  >
                    <Text
                      variant="caption1"
                      style={{
                        color: t.palette.green.base,
                        fontWeight: '600',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      +{inrCompact(combined.in)}
                    </Text>
                    {' IN   ·   '}
                    <Text
                      variant="caption1"
                      style={{
                        color: t.palette.red.base,
                        fontWeight: '600',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      −{inrCompact(combined.out)}
                    </Text>
                    {' OUT'}
                  </Text>
                </View>

                {/* Per-project amount sparkline. Animates in once on
                    mount; remaining slots show grey dummy bars until
                    real revenue arrives. Tap → Finance tab. */}
                {!moneyLoading ? (
                  <ProjectAmountSparkline
                    bars={sparklineBars}
                    width={120}
                    height={40}
                    onPress={() =>
                      router.push('/(app)/(tabs)/overview' as never)
                    }
                  />
                ) : null}
              </View>

              {/* Hairline that separates the finance zone from the
                  always-on counts strip below. */}
              <View
                style={[
                  styles.summaryDivider,
                  { backgroundColor: t.colors.separator },
                ]}
              />
            </View>
          ) : null}

          {/* Zone 3 — counts strip (3 cells split by vertical hairlines).
              All three open the matching org-wide inbox:
                APPROVALS  → transactions awaiting admin review
                TASKS      → all open tasks across projects
                REQUESTS   → pending material-purchase requests */}
          <View style={styles.summaryCountsRow}>
            <SummaryCount
              label="APPROVALS"
              value={String(pendingApprovalCount)}
              onPress={() =>
                router.push('/(app)/transaction-approvals' as never)
              }
            />
            <View
              style={[
                styles.summaryCellDivider,
                { backgroundColor: t.colors.separator },
              ]}
            />
            <SummaryCount
              label="TASKS"
              value={String(openCount)}
              onPress={() => router.push('/(app)/tasks' as never)}
            />
            <View
              style={[
                styles.summaryCellDivider,
                { backgroundColor: t.colors.separator },
              ]}
            />
            <SummaryCount
              label="REQUESTS"
              value={String(pendingMaterialCount)}
              onPress={() => router.push('/(app)/material-requests' as never)}
            />
          </View>
        </View>
      </View>

      {/* Search + filter */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchInputWrap,
            {
              backgroundColor: t.colors.surface,
              borderRadius: t.radii.field,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.05)',
              borderWidth: t.hairline,
            },
          ]}
        >
          <Ionicons name="search" size={16} color={t.colors.tertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search projects…"
            placeholderTextColor={t.colors.tertiary}
            style={[
              styles.searchInput,
              { color: t.colors.label, ...t.type.callout },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setStatusPickerOpen(true)}
          style={({ pressed }) => [
            styles.filterBtn,
            {
              backgroundColor: hasActiveFilters
                ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                : t.colors.surface,
              borderRadius: t.radii.field,
              borderColor: hasActiveFilters
                ? t.palette.blue.base + '33'
                : (t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
              borderWidth: t.hairline,
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Filter projects"
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={hasActiveFilters ? t.palette.blue.base : t.colors.label}
          />
        </Pressable>
      </View>

      {/* Active filter chip(s) */}
      {hasActiveFilters ? (
        <View style={styles.activeFilterRow}>
          <View
            style={[
              styles.activeFilterPill,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
            ]}
          >
            <Text
              variant="caption2"
              style={{
                color: t.palette.blue.base,
                fontWeight: '700',
                letterSpacing: 0.4,
              }}
            >
              {filterChipLabel.toUpperCase()}
            </Text>
            <Pressable onPress={clearFilters} hitSlop={6}>
              <Ionicons name="close" size={12} color={t.palette.blue.base} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => setDatePickerOpen(true)}
            hitSlop={6}
            style={{ marginLeft: 8 }}
          >
            <Text
              variant="caption2"
              style={{
                color: t.palette.blue.base,
                fontWeight: '700',
                letterSpacing: 0.4,
              }}
            >
              {filterDate ? 'CHANGE DATE' : '+ DUE DATE'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* List */}
      <View style={{ flex: 1, minHeight: 0 }}>
        {loading && projects.length === 0 ? (
          <View style={styles.empty}>
            <ActivityIndicator color={t.palette.blue.base} />
            <Text variant="footnote" color="secondary" style={{ marginTop: 12 }}>
              Loading projects…
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="folder-open-outline"
              size={32}
              color={t.colors.tertiary}
            />
            <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
              {query || hasActiveFilters ? 'No matching projects' : 'No projects yet'}
            </Text>
            <Text
              variant="caption1"
              color="secondary"
              style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
            >
              {query || hasActiveFilters
                ? 'Try a different search or clear your filters.'
                : 'Create your first project to start tracking budgets, tasks and progress.'}
            </Text>
            {!query && !hasActiveFilters && canCreateProject ? (
              <Pressable onPress={handleAdd} hitSlop={6} style={{ marginTop: 14 }}>
                <Text
                  variant="footnote"
                  style={{ color: t.palette.blue.base, fontWeight: '700' }}
                >
                  Create your first project
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            refreshControl={<RefreshControl {...refresh.props} />}
            renderItem={({ item }) => {
              const totals = canSeeProjectFinance
                ? totalsByProject.get(item.id)
                : undefined;
              const inAmt = totals?.income ?? 0;
              const outAmt = totals?.expense ?? 0;

              const area = getAreaFromSiteAddress(item.siteAddress);
              const sublocation = item.location || area || null;
              const progressPct =
                item.progress != null && item.progress > 0
                  ? `${Math.round(item.progress)}%`
                  : '—';

              // Avatar = building glyph picked by the project's
              // typology. The chip + glyph + card border all pick up
              // a subtle accent tint based on the lifecycle status —
              // blue for Active (the default working state) and
              // orange for On Hold. Completed / Archived keep the
              // neutral fill3 + secondary treatment so finished work
              // doesn't compete visually with what the user is
              // actually managing.
              const buildingIcon = BUILDING_ICON[item.typology ?? 'other'];
              const accent =
                item.status === 'on_hold'
                  ? t.palette.orange
                  : item.status === 'active'
                    ? t.palette.blue
                    : null;
              const avatarBg = accent
                ? (t.mode === 'dark' ? accent.softDark : accent.soft)
                : t.colors.fill3;
              const avatarFg = accent ? accent.base : t.colors.secondary;
              const cardBorder = accent
                ? accent.base + '24' // ~14% opacity — clean subtle hint
                : (t.mode === 'dark'
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,0,0,0.04)');

              // Balance for the 4th meta cell. Green when positive,
              // red when negative, neutral at zero.
              const balance = inAmt - outAmt;
              const balanceColor =
                balance > 0
                  ? t.palette.green.base
                  : balance < 0
                    ? t.palette.red.base
                    : t.colors.label;

              // Time-based overlay (LATE / DUE) and lifecycle pill
              // are independent: the overlay carries the time alert
              // (round dot on avatar), the pill carries the
              // lifecycle status (Active / On Hold / Completed /
              // Archived). When LATE/DUE is showing the lifecycle
              // status is implied as "Active", so the pill steps
              // aside to keep the title row calm.
              const endDate = item.endDate ? item.endDate.toDate() : null;
              const overlay = getOverlayBadge(item.status, endDate, t);
              const pill = overlay ? null : getStatusPill(item.status, t);

              return (
                <Pressable
                  onPress={() => {
                    // Light haptic fires on the completed tap (not press-in)
                    // so brushing cards while scrolling stays silent.
                    Haptics.selectionAsync();
                    router.push(`/(app)/projects/${item.id}` as never);
                  }}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: pressed
                        ? t.colors.fill3
                        : t.colors.surface,
                      borderRadius: t.radii.group,
                      borderColor: cardBorder,
                      borderWidth: t.hairline,
                    },
                  ]}
                >
                  {/* TOP zone — avatar + name/sub + status pill */}
                  <View style={styles.topZone}>
                    {/* Avatar wrapper anchors the absolutely-positioned
                        time-alert overlay at the avatar's top-right
                        corner. The avatar itself is a rounded square
                        (radii.tile) so it reads like an iOS app icon. */}
                    <View style={styles.avatarWrap}>
                      <View
                        style={[
                          styles.avatar,
                          {
                            backgroundColor: avatarBg,
                            borderRadius: t.radii.tile,
                          },
                        ]}
                      >
                        <Ionicons
                          name={buildingIcon}
                          size={20}
                          color={avatarFg}
                        />
                      </View>
                      {overlay ? (
                        <View
                          accessibilityLabel={overlay.label}
                          style={[
                            styles.avatarOverlay,
                            {
                              backgroundColor: overlay.color,
                              borderColor: t.colors.surface,
                            },
                          ]}
                        >
                          <Ionicons
                            name={overlay.icon}
                            size={9}
                            color="#fff"
                          />
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.nameBlock}>
                      <Text variant="callout" color="label" numberOfLines={1}>
                        {item.name}
                      </Text>
                      {sublocation ? (
                        <Text
                          variant="caption1"
                          color="secondary"
                          numberOfLines={1}
                          style={{ marginTop: 2 }}
                        >
                          {sublocation}
                        </Text>
                      ) : null}
                    </View>

                    {pill ? (
                      <View
                        style={[
                          styles.pill,
                          { backgroundColor: pill.bg },
                        ]}
                      >
                        <View
                          style={[
                            styles.pillDot,
                            { backgroundColor: pill.fg },
                          ]}
                        />
                        <Text
                          variant="caption2"
                          style={{
                            color: pill.fg,
                            fontWeight: '700',
                            marginLeft: 4,
                            letterSpacing: 0.1,
                          }}
                        >
                          {pill.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Hairline divider between the two zones */}
                  <View
                    style={[
                      styles.cardDivider,
                      { backgroundColor: t.colors.separator },
                    ]}
                  />

                  {/* BOTTOM zone — labelled meta cells, all equal
                      width via flex:1 on each. PROGRESS · IN · OUT
                      · BALANCE. The +IN value paints green, −OUT
                      paints red, BALANCE picks green/red by sign so
                      polarity reads at a glance even though labels
                      stay neutral tertiary. */}
                  <View style={styles.metaRow}>
                    <ProjectMeta label="PROGRESS" value={progressPct} />
                    {canSeeProjectFinance ? (
                      <>
                        <ProjectMeta
                          label="IN"
                          value={`+${inrCompact(inAmt)}`}
                          valueColor={t.palette.green.base}
                        />
                        <ProjectMeta
                          label="OUT"
                          value={`−${inrCompact(outAmt)}`}
                          valueColor={t.palette.red.base}
                        />
                        <ProjectMeta
                          label="BALANCE"
                          value={`${balance >= 0 ? '+' : '−'}${inrCompact(Math.abs(balance))}`}
                          valueColor={balanceColor}
                        />
                      </>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.cardGap} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.listContent,
              // Extra bottom padding so the last card isn't hidden
              // behind the floating "+" button.
              { paddingBottom: t.region.tabBarBuffer + 80 },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}
      </View>

      {/* Floating "+" — primary new-project action. Uses the shared v2
          FAB so positioning + haptic + scale press match the CRM tab
          and other list screens. Hidden for roles without project.create. */}
      {canCreateProject ? (
        <FAB
          icon="add"
          onPress={handleAdd}
          accessibilityLabel="New project"
        />
      ) : null}

      {/* Status picker sheet */}
      <SelectSheet
        open={statusPickerOpen}
        title="Filter by status"
        options={STATUS_OPTIONS}
        selected={(filterStatus ?? 'all') as 'all' | ProjectStatus}
        onPick={(k) => {
          setFilterStatus(k === 'all' ? null : (k as ProjectStatus));
        }}
        onClose={() => setStatusPickerOpen(false)}
      />

      {/* Deadline date picker sheet */}
      <DateTimeSheet
        open={datePickerOpen}
        value={filterDate ?? new Date()}
        onChange={setFilterDate}
        onClose={() => setDatePickerOpen(false)}
        mode="date"
        title="Deadline by"
      />
    </View>
  );
}

/**
 * Margin pill — small label on the top-right of the hero card.
 * Positive margin earns a subtle green (studio is profitable this month);
 * negative margin earns red (alarm — losing money). The two are the only
 * "important" outcomes worth a colour signal at a glance.
 */
function MarginPill({ pct }: { pct: number }) {
  const t = useThemeV2();
  const positive = pct >= 0;
  const fg = positive ? t.palette.green.base : t.palette.red.base;
  const bg = positive
    ? (t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft)
    : (t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: fg,
          marginRight: 5,
        }}
      />
      <Text
        variant="caption2"
        style={{
          color: fg,
          fontWeight: '700',
          letterSpacing: 0.2,
        }}
      >
        {pct > 0 ? '+' : ''}
        {pct.toFixed(1)}%
      </Text>
    </View>
  );
}

/**
 * One cell of the unified summary card's bottom counts strip.
 *
 *   ACTIVE
 *      4
 *
 * Label on top (caption2 tertiary letterspaced), big number below
 * (headline 700, tabular numerals so single / double digit values stay
 * vertically aligned). Centered horizontally in the cell so the
 * hairline-divided strip reads as a balanced 3-up grid.
 */
function SummaryCount({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  /** When provided, the cell becomes a Pressable that routes on tap.
   *  Cells without `onPress` stay display-only. */
  onPress?: () => void;
}) {
  const Inner = (
    <>
      <Text
        variant="caption2"
        color="tertiary"
        style={{ letterSpacing: 0.5 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        variant="headline"
        color="label"
        style={{
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
          marginTop: 1,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </>
  );

  if (!onPress) {
    return <View style={styles.summaryCell}>{Inner}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.summaryCell,
        pressed && { opacity: 0.55 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      {Inner}
    </Pressable>
  );
}

/**
 * One labelled meta cell on the bottom of a project card — mirrors
 * the `Meta` cell in v2 LeadCard (caption2 tertiary label on top,
 * footnote 600 value below). Pass `valueColor` to override the
 * default neutral label tone (used for the +IN green / −OUT red).
 */
function ProjectMeta({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const t = useThemeV2();
  return (
    <View style={styles.meta}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.6 }}>
        {label}
      </Text>
      <Text
        variant="footnote"
        style={{
          marginTop: 2,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
          color: valueColor ?? t.colors.label,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Unified summary card — header (period + margin pill), hero NET
  // BALANCE amount with IN/OUT inline caption, divider, and a 3-cell
  // counts strip (ACTIVE / OPEN TASKS / MATERIAL). The whole thing is
  // one surface so the dashboard reads as a single calm pulse instead
  // of four floating tiles.
  summaryWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  summaryCard: {
    overflow: 'hidden',
  },
  summaryFinance: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Splits the hero zone into [text | sparkline]. Cross-axis end so
  // the sparkline aligns with the bottom of the IN/OUT caption (i.e.
  // sits on the visual baseline of the row), not the top of the
  // headline number.
  summaryHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  summaryDivider: {
    height: 0.5,
    marginTop: 10,
    marginHorizontal: -14, // bleed the divider edge-to-edge inside the card
  },
  summaryCountsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 2,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCellDivider: {
    width: 0.5,
    alignSelf: 'stretch',
  },

  // Search + filter row
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    alignItems: 'center',
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    margin: 0,
  },
  filterBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Active filter chip
  activeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  // List — each project is its own card (LeadCard pattern). The
  // 16 px horizontal pad on the list mirrors the rest of the screen,
  // with a 10 px gap between cards rendered by the FlatList's
  // ItemSeparatorComponent.
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  cardGap: { height: 10 },
  card: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },

  // TOP zone — avatar + name/sub block + status pill on the right.
  topZone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // App-icon-style avatar — building glyph in a neutral fill3 chip.
  // Wrapped in `avatarWrap` so the absolutely-positioned time-alert
  // overlay can hang off the top-right corner like a notification
  // dot on an app icon.
  avatarWrap: {
    position: 'relative',
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  avatar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlay: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  // Status / lifecycle pill (right side of the title row).
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 0,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  // Hairline that splits the top (identity) zone from the bottom
  // (meta) zone of the card.
  cardDivider: {
    height: 0.5,
    marginTop: 9,
  },

  // BOTTOM zone — labelled meta cells laid out in an equal-width
  // strip. flex:1 on each cell (set on `meta`) splits the row into
  // 4 equal columns so PROGRESS · IN · OUT · BALANCE line up
  // tidily; a smaller gap keeps the column borders clean.
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    minWidth: 0,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
