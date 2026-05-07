/**
 * OverviewTab — pixel-port of `interior os/src/screens-projects.jsx`'s
 * Overview view (the first tab inside ProjectDetailScreen).
 *
 * Sections:
 *   • KPI strip       — Budget · Spent · Left  (3 cells, hairline border)
 *   • Progress bar    — 2px, % complete vs % budget used
 *   • Project info    — start, target, status pill, location
 *   • Spend by category — all categories with mini progress bars
 *
 * Wired to live Firestore data:
 *   useProject(id)       → name, status, dates, value, address
 *   useTransactions(id)  → spent (payment_out total) + category split
 *   useTasks(id)         → average task progress for "% complete"
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Spinner } from '@/src/ui/Spinner';

import { useProject } from '@/src/features/projects/useProject';
import { useMaterialRequests } from '@/src/features/materialRequests/useMaterialRequests';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { useTasks } from '@/src/features/tasks/useTasks';
import { useProjectStorage, prettyBytes } from '@/src/features/projects/useProjectStorage';
import {
  TRANSACTION_CATEGORIES,
  isTransactionCountedInTotals,
  normalizeTransactionType,
} from '@/src/features/transactions/types';
import { deleteProject, updateProject } from '@/src/features/projects/projects';
import {
  PROJECT_STATUS_OPTIONS,
  PROJECT_TYPOLOGIES,
  type ProjectStatus,
} from '@/src/features/projects/types';
import { formatInr } from '@/src/lib/format';
import { color, fontFamily } from '@/src/theme/tokens';
import { PrimaryButton, SelectModal, Slider } from '@/src/ui/io';

const STATUS_TONE: Record<string, { fg: string; bg: string; label: string }> = {
  active:    { fg: color.success,   bg: color.successSoft, label: 'Active' },
  on_hold:   { fg: color.warning,   bg: color.warningSoft, label: 'On Hold' },
  completed: { fg: color.textMuted, bg: color.surfaceAlt,  label: 'Completed' },
  archived:  { fg: color.textFaint, bg: color.surfaceAlt,  label: 'Archived' },
};

function formatInrCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) {
    const v = n / 1_00_000;
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    return `₹${s.endsWith('.0') ? s.slice(0, -2) : s}L`;
  }
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n}`;
}

function formatAbsDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function categoryLabel(key: string): string {
  return TRANSACTION_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function OverviewTab() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project, loading } = useProject(id);
  const {
    data: transactions,
    pendingPaymentOutTotal,
    pendingApprovalCount,
  } = useTransactions(id);
  const { data: pendingMaterials } = useMaterialRequests(id, 'pending');
  const { data: tasks } = useTasks(id);
  const storage = useProjectStorage(id);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [progressEditorOpen, setProgressEditorOpen] = useState(false);
  const [progressDraft, setProgressDraft] = useState(0);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);

  // Delete-project flow state. Two-step UX: native Alert first (cheap
  // accidental-tap defense) → if the user confirms, show a modal that
  // requires them to type the exact project name to enable the delete
  // button. Mirrors the pattern used by GitHub / Vercel / Supabase
  // for irreversible destructive actions.
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteNameDraft, setDeleteNameDraft] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Spent + by-category breakdown — only payment_out
  const { spent, byCategory } = useMemo(() => {
    let s = 0;
    const cat: Record<string, number> = {};
    for (const t of transactions) {
      if (!isTransactionCountedInTotals(t)) continue;
      const kind = normalizeTransactionType(t.type);
      if (kind === 'payment_out') {
        s += t.amount;
        const k = t.category ?? 'others';
        cat[k] = (cat[k] ?? 0) + t.amount;
      }
    }
    return { spent: s, byCategory: cat };
  }, [transactions]);

  const sortedCats = useMemo(
    () =>
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
    [byCategory],
  );

  // Progress = manual override on the project doc, otherwise average of
  // task progress, otherwise 0.
  const taskProgressPct = useMemo(() => {
    if (project?.progress !== undefined) return project.progress;
    if (tasks.length === 0) return 0;
    const sum = tasks.reduce((acc, t) => acc + (t.progress ?? 0), 0);
    return Math.round(sum / tasks.length);
  }, [project?.progress, tasks]);

  if (loading || !project) {
    return (
      <View style={styles.loading}>
        <Spinner size={28} />
      </View>
    );
  }

  const budget = project.value ?? 0;
  const left = Math.max(0, budget - spent);
  const budgetUsedPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const leftBudget = budget > 0 && spent / budget > 0.9;
  const status = STATUS_TONE[project.status] ?? STATUS_TONE.active;
  const startDate = project.startDate ? project.startDate.toDate() : null;
  const endDate = project.endDate ? project.endDate.toDate() : null;

  const handleStatusPick = async (next: ProjectStatus) => {
    if (!id || next === project.status || savingStatus) return;
    try {
      setSavingStatus(true);
      await updateProject({ projectId: id, status: next });
    } catch (error) {
      Alert.alert('Could not update status', (error as Error).message);
    } finally {
      setSavingStatus(false);
    }
  };

  const openProgressEditor = () => {
    setProgressDraft(taskProgressPct);
    setProgressEditorOpen(true);
  };

  // ── Delete project ──────────────────────────────────────────────
  // Step 1: native Alert. If the user taps "Delete…" we open the typed
  // confirmation modal (step 2) where they must type the exact name.
  const handleDeletePress = () => {
    if (!project) return;
    Alert.alert(
      'Delete this project?',
      `"${project.name}" will be removed for everyone. Tasks, transactions, attendance, files and other data attached to it will be hidden permanently.\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete…',
          style: 'destructive',
          onPress: () => {
            setDeleteNameDraft('');
            setDeleteModalOpen(true);
          },
        },
      ],
    );
  };

  // Step 2: actually delete. Caller has typed the name; double-check
  // the draft + project still match in case of stale state.
  //
  // Server side (deleteProjectCascade Cloud Function) wipes R2 + every
  // Firestore doc tied to this project — no orphans. We just await
  // the result, then pop two screens (overview screen → project detail
  // → projects list).
  const handleConfirmedDelete = async () => {
    if (!project || !id) return;
    if (deleteNameDraft.trim() !== project.name.trim()) return;
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteProject(id);
      setDeleteModalOpen(false);
      router.back();
      router.back();
    } catch (err) {
      Alert.alert('Could not delete project', (err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveProgress = async () => {
    if (!id || savingProgress) return;
    try {
      setSavingProgress(true);
      await updateProject({ projectId: id, progress: progressDraft });
      setProgressEditorOpen(false);
    } catch (error) {
      Alert.alert('Could not update progress', (error as Error).message);
    } finally {
      setSavingProgress(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* KPI strip */}
      <View style={styles.kpiWrap}>
        <View style={styles.kpiStrip}>
          <View style={[styles.kpiCell, styles.kpiCellBorder]}>
            <RNText style={styles.kpiLabel}>BUDGET</RNText>
            <RNText style={styles.kpiValue}>{formatInrCompact(budget)}</RNText>
          </View>
          <View style={[styles.kpiCell, styles.kpiCellBorder]}>
            <RNText style={styles.kpiLabel}>SPENT</RNText>
            <RNText
              style={[
                styles.kpiValue,
                leftBudget && { color: color.danger },
              ]}
            >
              {formatInrCompact(spent)}
            </RNText>
          </View>
          <View style={[styles.kpiCell, styles.kpiCellBorder]}>
            <RNText style={styles.kpiLabel}>LEFT</RNText>
            <RNText style={[styles.kpiValue, { color: color.primary }]}>
              {formatInrCompact(left)}
            </RNText>
          </View>
          {/* Storage usage — fed by useProjectStorage from the
              `projectStorage/{id}` Firestore doc maintained server-side
              by the recordStorageEvent / r2DeleteObject Cloud Functions. */}
          <View style={styles.kpiCell}>
            <RNText style={styles.kpiLabel}>STORAGE</RNText>
            <RNText style={styles.kpiValue}>
              {prettyBytes(storage.totalBytes)}
            </RNText>
            <RNText style={styles.kpiSubLabel}>
              {storage.fileCount} file{storage.fileCount === 1 ? '' : 's'}
            </RNText>
          </View>
        </View>
        {(pendingMaterials.length > 0 || pendingApprovalCount > 0) && (
          <RNText style={styles.kpiPendingNote}>
            Pending approvals:
            {pendingMaterials.length > 0 ? ` ${pendingMaterials.length} material request(s)` : ''}
            {pendingApprovalCount > 0
              ? `${pendingMaterials.length > 0 ? ';' : ''} ${pendingApprovalCount} transaction(s)${
                  pendingPaymentOutTotal > 0
                    ? ` (${formatInrCompact(Math.round(pendingPaymentOutTotal))} out not in spent)`
                    : ''
                }`
              : ''}
          </RNText>
        )}

        {/* Progress bar */}
        <Pressable
          onPress={openProgressEditor}
          style={({ pressed }) => [
            styles.progressRow,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.progressBarsRow}>
            <View style={styles.progressCol}>
              <RNText style={styles.progressColLabel}>COMPLETE</RNText>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${taskProgressPct}%` }]}
                />
              </View>
            </View>
            <View style={styles.progressCol}>
              <RNText style={styles.progressColLabel}>BUDGET USED</RNText>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFillBudget, { width: `${budgetUsedPct}%` }]}
                />
              </View>
            </View>
          </View>
          <View style={styles.progressMetaRow}>
            <RNText style={[styles.progressMeta, styles.progressEditHint]}>
              {taskProgressPct}% COMPLETE · EDIT
            </RNText>
            <RNText style={styles.progressMeta}>{budgetUsedPct}% BUDGET USED</RNText>
          </View>
        </Pressable>

      </View>

      {/* PROJECT DETAILS — every field collected at create time, plus
          an Edit pencil that opens the full edit form. Status remains
          inline-editable (tap → SelectModal) since it's the most-
          changed field; everything else routes through edit-project. */}
      <View style={styles.group}>
        <View style={styles.groupHeaderRow}>
          <RNText style={styles.groupHeader}>PROJECT DETAILS</RNText>
          <Pressable
            onPress={() =>
              router.push(`/(app)/projects/${id}/edit-project` as never)
            }
            hitSlop={10}
            style={({ pressed }) => [
              styles.groupHeaderAction,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityLabel="Edit project details"
          >
            <Ionicons name="create-outline" size={14} color={color.primary} />
            <RNText style={styles.groupHeaderActionText}>EDIT</RNText>
          </Pressable>
        </View>

        {/* Cover photo — shown only when the project has one. Tappable
            in the future for a fullscreen view; for now a static hero. */}
        {project.photoUri ? (
          <View style={styles.coverWrap}>
            <Image
              source={{ uri: project.photoUri }}
              style={styles.coverImg}
              resizeMode="cover"
            />
          </View>
        ) : null}

        <View style={styles.groupBody}>
          <View style={styles.infoRow}>
            <RNText style={styles.infoTitle}>Name</RNText>
            <RNText style={styles.infoMeta} numberOfLines={2}>
              {project.name}
            </RNText>
            <View style={styles.infoDivider} />
          </View>

          {project.client ? (
            <View style={styles.infoRow}>
              <RNText style={styles.infoTitle}>Client</RNText>
              <RNText style={styles.infoMeta} numberOfLines={1}>
                {project.client}
              </RNText>
              <View style={styles.infoDivider} />
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <RNText style={styles.infoTitle}>Location</RNText>
            <RNText style={styles.infoMeta} numberOfLines={1}>
              {project.location || '—'}
            </RNText>
            <View style={styles.infoDivider} />
          </View>

          <View style={styles.infoRow}>
            <RNText style={styles.infoTitle}>Site address</RNText>
            <RNText style={styles.infoMeta} numberOfLines={3}>
              {project.siteAddress || '—'}
            </RNText>
            <View style={styles.infoDivider} />
          </View>

          {project.typology ? (
            <View style={styles.infoRow}>
              <RNText style={styles.infoTitle}>Type</RNText>
              <RNText style={styles.infoMeta}>
                {[
                  PROJECT_TYPOLOGIES.find((t) => t.key === project.typology)?.label,
                  project.subType,
                ]
                  .filter(Boolean)
                  .join(' — ') || '—'}
              </RNText>
              <View style={styles.infoDivider} />
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <RNText style={styles.infoTitle}>Start date</RNText>
            <RNText style={styles.infoMeta}>{formatAbsDate(startDate)}</RNText>
            <View style={styles.infoDivider} />
          </View>

          <View style={styles.infoRow}>
            <RNText style={styles.infoTitle}>Target handover</RNText>
            <RNText style={styles.infoMeta}>{formatAbsDate(endDate)}</RNText>
            <View style={styles.infoDivider} />
          </View>

          <View style={styles.infoRow}>
            <RNText style={styles.infoTitle}>Value</RNText>
            <RNText style={styles.infoMeta}>{formatInr(project.value)}</RNText>
            <View style={styles.infoDivider} />
          </View>

          <Pressable
            onPress={() => setStatusPickerOpen(true)}
            style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.82 }]}
          >
            <RNText style={styles.infoTitle}>Status</RNText>
            {savingStatus ? (
              <ActivityIndicator size="small" color={color.textFaint} style={{ marginLeft: 'auto' }} />
            ) : null}
            <View style={[styles.pill, { backgroundColor: status.bg }, savingStatus && { marginLeft: 8 }]}>
              <RNText style={[styles.pillText, { color: status.fg }]}>{status.label}</RNText>
            </View>
            <RNText style={styles.chevron}>›</RNText>
            <View style={styles.infoDivider} />
          </Pressable>

          <View style={[styles.infoRow, styles.infoRowLast]}>
            <RNText style={styles.infoTitle}>Team size</RNText>
            <RNText style={styles.infoMeta}>
              {project.team !== undefined && project.team > 0
                ? `${project.team} ${project.team === 1 ? 'person' : 'people'}`
                : '—'}
            </RNText>
          </View>
        </View>
      </View>

      {/* SPEND BY CATEGORY */}
      {sortedCats.length > 0 ? (
        <View style={styles.group}>
          <RNText style={styles.groupHeader}>SPEND BY CATEGORY</RNText>
          <View style={styles.groupBody}>
          <View style={styles.catBlock}>
            {sortedCats.map(([key, amt], i) => {
              const pct = spent > 0 ? Math.round((amt / spent) * 100) : 0;
              const txnCount = transactions.filter((t) => {
                const kind = normalizeTransactionType(t.type);
                return kind === 'payment_out' && (t.category ?? 'others') === key;
              }).length;
              return (
                <View
                  key={key}
                  style={{
                    marginBottom: i === sortedCats.length - 1 ? 0 : 12,
                  }}
                >
                  <View style={styles.catTopRow}>
                    <View style={styles.catLabelWrap}>
                      <RNText style={styles.catLabel}>{categoryLabel(key)}</RNText>
                      <RNText style={styles.catMeta}>
                        {txnCount} txn{txnCount === 1 ? '' : 's'}
                      </RNText>
                    </View>
                    <RNText style={styles.catAmount}>
                      {formatInrCompact(amt)} · {pct}%
                    </RNText>
                  </View>
                  <View style={styles.miniBarTrack}>
                    <View
                      style={[
                        styles.miniBarFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: i === 0 ? color.primary : color.text,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
          </View>
        </View>
      ) : (
        <View style={styles.group}>
          <RNText style={styles.groupHeader}>SPEND BY CATEGORY</RNText>
          <View style={styles.groupBody}>
            <View style={styles.emptyBlock}>
              <RNText style={styles.emptyText}>No expenses recorded yet.</RNText>
            </View>
          </View>
        </View>
      )}

      {/* DANGER ZONE — delete project. Two-step confirmation: native
          Alert → modal with required name typing. */}
      <View style={styles.group}>
        <RNText style={styles.groupHeader}>DANGER ZONE</RNText>
        <View style={styles.groupBody}>
          <Pressable
            onPress={handleDeletePress}
            style={({ pressed }) => [
              styles.infoRow,
              styles.infoRowLast,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="trash-outline" size={18} color={color.danger} />
            <RNText style={[styles.infoTitle, { color: color.danger, marginLeft: 4 }]}>
              Delete project
            </RNText>
            <RNText style={[styles.infoMeta, { color: color.textFaint }]} numberOfLines={1}>
              Permanent
            </RNText>
          </Pressable>
        </View>
      </View>

      <View style={{ height: 32 }} />

      <SelectModal<ProjectStatus>
        visible={statusPickerOpen}
        title="Project status"
        options={PROJECT_STATUS_OPTIONS}
        value={project.status}
        onPick={handleStatusPick}
        onClose={() => setStatusPickerOpen(false)}
      />

      <Modal
        visible={progressEditorOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setProgressEditorOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setProgressEditorOpen(false)}>
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <RNText style={styles.modalTitle}>Update project progress</RNText>
          <RNText style={styles.modalMeta}>{Math.round(progressDraft)}% COMPLETE</RNText>

          <Slider value={progressDraft} onChange={setProgressDraft} step={1} />

          <PrimaryButton
            label={savingProgress ? 'Saving...' : 'Save progress'}
            onPress={handleSaveProgress}
            disabled={savingProgress}
            style={styles.modalSaveBtn}
          />
        </View>
      </Modal>

      {/* Type-the-name confirmation modal — second of two delete
          gates. The Delete button only enables when the typed string
          matches the project name exactly (trim-tolerant). */}
      <Modal
        visible={deleteModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => (deleting ? null : setDeleteModalOpen(false))}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => (deleting ? null : setDeleteModalOpen(false))}
        >
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <RNText style={[styles.modalTitle, { color: color.danger }]}>
            Confirm project deletion
          </RNText>
          <RNText style={styles.deleteHelp}>
            To confirm, type the project name exactly as shown:
          </RNText>
          <RNText style={styles.deleteNameQuote} numberOfLines={2}>
            {project.name}
          </RNText>
          <TextInput
            value={deleteNameDraft}
            onChangeText={setDeleteNameDraft}
            placeholder="Type project name"
            placeholderTextColor={color.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.deleteInput}
            editable={!deleting}
          />
          <View style={styles.deleteBtnRow}>
            <Pressable
              onPress={() => (deleting ? null : setDeleteModalOpen(false))}
              disabled={deleting}
              style={({ pressed }) => [
                styles.deleteCancelBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <RNText style={styles.deleteCancelText}>Cancel</RNText>
            </Pressable>
            <Pressable
              onPress={handleConfirmedDelete}
              disabled={
                deleting ||
                deleteNameDraft.trim() !== project.name.trim()
              }
              style={({ pressed }) => [
                styles.deleteConfirmBtn,
                (deleting ||
                  deleteNameDraft.trim() !== project.name.trim()) && {
                  opacity: 0.5,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <RNText style={styles.deleteConfirmText}>
                {deleting ? 'Deleting…' : 'Delete project'}
              </RNText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },

  scroll: {
    paddingTop: 18,
    paddingBottom: 30,
    backgroundColor: color.bgGrouped,
  },

  // KPI strip
  kpiWrap: {
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  kpiPendingNote: {
    marginTop: 8,
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textMuted,
    letterSpacing: 0.3,
    lineHeight: 15,
  },
  kpiStrip: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    backgroundColor: color.bgGrouped,
  },
  kpiCell: {
    flex: 1,
    padding: 12,
  },
  kpiCellBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: color.borderStrong,
  },
  kpiLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textFaint,
    letterSpacing: 1.2,
  },
  kpiValue: {
    fontFamily: fontFamily.mono,
    fontSize: 18,
    fontWeight: '600',
    color: color.text,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  // Sub-label under a KPI value — used by the Storage cell to show
  // "N files" beneath the byte total.
  kpiSubLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textFaint,
    letterSpacing: 1,
    marginTop: 2,
  },

  // Progress
  progressRow: {
    marginTop: 10,
  },
  progressBarsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  progressCol: {
    flex: 1,
  },
  progressColLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textFaint,
    letterSpacing: 1,
    marginBottom: 4,
  },
  progressTrack: {
    height: 3,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.primary,
  },
  progressFillBudget: {
    height: '100%',
    backgroundColor: color.text,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textFaint,
    letterSpacing: 0.8,
  },
  progressEditHint: {
    color: color.primary,
    fontWeight: '700',
  },

  group: {
    marginBottom: 22,
  },
  groupHeader: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '500',
    color: color.textFaint,
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  // Section header that hosts an inline action (e.g. EDIT next to
  // PROJECT DETAILS). Header text shrinks-to-fit; action sits at the
  // right edge.
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingRight: 16,
    paddingBottom: 8,
  },
  groupHeaderAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupHeaderActionText: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: 1.2,
  },

  // Cover photo hero — full-bleed strip above the details rows.
  coverWrap: {
    marginHorizontal: 0,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    aspectRatio: 16 / 9,
    overflow: 'hidden',
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },
  groupBody: {
    backgroundColor: color.bgGrouped,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  infoRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    backgroundColor: color.bgGrouped,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    gap: 8,
  },
  infoRowLast: {
    minHeight: 52,
  },
  infoTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '500',
    color: color.text,
    lineHeight: 20,
  },
  infoMeta: {
    marginLeft: 'auto',
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
    lineHeight: 16,
    maxWidth: '62%',
    textAlign: 'right',
  },
  infoDivider: {
    position: 'absolute',
    left: 16,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: color.borderStrong,
  },
  chevron: {
    marginLeft: 6,
    fontFamily: fontFamily.sans,
    fontSize: 16,
    color: color.textFaint,
    lineHeight: 18,
  },

  // Status pill
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  pillText: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // Category block
  catBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  catTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 5,
  },
  catLabelWrap: { flex: 1, minWidth: 0 },
  catLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.text,
    fontWeight: '500',
  },
  catMeta: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textFaint,
    marginTop: 1,
  },
  catAmount: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  miniBarTrack: {
    height: 4,
    backgroundColor: color.border,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
  },

  // Empty block
  emptyBlock: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyText: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalSheet: {
    backgroundColor: color.bgGrouped,
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },
  modalMeta: {
    marginTop: 4,
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textFaint,
    letterSpacing: 1,
  },
  modalSaveBtn: {
    marginTop: 10,
  },

  // Delete-confirmation modal — type-the-name gate.
  deleteHelp: {
    marginTop: 10,
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
    lineHeight: 18,
  },
  deleteNameQuote: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fontFamily.mono,
    fontSize: 13,
    fontWeight: '700',
    color: color.text,
    backgroundColor: color.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    letterSpacing: 0.2,
  },
  deleteInput: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    fontFamily: fontFamily.sans,
    fontSize: 15,
    color: color.text,
  },
  deleteBtnRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
  },
  deleteCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  deleteCancelText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    color: color.text,
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.danger,
  },
  deleteConfirmText: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
});
