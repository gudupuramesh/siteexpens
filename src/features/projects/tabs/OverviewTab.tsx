/**
 * OverviewTab — project context dashboard (v2 design).
 *
 * Sections (top → bottom):
 *   1. Combined KPI tile (Budget · Spent · Left · Storage) with hairlines
 *   2. Pending approvals note (when applicable)
 *   3. Progress card — Complete + Budget Used progress bars (tap to edit)
 *   4. Optional cover photo card
 *   5. FormGroup "Project details" — info Rows + edit pen
 *   6. FormGroup "Spend by category" — per-category mini bars
 *   7. FormGroup "Danger zone" — Delete project (red)
 *
 * Wired to live Firestore data:
 *   useProject(id)       → name, status, dates, value, address
 *   useTransactions(id)  → spent (payment_out total) + category split
 *   useTasks(id)         → average task progress for "% complete"
 *   useProjectStorage(id)→ R2 storage usage
 *   useMaterialRequests  → pending count for the approvals note
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { Slider } from '@/src/ui/io';

import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2, type ThemeV2 } from '@/src/theme/v2';

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

// Status pill tone — only outcomes that earn semantic colour stay coloured:
//   active    → blue   (current / live state)
//   on_hold   → orange (pending / paused — warning per the 4-colour rule;
//                       yellow isn't in our palette)
//   completed → green  (success outcome)
//   archived  → red    (decommissioned / removed from active set)
const STATUS_TONE: Record<ProjectStatus, 'blue' | 'green' | 'orange' | 'red'> = {
  active: 'blue',
  on_hold: 'orange',
  completed: 'green',
  archived: 'red',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

export function OverviewTab() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const refresh = usePullToRefresh();
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

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteNameDraft, setDeleteNameDraft] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Spent + by-category breakdown — only payment_out
  const { spent, byCategory } = useMemo(() => {
    let s = 0;
    const cat: Record<string, number> = {};
    for (const tx of transactions) {
      if (!isTransactionCountedInTotals(tx)) continue;
      const kind = normalizeTransactionType(tx.type);
      if (kind === 'payment_out') {
        s += tx.amount;
        const k = tx.category ?? 'others';
        cat[k] = (cat[k] ?? 0) + tx.amount;
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
    const sum = tasks.reduce((acc, tk) => acc + (tk.progress ?? 0), 0);
    return Math.round(sum / tasks.length);
  }, [project?.progress, tasks]);

  if (loading || !project) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={t.palette.blue.base} />
      </View>
    );
  }

  const budget = project.value ?? 0;
  const left = Math.max(0, budget - spent);
  const budgetUsedPct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const overspent = budget > 0 && spent / budget > 0.9;
  const statusToneKey = STATUS_TONE[project.status as ProjectStatus] ?? 'blue';
  const statusTone = t.palette[statusToneKey];
  const statusLabel = STATUS_LABEL[project.status as ProjectStatus] ?? 'Active';
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

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl {...refresh.props} />}
    >
      {/* KPI tile */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <View
          style={[
            styles.kpiCard,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.card,
              borderColor: cardBorder,
              borderWidth: t.hairline,
            },
          ]}
        >
          <KpiCol label="BUDGET" value={formatInrCompact(budget)} color={t.colors.label} />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCol
            label="SPENT"
            value={formatInrCompact(spent)}
            color={overspent ? t.palette.red.base : t.colors.label}
          />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCol
            label="LEFT"
            value={formatInrCompact(left)}
            color={t.colors.label}
          />
          <View style={[styles.kpiDivider, { backgroundColor: t.colors.separator }]} />
          <KpiCol
            label="STORAGE"
            value={prettyBytes(storage.totalBytes)}
            sub={`${storage.fileCount} file${storage.fileCount === 1 ? '' : 's'}`}
            color={t.colors.label}
          />
        </View>
      </View>

      {/* Pending approvals note */}
      {pendingMaterials.length > 0 || pendingApprovalCount > 0 ? (
        <View style={{ paddingHorizontal: 32, paddingTop: 8 }}>
          <Text variant="caption2" color="secondary" style={{ letterSpacing: 0.4, lineHeight: 16 }}>
            Pending approvals:
            {pendingMaterials.length > 0
              ? ` ${pendingMaterials.length} material request(s)`
              : ''}
            {pendingApprovalCount > 0
              ? `${pendingMaterials.length > 0 ? ';' : ''} ${pendingApprovalCount} transaction(s)${
                  pendingPaymentOutTotal > 0
                    ? ` (${formatInrCompact(Math.round(pendingPaymentOutTotal))} out not in spent)`
                    : ''
                }`
              : ''}
          </Text>
        </View>
      ) : null}

      {/* Progress card */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <Pressable
          onPress={openProgressEditor}
          style={({ pressed }) => [
            styles.progressCard,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.card,
              borderColor: cardBorder,
              borderWidth: t.hairline,
            },
            pressed && { opacity: 0.92 },
          ]}
        >
          <View style={styles.progressBarsRow}>
            <ProgressCol
              label="COMPLETE"
              pct={taskProgressPct}
              color={t.palette.blue.base}
              t={t}
            />
            <ProgressCol
              label="BUDGET USED"
              pct={budgetUsedPct}
              color={overspent ? t.palette.red.base : t.colors.label}
              t={t}
            />
          </View>
          <View style={styles.progressMetaRow}>
            <Text
              variant="caption2"
              style={{
                color: t.palette.blue.base,
                fontWeight: '700',
                letterSpacing: 0.5,
              }}
            >
              {taskProgressPct}% COMPLETE · EDIT
            </Text>
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5 }}
            >
              {budgetUsedPct}% BUDGET USED
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Optional cover photo */}
      {project.photoUri ? (
        <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
          <View
            style={[
              styles.coverWrap,
              {
                borderRadius: t.radii.card,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            <Image
              source={{ uri: project.photoUri }}
              style={styles.coverImg}
              resizeMode="cover"
            />
          </View>
        </View>
      ) : null}

      {/* Project details */}
      <FormGroup
        header="Project details"
      >
        <Row label="Name" value={project.name} />
        {project.client ? <Row label="Client" value={project.client} /> : null}
        <Row label="Location" value={project.location || '—'} />
        <Row label="Site address" value={project.siteAddress || '—'} />
        {project.typology ? (
          <Row
            label="Type"
            value={
              [
                PROJECT_TYPOLOGIES.find((tt) => tt.key === project.typology)?.label,
                project.subType,
              ]
                .filter(Boolean)
                .join(' — ') || '—'
            }
          />
        ) : null}
        <Row label="Start date" value={formatAbsDate(startDate)} />
        <Row label="Target handover" value={formatAbsDate(endDate)} />
        <Row label="Value" value={formatInr(project.value)} />
        <Row
          label="Status"
          chevron
          onPress={() => setStatusPickerOpen(true)}
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {savingStatus ? (
                <ActivityIndicator
                  size="small"
                  color={t.colors.tertiary}
                  style={{ marginRight: 8 }}
                />
              ) : null}
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? statusTone.softDark : statusTone.soft,
                    borderRadius: 999,
                  },
                ]}
              >
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: statusTone.base,
                    marginRight: 5,
                  }}
                />
                <Text
                  variant="caption2"
                  style={{
                    color: statusTone.base,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                  }}
                >
                  {statusLabel.toUpperCase()}
                </Text>
              </View>
            </View>
          }
        />
        <Row
          label="Team size"
          value={
            project.team !== undefined && project.team > 0
              ? `${project.team} ${project.team === 1 ? 'person' : 'people'}`
              : '—'
          }
          divider={false}
        />
      </FormGroup>

      {/* Edit affordance moved to the top-right of the screen header
          (see `app/(app)/projects/[id]/overview.tsx`). No duplicate
          button needed here. */}

      {/* Spend by category */}
      {sortedCats.length > 0 ? (
        <View style={{ marginTop: 24 }}>
          <Text
            variant="caption2"
            color="secondary"
            style={{
              paddingHorizontal: 32,
              paddingBottom: 7,
              letterSpacing: 0.4,
            }}
          >
            SPEND BY CATEGORY
          </Text>
          <View
            style={[
              styles.catCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.group,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            {sortedCats.map(([key, amt], i) => {
              const pct = spent > 0 ? Math.round((amt / spent) * 100) : 0;
              const txnCount = transactions.filter((tx) => {
                const kind = normalizeTransactionType(tx.type);
                return kind === 'payment_out' && (tx.category ?? 'others') === key;
              }).length;
              const isLast = i === sortedCats.length - 1;
              return (
                <View
                  key={key}
                  style={[
                    styles.catRow,
                    !isLast && {
                      borderBottomColor: t.colors.separator,
                      borderBottomWidth: t.hairline,
                    },
                  ]}
                >
                  <View style={styles.catTopRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        variant="callout"
                        color="label"
                       
                        numberOfLines={1}
                      >
                        {categoryLabel(key)}
                      </Text>
                      <Text
                        variant="caption1"
                        color="tertiary"
                        style={{ marginTop: 1 }}
                      >
                        {txnCount} txn{txnCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        variant="footnote"
                        color="label"
                        style={{ fontWeight: '700' }}
                      >
                        {formatInrCompact(amt)}
                      </Text>
                      <Text variant="caption2" color="tertiary" style={{ marginTop: 1 }}>
                        {pct}%
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.miniBarTrack,
                      { backgroundColor: t.colors.fill3, borderRadius: 2 },
                    ]}
                  >
                    <View
                      style={[
                        styles.miniBarFill,
                        {
                          // All category bars render in the neutral label
                          // colour. The previous "first bar in blue"
                          // highlight implied semantic meaning where there
                          // is none — every row already carries its own
                          // amount + label, so the bar fills are purely
                          // for visual proportion, not categorical
                          // emphasis.
                          width: `${pct}%`,
                          backgroundColor: t.colors.label,
                          borderRadius: 2,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
          <Text
            variant="caption2"
            color="secondary"
            style={{
              paddingHorizontal: 16,
              paddingBottom: 7,
              letterSpacing: 0.4,
            }}
          >
            SPEND BY CATEGORY
          </Text>
          <View
            style={[
              styles.emptyCatCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.group,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            <Ionicons name="receipt-outline" size={22} color={t.colors.tertiary} />
            <Text
              variant="callout"
              color="secondary"
              style={{ marginTop: 8, textAlign: 'center' }}
            >
              No expenses recorded yet
            </Text>
          </View>
        </View>
      )}

      {/* Danger zone */}
      <View style={{ marginTop: 24 }}>
        <Text
          variant="caption2"
          color="secondary"
          style={{
            paddingHorizontal: 32,
            paddingBottom: 7,
            letterSpacing: 0.4,
          }}
        >
          DANGER ZONE
        </Text>
        <View
          style={[
            styles.dangerCard,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.group,
              borderColor: cardBorder,
              borderWidth: t.hairline,
            },
          ]}
        >
          <Pressable
            onPress={handleDeletePress}
            style={({ pressed }) => [
              styles.dangerRow,
              pressed && { backgroundColor: t.colors.fill3 },
            ]}
          >
            <View
              style={[
                styles.dangerIcon,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                  borderRadius: t.radii.tile,
                },
              ]}
            >
              <Ionicons name="trash-outline" size={16} color={t.palette.red.base} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                variant="body"
                style={{ color: t.palette.red.base, fontWeight: '600' }}
              >
                Delete project
              </Text>
              <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                Permanent — wipes tasks, transactions, files and history
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={14}
              color={t.colors.tertiary}
            />
          </Pressable>
        </View>
      </View>

      {/* Status picker */}
      <SelectSheet
        open={statusPickerOpen}
        title="Project status"
        options={PROJECT_STATUS_OPTIONS.map((o) => ({
          key: o.key as string,
          label: o.label,
        }))}
        selected={project.status as string}
        onPick={(k) => void handleStatusPick(k as ProjectStatus)}
        onClose={() => setStatusPickerOpen(false)}
      />

      {/* Progress editor sheet */}
      <Modal
        visible={progressEditorOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setProgressEditorOpen(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setProgressEditorOpen(false)}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: t.colors.surface,
                borderTopLeftRadius: t.radii.sheet,
                borderTopRightRadius: t.radii.sheet,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />
            <View
              style={[
                styles.sheetHeader,
                {
                  borderBottomColor: t.colors.separator,
                  borderBottomWidth: t.hairline,
                },
              ]}
            >
              <Pressable
                onPress={() => setProgressEditorOpen(false)}
                hitSlop={8}
                style={styles.sheetSideBtn}
              >
                <Text variant="body" style={{ color: t.palette.blue.base }}>
                  Cancel
                </Text>
              </Pressable>
              <Text
                variant="headline"
                color="label"
                style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
              >
                Update progress
              </Text>
              <Pressable
                onPress={() => void handleSaveProgress()}
                disabled={savingProgress}
                hitSlop={8}
                style={[styles.sheetSideBtn, { alignItems: 'flex-end' }]}
              >
                <Text
                  variant="body"
                  style={{
                    color: t.palette.blue.base,
                    fontWeight: '600',
                    opacity: savingProgress ? 0.5 : 1,
                  }}
                >
                  {savingProgress ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.progressEditorBody}>
              <Text
                variant="title2"
                color="label"
                style={{ textAlign: 'center', fontWeight: '700', letterSpacing: -0.5 }}
              >
                {Math.round(progressDraft)}%
              </Text>
              <Text
                variant="caption2"
                color="secondary"
                style={{ textAlign: 'center', marginTop: 4, letterSpacing: 0.5 }}
              >
                COMPLETE
              </Text>
              <View style={{ marginTop: 24 }}>
                <Slider value={progressDraft} onChange={setProgressDraft} step={1} />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Type-the-name confirmation modal */}
      <Modal
        visible={deleteModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => (deleting ? null : setDeleteModalOpen(false))}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (deleting ? null : setDeleteModalOpen(false))}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: t.colors.surface,
                borderTopLeftRadius: t.radii.sheet,
                borderTopRightRadius: t.radii.sheet,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />
            <View style={styles.deleteBody}>
              <View
                style={[
                  styles.deleteHeroIcon,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                    borderRadius: t.radii.tile + 4,
                  },
                ]}
              >
                <Ionicons
                  name="warning-outline"
                  size={24}
                  color={t.palette.red.base}
                />
              </View>
              <Text
                variant="title3"
                style={{
                  color: t.palette.red.base,
                  marginTop: 12,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                Confirm deletion
              </Text>
              <Text
                variant="callout"
                color="secondary"
                style={{ marginTop: 6, textAlign: 'center' }}
              >
                Type the project name exactly to confirm.
              </Text>

              <View
                style={[
                  styles.deleteNameQuote,
                  {
                    backgroundColor: t.colors.fill3,
                    borderRadius: t.radii.field,
                  },
                ]}
              >
                <Text
                  variant="body"
                  color="label"
                  style={{ fontWeight: '700', textAlign: 'center' }}
                  numberOfLines={2}
                >
                  {project.name}
                </Text>
              </View>

              <TextInput
                value={deleteNameDraft}
                onChangeText={setDeleteNameDraft}
                placeholder="Type project name"
                placeholderTextColor={t.colors.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!deleting}
                style={[
                  styles.deleteInput,
                  {
                    backgroundColor: t.colors.surface,
                    borderColor:
                      deleteNameDraft.trim() === project.name.trim()
                        ? t.palette.red.base
                        : t.colors.fill3,
                    borderRadius: t.radii.field,
                    color: t.colors.label,
                    ...t.type.body,
                  },
                ]}
              />

              <View style={styles.deleteBtnRow}>
                <Pressable
                  onPress={() => (deleting ? null : setDeleteModalOpen(false))}
                  disabled={deleting}
                  style={({ pressed }) => [
                    styles.deleteCancelBtn,
                    {
                      backgroundColor: t.colors.fill3,
                      borderRadius: 999,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    variant="callout"
                    color="label"
                    style={{ fontWeight: '700' }}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleConfirmedDelete()}
                  disabled={
                    deleting || deleteNameDraft.trim() !== project.name.trim()
                  }
                  style={({ pressed }) => [
                    styles.deleteConfirmBtn,
                    {
                      backgroundColor: t.palette.red.base,
                      borderRadius: 999,
                    },
                    (deleting || deleteNameDraft.trim() !== project.name.trim()) && {
                      opacity: 0.5,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    variant="callout"
                    style={{ color: '#fff', fontWeight: '700' }}
                  >
                    {deleting ? 'Deleting…' : 'Delete project'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function KpiCol({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <View style={styles.kpiCol}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text
        variant="callout"
        style={{ color, marginTop: 4, fontWeight: '700' }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      {sub ? (
        <Text
          variant="caption2"
          color="tertiary"
          style={{ marginTop: 2, letterSpacing: 0.3 }}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function ProgressCol({
  label,
  pct,
  color,
  t,
}: {
  label: string;
  pct: number;
  color: string;
  t: ThemeV2;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <View
        style={[
          styles.progressTrack,
          { backgroundColor: t.colors.fill3, borderRadius: 2, marginTop: 6 },
        ]}
      >
        <View
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },

  // KPI tile
  kpiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  kpiCol: { flex: 1, alignItems: 'center' },
  kpiDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 6,
  },

  // Progress card
  progressCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  progressBarsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  progressTrack: {
    height: 4,
    overflow: 'hidden',
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  // Cover
  coverWrap: {
    overflow: 'hidden',
    aspectRatio: 16 / 9,
  },
  coverImg: {
    width: '100%',
    height: '100%',
  },

  // Status pill
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  // Edit pen
  editPenWrap: {
    paddingHorizontal: 16,
    marginTop: 10,
    alignItems: 'flex-end',
  },
  editPen: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // Categories
  catCard: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  catRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  catTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  miniBarTrack: {
    height: 4,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
  },
  emptyCatCard: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },

  // Danger
  dangerCard: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
  dangerIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sheet (progress editor + delete confirm)
  sheet: {
    paddingTop: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheetSideBtn: { minWidth: 70 },
  progressEditorBody: {
    paddingHorizontal: 24,
    paddingVertical: 28,
  },

  // Delete sheet
  deleteBody: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 4,
    alignItems: 'stretch',
  },
  deleteHeroIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  deleteNameQuote: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deleteInput: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
  },
  deleteBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  deleteCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
