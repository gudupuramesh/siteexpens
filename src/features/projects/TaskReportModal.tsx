/**
 * Project Timesheet Report — client-presentable summary of every task
 * on the project's timeline.
 *
 * Sections (top to bottom):
 *   1. Header — project name, address, client, generated-on date.
 *   2. Period — earliest task start → latest task end + total span days.
 *   3. Summary — total tasks, by status, weighted progress.
 *   4. Category breakdown — tasks grouped by trade (Electrical / Plumbing
 *      / etc.) with count, total work-days, average progress.
 *   5. Detailed log — chronological task list with start, end, duration,
 *      assignee, status pill and progress bar.
 *
 * A bottom action bar offers a "Share" button that emits a clean text
 * version via React Native's Share API — copy-paste friendly for
 * WhatsApp / email / SMS to the client.
 */
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, space } from '@/src/theme';

import { DEFAULT_TASK_CATEGORIES, type Task } from '@/src/features/tasks/types';
import type { Project } from './types';
import { generateAndShareWebPdf } from './reports/generatePdf';
import { buildProgressReportHtml } from './reports/progressReportHtml';
import { buildTimelineAgreementHtml } from './reports/timelineAgreementHtml';

export type TaskReportModalProps = {
  visible: boolean;
  onClose: () => void;
  project: Project | null;
  tasks: Task[];
};

export function TaskReportModal({
  visible,
  onClose,
  project,
  tasks,
}: TaskReportModalProps) {
  const report = useMemo(() => buildReport(project, tasks), [project, tasks]);
  // Per-button busy flags so the user sees which PDF is rendering.
  const [busy, setBusy] = useState<null | 'progress' | 'timeline'>(null);

  async function handleShare() {
    try {
      await Share.share({
        message: buildShareText(report),
        title: `Project Timesheet — ${report.projectName}`,
      });
    } catch {
      // User cancelled or share failed silently — nothing to do.
    }
  }

  async function handleProgressPdf() {
    if (busy) return;
    setBusy('progress');
    try {
      const html = buildProgressReportHtml({
        projectName: report.projectName,
        projectAddress: report.projectAddress,
        generatedOn: report.generatedOn,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        totalDays: report.totalDays,
        workDays: report.workDays,
        total: report.total,
        completed: report.completed,
        ongoing: report.ongoing,
        notStarted: report.notStarted,
        weightedProgress: report.weightedProgress,
        categories: report.categories.map((c) => ({
          label: c.label,
          count: c.count,
          totalDays: c.totalDays,
          avgProgress: c.avgProgress,
        })),
        tasks: report.taskRows.map((t) => ({
          title: t.title,
          description: t.description,
          category: t.category,
          assignee: t.assignee,
          status: t.status,
          start: t.start,
          end: t.end,
          durationLabel: t.durationLabel,
          progress: t.progress,
        })),
      });
      await generateAndShareWebPdf({
        html,
        filename: `${report.projectName} — Progress Report`,
        dialogTitle: 'Share Progress Report PDF',
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleTimelinePdf() {
    if (busy) return;
    setBusy('timeline');
    try {
      const html = buildTimelineAgreementHtml({
        projectName: report.projectName,
        projectAddress: report.projectAddress,
        clientName: project?.client ?? undefined,
        designerName: undefined,
        generatedOn: report.generatedOn,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        totalDays: report.totalDays,
        workDays: report.workDays,
        total: report.total,
        categories: report.categories.map((c) => c.label),
        tasks: report.taskRows.map((t) => ({
          title: t.title,
          description: t.description,
          category: t.category,
          assignee: t.assignee,
          start: t.start,
          end: t.end,
          durationLabel: t.durationLabel,
        })),
      });
      await generateAndShareWebPdf({
        html,
        filename: `${report.projectName} — Schedule of Work`,
        dialogTitle: 'Share Timeline & Scope PDF',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <View style={styles.root}>
        {/* ── App header ─────────────────────────────────────────────── */}
        <View style={styles.appHeader}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color={color.textMuted} />
          </Pressable>
          <View style={styles.appHeaderTitle}>
            <Text style={styles.appHeaderEyebrow}>TIMESHEET</Text>
            <Text variant="bodyStrong" color="text">Project Report</Text>
          </View>
          <Pressable onPress={handleShare} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="share-outline" size={20} color={color.primary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Section 1: report cover ───────────────────────────────── */}
          <View style={styles.cover}>
            <Text style={styles.coverEyebrow}>SITEEXPENS · PROJECT TIMESHEET</Text>
            <Text style={styles.coverTitle} numberOfLines={2}>{report.projectName}</Text>
            {report.projectAddress ? (
              <Text style={styles.coverMeta}>{report.projectAddress}</Text>
            ) : null}
            <Text style={styles.coverMeta}>
              Generated {report.generatedOn}
            </Text>
          </View>

          {/* ── Section 2: period ─────────────────────────────────────── */}
          <Section title="Project period">
            <View style={styles.periodRow}>
              <PeriodCol label="START" value={report.periodStart ?? '—'} />
              <View style={styles.periodArrow}>
                <Ionicons name="arrow-forward" size={16} color={color.textFaint} />
              </View>
              <PeriodCol label="END" value={report.periodEnd ?? '—'} />
            </View>
            <View style={styles.periodFootRow}>
              <KeyValue label="Total span" value={`${report.totalDays} days`} />
              {report.workDays > 0 ? (
                <KeyValue label="Work-days logged" value={`${report.workDays}`} />
              ) : null}
            </View>
          </Section>

          {/* ── Section 3: summary ────────────────────────────────────── */}
          <Section title="Summary">
            <View style={styles.statsGrid}>
              <StatCard label="Total tasks" value={String(report.total)} />
              <StatCard
                label="Completed"
                value={String(report.completed)}
                tone="success"
              />
              <StatCard
                label="Ongoing"
                value={String(report.ongoing)}
                tone="warning"
              />
              <StatCard
                label="Not started"
                value={String(report.notStarted)}
                tone="muted"
              />
            </View>
            <View style={styles.progressWrap}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>OVERALL PROGRESS</Text>
                <Text style={styles.progressValue}>{report.weightedProgress}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${report.weightedProgress}%` },
                  ]}
                />
              </View>
            </View>
          </Section>

          {/* ── Section 4: category breakdown ─────────────────────────── */}
          {report.categories.length > 0 ? (
            <Section title="By category">
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { flex: 2 }]}>CATEGORY</Text>
                <Text style={[styles.thCell, styles.thNum]}>TASKS</Text>
                <Text style={[styles.thCell, styles.thNum]}>DAYS</Text>
                <Text style={[styles.thCell, styles.thNum]}>AVG %</Text>
              </View>
              {report.categories.map((c, i) => (
                <View
                  key={c.key}
                  style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
                >
                  <Text style={[styles.tdCell, { flex: 2 }]} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <Text style={[styles.tdCell, styles.tdNum]}>{c.count}</Text>
                  <Text style={[styles.tdCell, styles.tdNum]}>{c.totalDays}</Text>
                  <Text style={[styles.tdCell, styles.tdNum]}>
                    {c.avgProgress}%
                  </Text>
                </View>
              ))}
            </Section>
          ) : null}

          {/* ── Section 5: detailed task log ──────────────────────────── */}
          <Section title={`Detailed log · ${report.taskRows.length} tasks`}>
            {report.taskRows.length === 0 ? (
              <Text style={styles.emptyText}>
                No tasks on this timeline yet. Add tasks from the Timeline tab
                to populate this report.
              </Text>
            ) : (
              report.taskRows.map((t, i) => (
                <View
                  key={t.id}
                  style={[
                    styles.taskCard,
                    i === report.taskRows.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.taskTopRow}>
                    <Text style={styles.taskIndex}>#{String(i + 1).padStart(2, '0')}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskTitle} numberOfLines={2}>
                        {t.title}
                      </Text>
                      <Text style={styles.taskCategory}>
                        {t.category.toUpperCase()}
                        {t.assignee ? `  ·  ${t.assignee}` : ''}
                      </Text>
                    </View>
                    <StatusPill status={t.status} />
                  </View>

                  <View style={styles.taskDateRow}>
                    <DateCol label="START" value={t.start} />
                    <DateCol label="END" value={t.end} />
                    <DateCol label="DURATION" value={t.durationLabel} />
                  </View>

                  <View style={styles.taskProgressRow}>
                    <View style={styles.taskProgressTrack}>
                      <View
                        style={[
                          styles.taskProgressFill,
                          { width: `${t.progress}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.taskProgressText}>{t.progress}%</Text>
                  </View>

                  {t.description ? (
                    <Text style={styles.taskNote} numberOfLines={3}>
                      {t.description}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </Section>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              End of report · Generated by SiteExpens
            </Text>
          </View>
        </ScrollView>

        {/* ── Sticky action bar ──────────────────────────────────────────
            Two PDF options + a small "share as text" link below them. */}
        <View style={styles.actionBar}>
          <View style={styles.pdfRow}>
            <Pressable
              onPress={handleProgressPdf}
              disabled={!!busy}
              style={({ pressed }) => [
                styles.pdfBtn,
                styles.pdfBtnPrimary,
                busy && { opacity: 0.6 },
                pressed && !busy && { opacity: 0.85 },
              ]}
            >
              <Ionicons
                name={busy === 'progress' ? 'hourglass-outline' : 'stats-chart-outline'}
                size={16}
                color="#fff"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.pdfBtnTitle}>
                  {busy === 'progress' ? 'Building…' : 'Progress Report'}
                </Text>
                <Text style={styles.pdfBtnSub}>
                  Status, % complete, category split
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={handleTimelinePdf}
              disabled={!!busy}
              style={({ pressed }) => [
                styles.pdfBtn,
                styles.pdfBtnOutline,
                busy && { opacity: 0.6 },
                pressed && !busy && { opacity: 0.85 },
              ]}
            >
              <Ionicons
                name={busy === 'timeline' ? 'hourglass-outline' : 'document-text-outline'}
                size={16}
                color={color.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.pdfBtnTitleOutline}>
                  {busy === 'timeline' ? 'Building…' : 'Timeline & Scope'}
                </Text>
                <Text style={styles.pdfBtnSubOutline}>
                  Schedule of work for agreement
                </Text>
              </View>
            </Pressable>
          </View>
          <Pressable
            onPress={handleShare}
            disabled={!!busy}
            style={({ pressed }) => [
              styles.textShareLink,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="chatbox-outline" size={13} color={color.textMuted} />
            <Text style={styles.textShareLinkText}>
              Or share a quick text summary
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function PeriodCol({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.periodCol}>
      <Text style={styles.periodLabel}>{label}</Text>
      <Text style={styles.periodValue}>{value}</Text>
    </View>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'muted';
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    default: { bg: color.surface, fg: color.text },
    success: { bg: color.successSoft, fg: color.success },
    warning: { bg: color.warningSoft, fg: color.warning },
    muted:   { bg: color.surfaceAlt, fg: color.textMuted },
  };
  const c = tones[tone];
  return (
    <View style={[styles.statCard, { backgroundColor: c.bg }]}>
      <Text style={[styles.statValue, { color: c.fg }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function DateCol({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dateCol}>
      <Text style={styles.dateColLabel}>{label}</Text>
      <Text style={styles.dateColValue}>{value}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: 'completed' | 'ongoing' | 'not_started' }) {
  const cfg = {
    completed:   { bg: color.successSoft, fg: color.success, label: 'DONE' },
    ongoing:     { bg: color.warningSoft, fg: color.warning, label: 'ONGOING' },
    not_started: { bg: color.surfaceAlt,  fg: color.textMuted, label: 'PENDING' },
  }[status];
  return (
    <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.statusPillText, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Report builder — pure function, easy to test in isolation.
// ────────────────────────────────────────────────────────────────────

type CategoryRow = {
  key: string;
  label: string;
  count: number;
  totalDays: number;
  avgProgress: number;
};

type TaskRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  assignee: string;
  status: 'completed' | 'ongoing' | 'not_started';
  start: string;
  end: string;
  durationLabel: string;
  durationDays: number;
  progress: number;
};

type Report = {
  projectName: string;
  projectAddress: string;
  generatedOn: string;
  periodStart: string | null;
  periodEnd: string | null;
  totalDays: number;
  workDays: number;
  total: number;
  completed: number;
  ongoing: number;
  notStarted: number;
  weightedProgress: number;
  categories: CategoryRow[];
  taskRows: TaskRow[];
};

function buildReport(project: Project | null, tasks: Task[]): Report {
  // Sort tasks chronologically — earliest start first; tasks with no
  // start date sink to the end so they don't muddle the timeline.
  const sorted = [...tasks].sort((a, b) => {
    const aT = a.startDate?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    const bT = b.startDate?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    return aT - bT;
  });

  const taskRows: TaskRow[] = sorted.map((t) => {
    const start = t.startDate?.toDate() ?? null;
    const end = t.endDate?.toDate() ?? null;
    const durationDays = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1) : 0;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      category: getCategoryLabel(t.category),
      assignee: t.assignedToName ?? '',
      status: (t.status === 'completed' || t.status === 'ongoing' ? t.status : 'not_started') as TaskRow['status'],
      start: start ? formatDate(start) : '—',
      end: end ? formatDate(end) : '—',
      durationDays,
      durationLabel: durationDays > 0 ? `${durationDays} day${durationDays === 1 ? '' : 's'}` : '—',
      progress: clampProgress(t.progress),
    };
  });

  // Period: earliest start to latest end across the entire task list.
  // Falls back to the project's own start/end dates if tasks don't have
  // them set, then to nothing.
  const startMillis = sorted
    .map((t) => t.startDate?.toMillis())
    .filter((n): n is number => typeof n === 'number');
  const endMillis = sorted
    .map((t) => t.endDate?.toMillis())
    .filter((n): n is number => typeof n === 'number');

  const periodStartMs = startMillis.length
    ? Math.min(...startMillis)
    : project?.startDate?.toMillis() ?? null;
  const periodEndMs = endMillis.length
    ? Math.max(...endMillis)
    : project?.endDate?.toMillis() ?? null;

  const periodStart = periodStartMs ? formatDate(new Date(periodStartMs)) : null;
  const periodEnd = periodEndMs ? formatDate(new Date(periodEndMs)) : null;
  const totalDays =
    periodStartMs && periodEndMs
      ? Math.max(0, Math.round((periodEndMs - periodStartMs) / 86_400_000) + 1)
      : 0;

  const workDays = taskRows.reduce((sum, t) => sum + t.durationDays, 0);

  // Status counts.
  const completed = taskRows.filter((t) => t.status === 'completed').length;
  const ongoing = taskRows.filter((t) => t.status === 'ongoing').length;
  const notStarted = taskRows.filter((t) => t.status === 'not_started').length;

  // Weighted by duration so a long task moves the needle more than a
  // tiny one. Falls back to simple average if no durations are set.
  const totalWeight = taskRows.reduce((s, t) => s + (t.durationDays || 1), 0);
  const weightedProgress =
    totalWeight === 0
      ? 0
      : Math.round(
          taskRows.reduce((s, t) => s + t.progress * (t.durationDays || 1), 0) /
            totalWeight,
        );

  // Category breakdown — group by category label.
  const catMap = new Map<string, { count: number; totalDays: number; sumProgress: number }>();
  for (const t of taskRows) {
    const prev = catMap.get(t.category) ?? { count: 0, totalDays: 0, sumProgress: 0 };
    prev.count += 1;
    prev.totalDays += t.durationDays;
    prev.sumProgress += t.progress;
    catMap.set(t.category, prev);
  }
  const categories: CategoryRow[] = Array.from(catMap.entries())
    .map(([label, v]) => ({
      key: label,
      label,
      count: v.count,
      totalDays: v.totalDays,
      avgProgress: Math.round(v.sumProgress / v.count),
    }))
    .sort((a, b) => b.totalDays - a.totalDays || b.count - a.count);

  return {
    projectName: project?.name ?? 'Untitled project',
    projectAddress: project?.siteAddress ?? '',
    generatedOn: formatDate(new Date()),
    periodStart,
    periodEnd,
    totalDays,
    workDays,
    total: taskRows.length,
    completed,
    ongoing,
    notStarted,
    weightedProgress,
    categories,
    taskRows,
  };
}

function buildShareText(r: Report): string {
  const lines: string[] = [];
  lines.push(`PROJECT TIMESHEET`);
  lines.push(`${r.projectName}`);
  if (r.projectAddress) lines.push(r.projectAddress);
  lines.push(`Generated ${r.generatedOn}`);
  lines.push('');
  lines.push(`Period: ${r.periodStart ?? '—'} → ${r.periodEnd ?? '—'}  (${r.totalDays} days)`);
  lines.push(`Tasks: ${r.total}  ·  Done: ${r.completed}  ·  Ongoing: ${r.ongoing}  ·  Pending: ${r.notStarted}`);
  lines.push(`Overall progress: ${r.weightedProgress}%`);
  lines.push('');

  if (r.categories.length > 0) {
    lines.push('BY CATEGORY');
    for (const c of r.categories) {
      lines.push(`  • ${c.label} — ${c.count} task${c.count === 1 ? '' : 's'}, ${c.totalDays} days, avg ${c.avgProgress}%`);
    }
    lines.push('');
  }

  lines.push('DETAILED LOG');
  r.taskRows.forEach((t, i) => {
    lines.push(`${String(i + 1).padStart(2, '0')}. ${t.title}  [${t.status.toUpperCase()}]`);
    lines.push(`    ${t.category}${t.assignee ? `  ·  ${t.assignee}` : ''}`);
    lines.push(`    ${t.start} → ${t.end}  (${t.durationLabel})  ·  ${t.progress}%`);
    if (t.description) lines.push(`    ${t.description}`);
    lines.push('');
  });

  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function clampProgress(n: number | null | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function getCategoryLabel(key: string | undefined): string {
  if (!key) return 'General';
  const fromDefault = DEFAULT_TASK_CATEGORIES.find((c) => c.key === key)?.label;
  if (fromDefault) return fromDefault;
  return key
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

// ────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgGrouped },

  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingTop: 50,
    paddingBottom: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    gap: space.xs,
  },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  appHeaderTitle: { flex: 1, alignItems: 'center' },
  appHeaderEyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
  },

  body: { flex: 1 },
  bodyContent: { paddingBottom: 100 },

  cover: {
    backgroundColor: color.bg,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    gap: 4,
  },
  coverEyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: 1.4,
  },
  coverTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.4,
    lineHeight: 26,
    marginTop: 6,
  },
  coverMeta: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.textMuted,
    marginTop: 2,
  },

  section: {
    marginTop: space.md,
    paddingHorizontal: space.md,
    gap: space.xs,
  },
  sectionTitle: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  sectionBody: {
    backgroundColor: color.bg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    padding: space.sm,
    gap: space.xs,
  },

  // Period
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  periodCol: { flex: 1 },
  periodLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.2,
  },
  periodValue: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  periodArrow: { width: 24, alignItems: 'center' },
  periodFootRow: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.xs,
    paddingTop: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  kvRow: { gap: 2 },
  kvLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1,
  },
  kvValue: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '600',
    color: color.text,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    gap: 2,
  },
  statValue: {
    fontFamily: fontFamily.sans,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  progressWrap: { gap: 4, marginTop: space.xs },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textMuted,
    letterSpacing: 1.2,
  },
  progressValue: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '700',
    color: color.primary,
  },
  progressTrack: {
    height: 8,
    backgroundColor: color.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.primary,
  },

  // Category table
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  thCell: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textMuted,
    letterSpacing: 1.2,
    flex: 1,
  },
  thNum: { textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  tableRowAlt: { backgroundColor: color.surface },
  tdCell: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.text,
    flex: 1,
  },
  tdNum: {
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },

  // Task cards
  taskCard: {
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
    gap: 8,
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  taskIndex: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 0.6,
    paddingTop: 2,
  },
  taskTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  taskCategory: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.primary,
    letterSpacing: 1,
    marginTop: 2,
  },
  taskDateRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: 4,
  },
  dateCol: { flex: 1, gap: 2 },
  dateColLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1,
  },
  dateColValue: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '600',
    color: color.text,
  },
  taskProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskProgressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: color.surfaceAlt,
    borderRadius: 3,
    overflow: 'hidden',
  },
  taskProgressFill: { height: '100%', backgroundColor: color.primary },
  taskProgressText: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '700',
    color: color.textMuted,
    minWidth: 32,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  taskNote: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.textMuted,
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  emptyText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
    textAlign: 'center',
    paddingVertical: space.md,
  },

  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusPillText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  footer: {
    marginTop: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  footerText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textFaint,
    letterSpacing: 1.2,
  },

  // Action bar
  actionBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: 24,
    backgroundColor: color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
  },
  pdfRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pdfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    minHeight: 56,
  },
  pdfBtnPrimary: {
    backgroundColor: color.primary,
  },
  pdfBtnOutline: {
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.primary,
  },
  pdfBtnTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.1,
  },
  pdfBtnSub: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  pdfBtnTitleOutline: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: -0.1,
  },
  pdfBtnSubOutline: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    color: color.textMuted,
    marginTop: 1,
  },
  textShareLink: {
    marginTop: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
  },
  textShareLinkText: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.textMuted,
  },
});
