/**
 * Transaction detail — fields, receipt preview, workflow (posted / pending / rejected),
 * and Admin approve + settlement when applicable.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ImageViewer } from '@/src/ui/ImageViewer';

import { useAuth } from '@/src/features/auth/useAuth';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useParties } from '@/src/features/parties/useParties';
import { useProject } from '@/src/features/projects/useProject';
import {
  approveTransaction,
  clearTransactionSettlement,
  rejectTransaction,
} from '@/src/features/transactions/transactions';
import { generateTransactionReceipt } from '@/src/features/transactions/transactionReceiptPdf';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import {
  getCategoryLabel,
  getPaymentMethodLabel,
  isTransactionCleared,
  normalizeTransactionType,
  PAYMENT_METHODS,
} from '@/src/features/transactions/types';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';
import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import { formatDate, formatInr } from '@/src/lib/format';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { Button } from '@/src/ui/Button';
import { color, radius, screenInset, space } from '@/src/theme';

const STATUS_CFG: Record<string, { bg: string; fg: string; label: string }> = {
  paid: { bg: color.successSoft, fg: color.success, label: 'Paid' },
  pending: { bg: color.warningSoft, fg: color.warning, label: 'Pending' },
  partial: { bg: color.dangerSoft, fg: color.danger, label: 'Partial' },
};

export default function TransactionDetailScreen() {
  const { id: projectId, txnId } = useLocalSearchParams<{ id: string; txnId: string }>();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { data: project } = useProject(projectId);
  const { members } = useOrgMembers(project?.orgId);
  const { data, loading } = useTransactions(projectId);

  const txn = useMemo(() => data.find((t) => t.id === txnId), [data, txnId]);
  const { data: parties } = useParties(project?.orgId);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settlementPreviewOpen, setSettlementPreviewOpen] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  // `clearedToParty` toggle is initialised from `submissionKind` once the
  // txn is loaded so admins don't have to remember to flip it for party
  // payments. The hydration runs in the effect below — initial value is
  // false to avoid a flash of "yes" before the txn arrives.
  const [clearedToParty, setClearedToParty] = useState(false);
  const [hydratedClearedToParty, setHydratedClearedToParty] = useState(false);
  const [payeeLabel, setPayeeLabel] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);
  // Approve-and-clear in one tap: when this is on the admin attaches a
  // payment-out screenshot and the txn is marked cleared at approval time.
  const [markClearedNow, setMarkClearedNow] = useState(false);
  const [stagedSettlementReceipt, setStagedSettlementReceipt] =
    useState<StagedFile | null>(null);
  // Deferred-clear flow (admin clears later, after the txn is already posted).
  const [clearSheetOpen, setClearSheetOpen] = useState(false);
  const [clearStagedReceipt, setClearStagedReceipt] = useState<StagedFile | null>(null);
  const [clearNote, setClearNote] = useState('');
  const [clearPayeeLabel, setClearPayeeLabel] = useState('');
  const [clearToParty, setClearToParty] = useState(false);

  const membersByUid = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const uidLabel = useCallback(
    (uid?: string) => {
      if (!uid) return '—';
      return membersByUid.get(uid)?.displayName ?? 'Team member';
    },
    [membersByUid],
  );

  // Hydrate the approve-sheet `clearedToParty` toggle from `submissionKind`
  // so admins don't have to remember to flip it for party_payment txns.
  // Runs once per txn load; never overwrites a manual toggle (the
  // `hydratedClearedToParty` flag tracks first-pass hydration).
  const txnLoaded = !!txn;
  const txnSubmissionKind = txn?.submissionKind;
  useEffect(() => {
    if (!txnLoaded || hydratedClearedToParty) return;
    setClearedToParty(txnSubmissionKind === 'party_payment');
    setHydratedClearedToParty(true);
  }, [txnLoaded, txnSubmissionKind, hydratedClearedToParty]);

  async function pickSettlementReceipt(
    source: 'camera' | 'library',
    setter: (f: StagedFile | null) => void,
  ) {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        source === 'camera'
          ? 'Allow camera access to capture a payment receipt.'
          : 'Allow photo library access to attach a payment receipt.',
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.85,
          });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setter({
      id: 'settlement',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
  }

  const handleApprove = useCallback(() => {
    const t = data.find((x) => x.id === txnId);
    if (!user || !t) return;
    Alert.alert(
      'Approve transaction',
      markClearedNow
        ? 'Approve and mark this payment as cleared?'
        : 'Post this expense to the project ledger?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: markClearedNow ? 'Approve & Clear' : 'Approve',
          onPress: async () => {
            setActionLoading(true);
            try {
              let settlementPhotoUrl: string | undefined;
              let settlementPhotoStoragePath: string | undefined;
              let settlementSize = 0;
              let settlementContentType = '';
              if (markClearedNow && stagedSettlementReceipt) {
                const { uploaded, failed } = await commitStagedFiles({
                  files: [stagedSettlementReceipt],
                  kind: 'transaction',
                  refId: t.projectId,
                  compress: 'balanced',
                });
                if (failed.length > 0) {
                  Alert.alert(
                    'Upload failed',
                    `Could not upload settlement receipt: ${failed[0].error}`,
                  );
                  setActionLoading(false);
                  return;
                }
                settlementPhotoUrl = uploaded[0].publicUrl;
                settlementPhotoStoragePath = uploaded[0].key;
                settlementSize = uploaded[0].sizeBytes;
                settlementContentType = uploaded[0].contentType;
              }

              await approveTransaction(t.id, user.uid, {
                clearedToParty,
                payeeLabel: payeeLabel.trim() || undefined,
                note: settlementNote.trim() || undefined,
                markCleared: markClearedNow,
                settlementPhotoUrl,
                settlementPhotoStoragePath,
              });

              // Attribute the storage event after the txn write succeeds so we
              // don't credit storage for an approval that failed at the
              // Firestore step.
              if (settlementPhotoStoragePath) {
                void recordStorageEvent({
                  projectId: t.projectId,
                  kind: 'transaction',
                  refId: t.id,
                  key: settlementPhotoStoragePath,
                  sizeBytes: settlementSize,
                  contentType: settlementContentType,
                  action: 'upload',
                });
              }

              setStagedSettlementReceipt(null);
              setMarkClearedNow(false);
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }, [
    user,
    txnId,
    data,
    clearedToParty,
    payeeLabel,
    settlementNote,
    markClearedNow,
    stagedSettlementReceipt,
  ]);

  const openClearSheet = useCallback(() => {
    if (!txn) return;
    // Pre-populate from existing settlement first (preserves admin's
    // earlier choice). If the txn was approved without any settlement
    // object, fall back to submissionKind so party_payment defaults to ON.
    if (txn.settlement) {
      setClearToParty(txn.settlement.clearedToParty);
    } else {
      setClearToParty(txn.submissionKind === 'party_payment');
    }
    setClearPayeeLabel(txn.settlement?.payeeLabel ?? '');
    setClearNote('');
    setClearStagedReceipt(null);
    setClearSheetOpen(true);
  }, [txn]);

  const handleClearSettlement = useCallback(async () => {
    const t = data.find((x) => x.id === txnId);
    if (!user || !t) return;
    setActionLoading(true);
    try {
      // Photo is optional — many real payments (cash, immediate UPI)
      // don't have a receipt to attach. Only run the upload pipeline
      // when the admin actually staged one.
      let settlementPhotoUrl: string | undefined;
      let settlementPhotoStoragePath: string | undefined;
      let uploadedSize = 0;
      let uploadedContentType = '';
      if (clearStagedReceipt) {
        const { uploaded, failed } = await commitStagedFiles({
          files: [clearStagedReceipt],
          kind: 'transaction',
          refId: t.projectId,
          compress: 'balanced',
        });
        if (failed.length > 0) {
          Alert.alert('Upload failed', `Could not upload receipt: ${failed[0].error}`);
          setActionLoading(false);
          return;
        }
        const up = uploaded[0];
        settlementPhotoUrl = up.publicUrl;
        settlementPhotoStoragePath = up.key;
        uploadedSize = up.sizeBytes;
        uploadedContentType = up.contentType;
      }

      await clearTransactionSettlement(t.id, {
        clearedBy: user.uid,
        settlementPhotoUrl,
        settlementPhotoStoragePath,
        note: clearNote.trim() || undefined,
        payeeLabel: clearPayeeLabel.trim() || undefined,
        clearedToParty: clearToParty,
      });

      // Only attribute storage usage when something was actually uploaded.
      if (settlementPhotoStoragePath) {
        void recordStorageEvent({
          projectId: t.projectId,
          kind: 'transaction',
          refId: t.id,
          key: settlementPhotoStoragePath,
          sizeBytes: uploadedSize,
          contentType: uploadedContentType,
          action: 'upload',
        });
      }
      setClearSheetOpen(false);
      setClearStagedReceipt(null);
      setClearNote('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [user, txnId, data, clearStagedReceipt, clearNote, clearPayeeLabel, clearToParty]);

  const handleGenerateReceipt = useCallback(async () => {
    if (!project || !txn) return;
    setGeneratingReceipt(true);
    try {
      const party = txn.partyId ? parties.find((p) => p.id === txn.partyId) ?? null : null;
      const creatorName = uidLabel(txn.createdBy);
      await generateTransactionReceipt({
        project,
        transaction: txn,
        party,
        orgId: project.orgId,
        creatorName: creatorName === '—' ? undefined : creatorName,
      });
    } catch (e) {
      Alert.alert('Could not generate receipt', e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingReceipt(false);
    }
  }, [project, txn, parties, uidLabel]);

  const handleRejectConfirm = useCallback(async () => {
    const t = data.find((x) => x.id === txnId);
    if (!user || !t) return;
    setActionLoading(true);
    try {
      await rejectTransaction(t.id, user.uid, rejectNote.trim() || 'Rejected');
      setShowRejectModal(false);
      setRejectNote('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [user, txnId, data, rejectNote]);

  if (loading && !txn) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (!txn) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={color.text} />
          </Pressable>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Transaction</Text>
          <View style={styles.navBtn} />
        </View>
        <View style={styles.loading}>
          <Text variant="meta" color="textMuted">Transaction not found.</Text>
        </View>
      </Screen>
    );
  }

  const wf = txn.workflowStatus ?? 'posted';
  const txnType = normalizeTransactionType(txn.type);
  const isIn = txnType === 'payment_in';
  // Settlement card / "Mark as Cleared" CTA only make sense for txns
  // that went through submission → approval. Direct posts by an owner
  // / admin ARE the payment moment — there's no separate "clearing"
  // step to track. Defensive `|| !!txn.settlement` keeps legacy direct
  // posts that somehow have a settlement attached visible.
  const wasSubmitted = !!txn.submittedAt;
  const showSettlementCard = wf === 'posted' && (wasSubmitted || !!txn.settlement);
  const statusCfg = STATUS_CFG[txn.status] ?? STATUS_CFG.paid;
  const pmMeta = txn.paymentMethod
    ? PAYMENT_METHODS.find((m) => m.key === txn.paymentMethod)
    : null;
  const addedByOwner = !!project?.ownerId && txn.createdBy === project.ownerId;
  const addedBySelf = !!user?.uid && txn.createdBy === user.uid;
  const addedByLabel = addedByOwner ? 'Owner' : addedBySelf ? 'You' : 'Team member';

  const canEditTxn =
    wf !== 'rejected' &&
    (can('transaction.write') ||
      (wf === 'pending_approval' &&
        !!user?.uid &&
        txn.createdBy === user.uid &&
        can('transaction.submit')));
  const canApproveTxn = wf === 'pending_approval' && can('transaction.approve');

  let workflowHeadline = 'Posted';
  let workflowSub = `Added by ${addedByLabel}`;
  let workflowIcon: keyof typeof Ionicons.glyphMap = 'shield-checkmark-outline';
  let workflowColor: string = color.success;

  if (wf === 'pending_approval') {
    workflowHeadline = 'Pending approval';
    workflowSub = 'Waiting for Admin / Super Admin. Totals exclude this entry until approved.';
    workflowIcon = 'time-outline';
    workflowColor = color.warning;
  } else if (wf === 'rejected') {
    workflowHeadline = 'Rejected';
    workflowSub = txn.rejectionNote?.trim() || 'This expense was not approved.';
    workflowIcon = 'close-circle-outline';
    workflowColor = color.danger;
  } else if (txn.approvedBy) {
    workflowSub = `Approved by ${uidLabel(txn.approvedBy)}${
      txn.approvedAt ? ` · ${formatDate(txn.approvedAt.toDate())}` : ''
    }`;
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={20} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>EXPENSE</Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>Transaction</Text>
        </View>
        <Pressable
          onPress={handleGenerateReceipt}
          hitSlop={12}
          disabled={generatingReceipt}
          style={[styles.navBtn, generatingReceipt && { opacity: 0.5 }]}
          accessibilityLabel="Generate payment receipt PDF"
        >
          {generatingReceipt ? (
            <ActivityIndicator size="small" color={color.primary} />
          ) : (
            <Ionicons name="document-text-outline" size={20} color={color.primary} />
          )}
        </Pressable>
        {canEditTxn ? (
          <Pressable
            onPress={() =>
              router.push(
                `/(app)/projects/${projectId}/edit-transaction?txnId=${txn.id}` as never,
              )
            }
            hitSlop={12}
            style={styles.navBtn}
          >
            <Ionicons name="create-outline" size={20} color={color.primary} />
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Amount hero */}
        <View style={styles.amountHero}>
          <Text variant="caption" color="textMuted" style={styles.amountEyebrow}>
            EXPENSE · {txn.id.toUpperCase()}
          </Text>
          <Text variant="largeTitle" color="text" style={styles.amountValue}>
            {isIn ? '+' : '-'}{formatInr(txn.amount)}
          </Text>
          <Text variant="meta" color="textMuted" style={styles.amountSub} numberOfLines={2}>
            {txn.description || (isIn ? 'Payment received' : 'Expense entry')}
          </Text>
          <View style={styles.pillRow}>
            <View style={[styles.statusPill, { backgroundColor: statusCfg.bg }]}>
              <Text variant="caption" style={{ color: statusCfg.fg }}>
                {statusCfg.label}
              </Text>
            </View>
            {wf === 'pending_approval' ? (
              <View style={[styles.statusPill, { borderColor: workflowColor }]}>
                <Text variant="caption" style={{ color: workflowColor }}>Pending approval</Text>
              </View>
            ) : wf === 'rejected' ? (
              <View style={[styles.statusPill, { borderColor: workflowColor }]}>
                <Text variant="caption" style={{ color: workflowColor }}>Rejected</Text>
              </View>
            ) : null}
            {txn.paymentMethod ? (
              <View style={styles.statusPill}>
                <Text variant="caption" color="textMuted">
                  {getPaymentMethodLabel(txn.paymentMethod)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.approvalBar}>
          <View style={styles.approvalLeft}>
            <Ionicons name={workflowIcon} size={14} color={workflowColor} />
            <Text variant="caption" style={[styles.approvalHeadline, { color: workflowColor }]}>
              {workflowHeadline}
            </Text>
          </View>
        </View>
        <Text variant="caption" color="textMuted" style={styles.workflowSub}>
          {workflowSub}
        </Text>

        {canApproveTxn ? (
          <View style={styles.approveCard}>
            <Text variant="caption" color="textMuted" style={styles.sectionLabelInline}>
              SETTLEMENT (ON APPROVE)
            </Text>
            <View style={styles.switchRow}>
              <Text variant="meta" color="text">Payment cleared to party</Text>
              <Switch value={clearedToParty} onValueChange={setClearedToParty} />
            </View>
            <Text variant="caption" color="textMuted" style={styles.fieldLabel}>Payee label (optional)</Text>
            <TextInput
              value={payeeLabel}
              onChangeText={setPayeeLabel}
              placeholder="Who was paid?"
              placeholderTextColor={color.textFaint}
              style={styles.textInput}
            />
            <Text variant="caption" color="textMuted" style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              value={settlementNote}
              onChangeText={setSettlementNote}
              placeholder="Settlement note"
              placeholderTextColor={color.textFaint}
              style={styles.textInput}
              multiline
            />

            {/* One-tap "approve and pay": admin marks the money out at the
                same moment as approval. Submitter gets BOTH the approved
                push and the cleared push (the cloud function fans out
                both branches in this case). */}
            <View style={[styles.switchRow, { marginTop: space.sm }]}>
              <View style={{ flex: 1 }}>
                <Text variant="meta" color="text">Mark cleared now</Text>
                <Text variant="caption" color="textMuted">
                  Optionally attach a payment receipt — supervisor gets a "cleared" notification either way.
                </Text>
              </View>
              <Switch
                value={markClearedNow}
                onValueChange={(v) => {
                  setMarkClearedNow(v);
                  if (!v) setStagedSettlementReceipt(null);
                }}
              />
            </View>
            {markClearedNow ? (
              <View style={styles.receiptStage}>
                {stagedSettlementReceipt ? (
                  <View style={styles.stagedReceiptBox}>
                    <Image
                      source={{ uri: stagedSettlementReceipt.localUri }}
                      style={styles.stagedReceiptImg}
                    />
                    <Pressable
                      onPress={() => setStagedSettlementReceipt(null)}
                      hitSlop={6}
                      style={styles.stagedReceiptClear}
                    >
                      <Ionicons name="close-circle" size={20} color={color.danger} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.receiptPickRow}>
                    <Pressable
                      onPress={() => pickSettlementReceipt('camera', setStagedSettlementReceipt)}
                      style={styles.receiptPickBtn}
                    >
                      <Ionicons name="camera-outline" size={16} color={color.primary} />
                      <Text variant="caption" color="primary">Camera</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => pickSettlementReceipt('library', setStagedSettlementReceipt)}
                      style={styles.receiptPickBtn}
                    >
                      <Ionicons name="image-outline" size={16} color={color.primary} />
                      <Text variant="caption" color="primary">Gallery</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => setShowRejectModal(true)}
                style={[styles.actionBtn, styles.rejectBtn]}
                disabled={actionLoading}
              >
                <Text variant="metaStrong" color="danger">Reject</Text>
              </Pressable>
              <Pressable
                onPress={handleApprove}
                style={[styles.actionBtn, styles.approveBtn]}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color={color.onPrimary} />
                ) : (
                  <Text variant="metaStrong" color="onPrimary">
                    {markClearedNow ? 'Approve & Clear' : 'Approve'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {showSettlementCard ? (
          <View style={styles.card}>
            <View style={styles.settlementHeader}>
              <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
                SETTLEMENT
              </Text>
              {isTransactionCleared(txn) ? (
                <View style={styles.clearedPill}>
                  <Ionicons name="checkmark-circle" size={12} color={color.success} />
                  <Text variant="caption" style={{ color: color.success }}>
                    Cleared
                  </Text>
                </View>
              ) : (
                <View style={styles.unclearedPill}>
                  <Ionicons name="time-outline" size={12} color={color.warning} />
                  <Text variant="caption" style={{ color: color.warning }}>
                    Awaiting payment
                  </Text>
                </View>
              )}
            </View>

            {txn.submissionKind ? (
              <>
                <DetailRow
                  icon={
                    txn.submissionKind === 'expense_reimbursement'
                      ? 'wallet-outline'
                      : 'people-outline'
                  }
                  label="Type"
                  value={
                    txn.submissionKind === 'expense_reimbursement'
                      ? `Reimbursement to ${uidLabel(txn.createdBy)}`
                      : `Payment to ${txn.partyName || 'party'}`
                  }
                />
                <Divider />
              </>
            ) : null}

            {txn.settlement ? (
              <>
                <DetailRow
                  icon="checkmark-done-outline"
                  label="Cleared to party"
                  value={txn.settlement.clearedToParty ? 'Yes' : 'No'}
                />
                {txn.settlement.payeeLabel ? (
                  <>
                    <Divider />
                    <DetailRow
                      icon="person-outline"
                      label="Payee"
                      value={txn.settlement.payeeLabel}
                    />
                  </>
                ) : null}
                {txn.settlement.note ? (
                  <>
                    <Divider />
                    <DetailRow
                      icon="document-text-outline"
                      label="Note"
                      value={txn.settlement.note}
                      multiline
                    />
                  </>
                ) : null}
                {txn.settlement.clearedAt ? (
                  <>
                    <Divider />
                    <DetailRow
                      icon="calendar-outline"
                      label="Cleared on"
                      value={formatDate(txn.settlement.clearedAt.toDate())}
                    />
                  </>
                ) : null}
                {txn.settlement.clearedBy ? (
                  <>
                    <Divider />
                    <DetailRow
                      icon="shield-checkmark-outline"
                      label="Cleared by"
                      value={uidLabel(txn.settlement.clearedBy)}
                    />
                  </>
                ) : null}
              </>
            ) : (
              <Text variant="meta" color="textMuted" style={{ marginTop: space.xs }}>
                Approved without settlement details.
              </Text>
            )}

            {txn.settlement?.settlementPhotoUrl ? (
              <View style={{ marginTop: space.sm }}>
                <Text variant="caption" color="textMuted" style={styles.fieldLabel}>
                  Payment receipt
                </Text>
                <Pressable
                  onPress={() => setSettlementPreviewOpen(true)}
                  style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                  accessibilityLabel="Open settlement receipt full-screen"
                >
                  <Image
                    source={{ uri: txn.settlement.settlementPhotoUrl }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                  <View style={styles.photoExpandHint}>
                    <Ionicons name="expand-outline" size={14} color="#fff" />
                  </View>
                </Pressable>
              </View>
            ) : null}

            {!isTransactionCleared(txn) && can('transaction.approve') ? (
              <Pressable
                onPress={openClearSheet}
                style={({ pressed }) => [
                  styles.markClearedBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="checkmark-done-outline" size={16} color={color.onPrimary} />
                <Text variant="metaStrong" color="onPrimary">Mark as Cleared</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Details card */}
        <View style={styles.card}>
          <DetailRow icon="person-outline" label="Party" value={txn.partyName || '—'} />
          <Divider />
          <DetailRow
            icon="calendar-outline"
            label="Date"
            value={txn.date ? formatDate(txn.date.toDate()) : '—'}
          />
          {!!txn.description && (
            <>
              <Divider />
              <DetailRow
                icon="document-text-outline"
                label="Description"
                value={txn.description}
                multiline
              />
            </>
          )}
          {!!txn.referenceNumber && (
            <>
              <Divider />
              <DetailRow
                icon="pricetag-outline"
                label="Reference"
                value={txn.referenceNumber}
              />
            </>
          )}
        </View>

        {/* Category + Payment Method */}
        {(txn.category || txn.paymentMethod) && (
          <View style={styles.card}>
            {txn.category && (
              <DetailRow
                icon="grid-outline"
                label="Cost Code"
                value={getCategoryLabel(txn.category)}
              />
            )}
            {txn.category && txn.paymentMethod && <Divider />}
            {txn.paymentMethod && (
              <DetailRow
                icon={(pmMeta?.icon ?? 'wallet-outline') as keyof typeof Ionicons.glyphMap}
                label="Payment Method"
                value={getPaymentMethodLabel(txn.paymentMethod)}
              />
            )}
          </View>
        )}

        {!!txn.photoUrl && (
          <View style={styles.card}>
            <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
              BILL / RECEIPT
            </Text>
            <Pressable
              onPress={() => setPreviewOpen(true)}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              accessibilityLabel="Open receipt full-screen"
            >
              <Image
                source={{ uri: txn.photoUrl }}
                style={styles.photo}
                resizeMode="cover"
              />
              <View style={styles.photoExpandHint}>
                <Ionicons name="expand-outline" size={14} color="#fff" />
              </View>
            </Pressable>
          </View>
        )}

        {wf === 'posted' ? (
          <Pressable
            onPress={handleGenerateReceipt}
            disabled={generatingReceipt}
            style={({ pressed }) => [
              styles.receiptCta,
              pressed && { opacity: 0.85 },
              generatingReceipt && { opacity: 0.6 },
            ]}
            accessibilityLabel={`Generate ${isIn ? 'payment' : 'payment out'} receipt PDF`}
          >
            {generatingReceipt ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="share-outline" size={16} color="#fff" />
            )}
            <Text variant="metaStrong" color="onPrimary">
              {generatingReceipt
                ? 'Generating receipt…'
                : `Share ${isIn ? 'Payment' : 'Payment Out'} Receipt`}
            </Text>
          </Pressable>
        ) : null}

        <View style={{ height: space.xl }} />
      </ScrollView>

      <Modal
        visible={showRejectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRejectModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.rejectOverlay}
        >
          <Pressable style={styles.rejectBackdrop} onPress={() => setShowRejectModal(false)} />
          <View style={styles.rejectSheet}>
            <Text variant="bodyStrong" color="text">Reject expense</Text>
            <TextInput
              value={rejectNote}
              onChangeText={setRejectNote}
              placeholder="Reason (optional)"
              placeholderTextColor={color.textFaint}
              style={styles.rejectInput}
              multiline
            />
            <View style={styles.rejectActions}>
              <Button label="Cancel" variant="text" onPress={() => setShowRejectModal(false)} />
              <Button
                label={actionLoading ? 'Working…' : 'Reject'}
                onPress={handleRejectConfirm}
                loading={actionLoading}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ImageViewer
        images={txn.photoUrl ? [txn.photoUrl] : []}
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <ImageViewer
        images={
          txn.settlement?.settlementPhotoUrl ? [txn.settlement.settlementPhotoUrl] : []
        }
        visible={settlementPreviewOpen}
        onClose={() => setSettlementPreviewOpen(false)}
      />

      {/* Mark as Cleared sheet — opens when admin taps "Mark as Cleared"
          on an already-posted transaction. Photo is mandatory; clearedToParty
          flag + note are optional. */}
      <Modal
        visible={clearSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setClearSheetOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setClearSheetOpen(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text variant="bodyStrong" color="text">Mark as Cleared</Text>
              <Pressable onPress={() => setClearSheetOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={color.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: space.md, gap: space.sm }}
              keyboardShouldPersistTaps="handled"
            >
              <Text variant="meta" color="textMuted">
                Attach a payment receipt (optional). Supervisor gets a "cleared" notification either way.
              </Text>

              {clearStagedReceipt ? (
                <View style={styles.stagedReceiptBox}>
                  <Image
                    source={{ uri: clearStagedReceipt.localUri }}
                    style={styles.stagedReceiptImg}
                  />
                  <Pressable
                    onPress={() => setClearStagedReceipt(null)}
                    hitSlop={6}
                    style={styles.stagedReceiptClear}
                  >
                    <Ionicons name="close-circle" size={22} color={color.danger} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.receiptPickRow}>
                  <Pressable
                    onPress={() => pickSettlementReceipt('camera', setClearStagedReceipt)}
                    style={styles.receiptPickBtn}
                  >
                    <Ionicons name="camera-outline" size={18} color={color.primary} />
                    <Text variant="meta" color="primary">Camera</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => pickSettlementReceipt('library', setClearStagedReceipt)}
                    style={styles.receiptPickBtn}
                  >
                    <Ionicons name="image-outline" size={18} color={color.primary} />
                    <Text variant="meta" color="primary">Gallery</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.switchRow}>
                <Text variant="meta" color="text">Cleared to party</Text>
                <Switch value={clearToParty} onValueChange={setClearToParty} />
              </View>

              <Text variant="caption" color="textMuted" style={styles.fieldLabel}>
                Payee label (optional)
              </Text>
              <TextInput
                value={clearPayeeLabel}
                onChangeText={setClearPayeeLabel}
                placeholder="Who was paid?"
                placeholderTextColor={color.textFaint}
                style={styles.textInput}
              />

              <Text variant="caption" color="textMuted" style={styles.fieldLabel}>
                Note (optional)
              </Text>
              <TextInput
                value={clearNote}
                onChangeText={setClearNote}
                placeholder="UPI ref, bank txn id, etc."
                placeholderTextColor={color.textFaint}
                style={styles.textInput}
                multiline
              />

              <View style={[styles.actionRow, { marginTop: space.md }]}>
                <Pressable
                  onPress={() => setClearSheetOpen(false)}
                  style={[styles.actionBtn, styles.rejectBtn]}
                  disabled={actionLoading}
                >
                  <Text variant="metaStrong" color="textMuted">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleClearSettlement}
                  style={[styles.actionBtn, styles.approveBtn]}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color={color.onPrimary} />
                  ) : (
                    <Text variant="metaStrong" color="onPrimary">
                      Mark Cleared
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function DetailRow({
  icon,
  label,
  value,
  multiline,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.metaRow, multiline && styles.metaRowMultiline]}>
      <Ionicons name={icon} size={16} color={color.textMuted} />
      <Text variant="caption" color="textMuted" style={styles.metaLabel}>
        {label}
      </Text>
      <Text
        variant="meta"
        color="text"
        style={multiline ? styles.metaValueMultiline : styles.metaValue}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: 2,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navEyebrow: { letterSpacing: 1.2 },
  navTitle: { textAlign: 'center' },
  scroll: { paddingHorizontal: screenInset, paddingTop: 12, paddingBottom: space.xl, gap: space.sm },

  amountHero: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  amountEyebrow: {
    letterSpacing: 1.2,
  },
  amountValue: {
    marginTop: 8,
    letterSpacing: -0.8,
  },
  amountSub: {
    marginTop: 4,
    textAlign: 'center',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  approvalBar: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
  },
  approvalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  approvalHeadline: {
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  workflowSub: {
    marginTop: 4,
    marginBottom: 6,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  approveCard: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    padding: space.sm,
    gap: space.xs,
  },
  sectionLabelInline: { marginBottom: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  fieldLabel: { marginTop: space.xs },
  textInput: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.sm,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    color: color.text,
    marginTop: 4,
  },
  actionRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  rejectBtn: { backgroundColor: color.bgGrouped },
  approveBtn: { backgroundColor: color.primary, borderColor: color.primary },
  statusPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },

  card: {
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: 0,
  },
  sectionLabel: { marginTop: space.sm, marginBottom: space.xs, paddingHorizontal: space.md },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: 12,
    paddingHorizontal: space.md,
  },
  metaRowMultiline: { alignItems: 'flex-start' },
  metaLabel: { width: 110, marginLeft: 4 },
  metaValue: { flex: 1, textAlign: 'right' },
  metaValueMultiline: { flex: 1 },
  divider: {
    height: 1,
    backgroundColor: color.borderStrong,
    marginLeft: space.md,
  },

  photo: {
    width: '100%',
    height: 220,
    borderRadius: radius.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  photoExpandHint: {
    position: 'absolute',
    top: space.sm + 6,
    right: space.sm,
    width: 26, height: 26,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },

  receiptCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: color.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: space.sm,
  },

  rejectOverlay: { flex: 1, justifyContent: 'flex-end' },
  rejectBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  rejectSheet: {
    backgroundColor: color.bgGrouped,
    padding: space.md,
    borderTopWidth: 1,
    borderColor: color.borderStrong,
    gap: space.sm,
  },
  rejectInput: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    padding: space.sm,
    minHeight: 80,
    textAlignVertical: 'top',
    color: color.text,
  },
  rejectActions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },

  // ── Settlement & cleared flow ──
  settlementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: space.md,
  },
  clearedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: color.successSoft,
    borderWidth: 1,
    borderColor: color.success,
    marginTop: space.sm,
  },
  unclearedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: color.warningSoft,
    borderWidth: 1,
    borderColor: color.warning,
    marginTop: space.sm,
  },
  markClearedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: color.primary,
    paddingVertical: space.sm,
    marginHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.sm,
    borderRadius: radius.sm,
  },
  receiptStage: { marginTop: space.xs },
  receiptPickRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  receiptPickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.primary,
    borderRadius: radius.sm,
    backgroundColor: color.primarySoft,
  },
  stagedReceiptBox: {
    position: 'relative',
    alignItems: 'flex-start',
  },
  stagedReceiptImg: {
    width: '100%',
    height: 180,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  stagedReceiptClear: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
  },

  // ── Mark-as-Cleared modal ──
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 6,
    paddingBottom: 24,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
});
