/**
 * Transaction detail / preview — v2 design.
 *
 * Layout (top → bottom):
 *   1. Header — back · "Transaction" + amount · receipt PDF · edit
 *   2. Hero amount card — large signed amount + status pills + payment method
 *   3. Workflow ribbon (Posted / Pending / Rejected)
 *   4. Approve panel (admins only, when pending) — settlement toggle + notes
 *      + photo + Reject/Approve buttons
 *   5. Settlement FormGroup (when relevant) — Cleared status, payee, note,
 *      cleared on/by, attached receipt
 *   6. Details FormGroup — Party · Date · Description · Reference
 *   7. Category + Method FormGroup
 *   8. Bill / Receipt photo (when attached)
 *   9. Share Receipt button
 *
 * Approve sheet + Mark-as-Cleared sheet open from inline buttons. Reject
 * is a small bottom sheet with a notes field.
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export default function TransactionDetailScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { id: projectId, txnId } = useLocalSearchParams<{ id: string; txnId: string }>();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { data: project } = useProject(projectId);
  const { members } = useOrgMembers(project?.orgId);
  const { data, loading } = useTransactions(projectId);

  const txn = useMemo(() => data.find((tx) => tx.id === txnId), [data, txnId]);
  const { data: parties } = useParties(project?.orgId);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settlementPreviewOpen, setSettlementPreviewOpen] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [clearedToParty, setClearedToParty] = useState(false);
  const [hydratedClearedToParty, setHydratedClearedToParty] = useState(false);
  const [payeeLabel, setPayeeLabel] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);
  const [markClearedNow, setMarkClearedNow] = useState(false);
  const [stagedSettlementReceipt, setStagedSettlementReceipt] =
    useState<StagedFile | null>(null);
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
    const tt = data.find((x) => x.id === txnId);
    if (!user || !tt) return;
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
                  refId: tt.projectId,
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

              await approveTransaction(tt.id, user.uid, {
                clearedToParty,
                payeeLabel: payeeLabel.trim() || undefined,
                note: settlementNote.trim() || undefined,
                markCleared: markClearedNow,
                settlementPhotoUrl,
                settlementPhotoStoragePath,
              });

              if (settlementPhotoStoragePath) {
                void recordStorageEvent({
                  projectId: tt.projectId,
                  kind: 'transaction',
                  refId: tt.id,
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
    const tt = data.find((x) => x.id === txnId);
    if (!user || !tt) return;
    setActionLoading(true);
    try {
      let settlementPhotoUrl: string | undefined;
      let settlementPhotoStoragePath: string | undefined;
      let uploadedSize = 0;
      let uploadedContentType = '';
      if (clearStagedReceipt) {
        const { uploaded, failed } = await commitStagedFiles({
          files: [clearStagedReceipt],
          kind: 'transaction',
          refId: tt.projectId,
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

      await clearTransactionSettlement(tt.id, {
        clearedBy: user.uid,
        settlementPhotoUrl,
        settlementPhotoStoragePath,
        note: clearNote.trim() || undefined,
        payeeLabel: clearPayeeLabel.trim() || undefined,
        clearedToParty: clearToParty,
      });

      if (settlementPhotoStoragePath) {
        void recordStorageEvent({
          projectId: tt.projectId,
          kind: 'transaction',
          refId: tt.id,
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
    const tt = data.find((x) => x.id === txnId);
    if (!user || !tt) return;
    setActionLoading(true);
    try {
      await rejectTransaction(tt.id, user.uid, rejectNote.trim() || 'Rejected');
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
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }

  if (!txn) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <Header onBack={() => router.back()} title="Transaction" />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Transaction not found.</Text>
        </View>
      </View>
    );
  }

  const wf = txn.workflowStatus ?? 'posted';
  const txnType = normalizeTransactionType(txn.type);
  const isIn = txnType === 'payment_in';
  const wasSubmitted = !!txn.submittedAt;
  const showSettlementCard = wf === 'posted' && (wasSubmitted || !!txn.settlement);
  const pmMeta = txn.paymentMethod
    ? PAYMENT_METHODS.find((m) => m.key === txn.paymentMethod)
    : null;
  const addedByOwner = !!project?.ownerId && txn.createdBy === project.ownerId;
  const addedBySelf = !!user?.uid && txn.createdBy === user.uid;
  const addedByLabel = addedByOwner ? 'Owner' : addedBySelf ? 'You' : 'Team member';

  const canEditTxn =
    wf !== 'rejected'
    && (can('transaction.write')
      || (wf === 'pending_approval'
        && !!user?.uid
        && txn.createdBy === user.uid
        && can('transaction.submit')));
  const canApproveTxn = wf === 'pending_approval' && can('transaction.approve');

  // Workflow tone — 90/10: only the action-required states earn colour.
  // "POSTED" (the happy default) reads in neutral; the shield icon already
  // indicates approval.
  const workflowTone =
    wf === 'pending_approval'
      ? { fg: t.palette.orange.base, bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft, label: 'PENDING APPROVAL', icon: 'time-outline' as const }
      : wf === 'rejected'
        ? { fg: t.palette.red.base, bg: t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft, label: 'REJECTED', icon: 'close-circle-outline' as const }
        : { fg: t.colors.secondary, bg: t.colors.fill3, label: 'POSTED', icon: 'shield-checkmark-outline' as const };

  let workflowSub = `Added by ${addedByLabel}`;
  if (wf === 'pending_approval') {
    workflowSub = 'Waiting for Admin / Super Admin. Totals exclude this entry until approved.';
  } else if (wf === 'rejected') {
    workflowSub = txn.rejectionNote?.trim() || 'This expense was not approved.';
  } else if (txn.approvedBy) {
    workflowSub = `Approved by ${uidLabel(txn.approvedBy)}${
      txn.approvedAt ? ` · ${formatDate(txn.approvedAt.toDate())}` : ''
    }`;
  }

  // Status pill — 90/10: "Paid" is the default-good state and reads in
  // neutral. "Pending" earns orange (action needed). "Partial" earns red
  // because the studio is still owed money.
  const statusTone =
    txn.status === 'pending'
      ? { fg: t.palette.orange.base, bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft, label: 'Pending' }
      : txn.status === 'partial'
        ? { fg: t.palette.red.base, bg: t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft, label: 'Partial' }
        : { fg: t.colors.secondary, bg: t.colors.fill3, label: 'Paid' };

  // Hero amount picks up the same directional colour as the row amount
  // in the Transaction tab — green for money in, red for money out.
  // The amount is the screen's headline signal, so it earns the colour.
  const heroAmountColor = isIn ? t.palette.green.base : t.palette.red.base;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <Header
        onBack={() => router.back()}
        title="Transaction"
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <CircleBtn
              icon="document-text-outline"
              onPress={handleGenerateReceipt}
              disabled={generatingReceipt}
              tint={t.palette.blue.base}
              loading={generatingReceipt}
            />
            {canEditTxn ? (
              <CircleBtn
                icon="create-outline"
                onPress={() =>
                  router.push(
                    `/(app)/projects/${projectId}/edit-transaction?txnId=${txn.id}` as never,
                  )
                }
                tint={t.palette.blue.base}
              />
            ) : null}
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero amount card */}
        <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: t.colors.surface,
                borderRadius: t.radii.hero,
                borderColor: t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                borderWidth: t.hairline,
              },
            ]}
          >
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5 }}
            >
              {isIn ? 'PAYMENT IN' : 'PAYMENT OUT'}
            </Text>
            <Text
              variant="hero"
              style={{
                color: heroAmountColor,
                fontWeight: '700',
                marginTop: 4,
                fontVariant: ['tabular-nums'],
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {isIn ? '+' : '−'}{formatInr(txn.amount)}
            </Text>
            {txn.description ? (
              <Text
                variant="footnote"
                color="secondary"
                style={{ marginTop: 6 }}
                numberOfLines={2}
              >
                {txn.description}
              </Text>
            ) : null}
            <View style={styles.pillRow}>
              <Pill tone={statusTone.fg} bg={statusTone.bg} label={statusTone.label} />
              {txn.paymentMethod ? (
                <Pill
                  tone={t.colors.secondary}
                  bg={t.colors.fill3}
                  label={getPaymentMethodLabel(txn.paymentMethod)}
                />
              ) : null}
            </View>
          </View>
        </View>

        {/* Workflow ribbon */}
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <View
            style={[
              styles.workflowCard,
              {
                backgroundColor: workflowTone.bg,
                borderRadius: t.radii.card,
                borderColor: workflowTone.fg + '33',
                borderWidth: t.hairline,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name={workflowTone.icon} size={14} color={workflowTone.fg} />
              <Text
                variant="caption2"
                style={{
                  color: workflowTone.fg,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                  marginLeft: 6,
                }}
              >
                {workflowTone.label}
              </Text>
            </View>
            <Text variant="caption1" color="secondary" style={{ marginTop: 4, lineHeight: 17 }}>
              {workflowSub}
            </Text>
          </View>
        </View>

        {/* Approval panel */}
        {canApproveTxn ? (
          <ApprovePanel
            clearedToParty={clearedToParty}
            setClearedToParty={setClearedToParty}
            payeeLabel={payeeLabel}
            setPayeeLabel={setPayeeLabel}
            settlementNote={settlementNote}
            setSettlementNote={setSettlementNote}
            markClearedNow={markClearedNow}
            setMarkClearedNow={(v) => {
              setMarkClearedNow(v);
              if (!v) setStagedSettlementReceipt(null);
            }}
            stagedReceipt={stagedSettlementReceipt}
            setStagedReceipt={setStagedSettlementReceipt}
            pickReceipt={(src) => pickSettlementReceipt(src, setStagedSettlementReceipt)}
            actionLoading={actionLoading}
            onReject={() => setShowRejectModal(true)}
            onApprove={handleApprove}
          />
        ) : null}

        {/* Settlement card */}
        {showSettlementCard ? (
          <SettlementGroup
            cleared={isTransactionCleared(txn)}
            submissionKind={txn.submissionKind}
            settlement={txn.settlement}
            partyName={txn.partyName}
            createdByLabel={uidLabel(txn.createdBy)}
            uidLabel={uidLabel}
            onPhotoTap={() => setSettlementPreviewOpen(true)}
            onMarkCleared={openClearSheet}
            canMarkCleared={!isTransactionCleared(txn) && can('transaction.approve')}
          />
        ) : null}

        {/* Details */}
        <FormGroup header="Details">
          <Row label="Party" value={txn.partyName || '—'} />
          <Row
            label="Date"
            value={txn.date ? formatDate(txn.date.toDate()) : '—'}
            divider={!!txn.description || !!txn.referenceNumber}
          />
          {txn.description ? (
            <Row
              label="Description"
              value={txn.description}
              divider={!!txn.referenceNumber}
            />
          ) : null}
          {txn.referenceNumber ? (
            <Row
              label="Reference"
              value={txn.referenceNumber}
              divider={false}
            />
          ) : null}
        </FormGroup>

        {/* Category + Method */}
        {txn.category || txn.paymentMethod ? (
          <FormGroup header="Classification">
            {txn.category ? (
              <Row
                label="Cost code"
                value={getCategoryLabel(txn.category)}
                divider={!!txn.paymentMethod}
              />
            ) : null}
            {txn.paymentMethod ? (
              <Row
                label="Payment method"
                value={getPaymentMethodLabel(txn.paymentMethod)}
                divider={false}
              />
            ) : null}
          </FormGroup>
        ) : null}

        {/* Bill / Receipt */}
        {txn.photoUrl ? (
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              BILL / RECEIPT
            </Text>
            <Pressable
              onPress={() => setPreviewOpen(true)}
              style={({ pressed }) => [
                styles.photoWrap,
                {
                  backgroundColor: t.colors.surface,
                  borderRadius: t.radii.card,
                  borderColor: t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityLabel="Open receipt full-screen"
            >
              <Image
                source={{ uri: txn.photoUrl }}
                style={styles.photo}
                resizeMode="cover"
              />
              <View style={styles.photoExpandHint}>
                <Ionicons name="expand-outline" size={13} color="#fff" />
              </View>
            </Pressable>
          </View>
        ) : null}

        {/* Share Receipt CTA */}
        {wf === 'posted' ? (
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <Pressable
              onPress={handleGenerateReceipt}
              disabled={generatingReceipt}
              style={({ pressed }) => [
                styles.shareCta,
                {
                  backgroundColor: t.palette.blue.base,
                  borderRadius: t.radii.field,
                  shadowColor: t.palette.blue.base,
                  shadowOpacity: 0.25,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 5,
                },
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
              <Text
                variant="footnote"
                style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}
              >
                {generatingReceipt
                  ? 'Generating receipt…'
                  : `Share ${isIn ? 'Payment' : 'Payment Out'} Receipt`}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Reject sheet */}
      <RejectSheet
        open={showRejectModal}
        note={rejectNote}
        onChangeNote={setRejectNote}
        loading={actionLoading}
        onClose={() => setShowRejectModal(false)}
        onConfirm={handleRejectConfirm}
      />

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

      {/* Mark-as-Cleared sheet */}
      <ClearSheet
        open={clearSheetOpen}
        onClose={() => setClearSheetOpen(false)}
        clearStagedReceipt={clearStagedReceipt}
        setClearStagedReceipt={setClearStagedReceipt}
        clearToParty={clearToParty}
        setClearToParty={setClearToParty}
        clearPayeeLabel={clearPayeeLabel}
        setClearPayeeLabel={setClearPayeeLabel}
        clearNote={clearNote}
        setClearNote={setClearNote}
        actionLoading={actionLoading}
        onConfirm={handleClearSettlement}
        pickReceipt={(src) => pickSettlementReceipt(src, setClearStagedReceipt)}
      />
    </View>
  );
}

// ── Header ─────────────────────────────────────────────────────────────

function Header({
  onBack,
  title,
  right,
}: {
  onBack: () => void;
  title: string;
  right?: React.ReactNode;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          borderBottomColor: t.colors.separator,
          borderBottomWidth: t.hairline,
        },
      ]}
    >
      <CircleBtn
        icon="chevron-back"
        onPress={onBack}
        tint={t.colors.label}
      />
      <Text
        variant="headline"
        color="label"
        style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
        numberOfLines={1}
      >
        {title}
      </Text>
      {right ?? <View style={{ width: 32 }} />}
    </View>
  );
}

function CircleBtn({
  icon,
  onPress,
  disabled,
  tint,
  loading,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  tint: string;
  loading?: boolean;
}) {
  const t = useThemeV2();
  // Soft-fill chip pattern — matches the project detail header and the
  // overview screen. Action-tinted icons (blue) ride a soft-blue fill;
  // neutral icons (back, label-coloured) ride the standard grey fill.
  const isBlueAction = tint === t.palette.blue.base;
  const bg = isBlueAction
    ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
    : t.colors.fill3;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={10}
      style={({ pressed }) => [
        styles.circleBtn,
        {
          backgroundColor: bg,
          borderRadius: 999,
        },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Ionicons name={icon} size={16} color={tint} />
      )}
    </Pressable>
  );
}

function Pill({
  tone,
  bg,
  label,
}: {
  tone: string;
  bg: string;
  label: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: tone,
          marginRight: 5,
        }}
      />
      <Text
        variant="caption2"
        style={{ color: tone, fontWeight: '700', letterSpacing: 0.3 }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Approve panel ──────────────────────────────────────────────────────

function ApprovePanel({
  clearedToParty,
  setClearedToParty,
  payeeLabel,
  setPayeeLabel,
  settlementNote,
  setSettlementNote,
  markClearedNow,
  setMarkClearedNow,
  stagedReceipt,
  setStagedReceipt,
  pickReceipt,
  actionLoading,
  onReject,
  onApprove,
}: {
  clearedToParty: boolean;
  setClearedToParty: (v: boolean) => void;
  payeeLabel: string;
  setPayeeLabel: (v: string) => void;
  settlementNote: string;
  setSettlementNote: (v: string) => void;
  markClearedNow: boolean;
  setMarkClearedNow: (v: boolean) => void;
  stagedReceipt: StagedFile | null;
  setStagedReceipt: (f: StagedFile | null) => void;
  pickReceipt: (src: 'camera' | 'library') => void;
  actionLoading: boolean;
  onReject: () => void;
  onApprove: () => void;
}) {
  const t = useThemeV2();
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
      <Text
        variant="caption2"
        color="secondary"
        style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
      >
        SETTLEMENT (ON APPROVE)
      </Text>
      <View
        style={[
          styles.approveCard,
          {
            backgroundColor: t.colors.surface,
            borderRadius: t.radii.card,
            borderColor:
              t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            borderWidth: t.hairline,
          },
        ]}
      >
        <View style={styles.switchRow}>
          <Text variant="callout" color="label">
            Payment cleared to party
          </Text>
          <Switch value={clearedToParty} onValueChange={setClearedToParty} />
        </View>

        <Text
          variant="caption2"
          color="tertiary"
          style={{ letterSpacing: 0.5, marginTop: 12 }}
        >
          PAYEE LABEL (OPTIONAL)
        </Text>
        <TextInput
          value={payeeLabel}
          onChangeText={setPayeeLabel}
          placeholder="Who was paid?"
          placeholderTextColor={t.colors.tertiary}
          style={[
            styles.textInput,
            {
              backgroundColor: t.colors.fill3,
              borderRadius: t.radii.field,
              color: t.colors.label,
            },
          ]}
        />

        <Text
          variant="caption2"
          color="tertiary"
          style={{ letterSpacing: 0.5, marginTop: 12 }}
        >
          NOTE (OPTIONAL)
        </Text>
        <TextInput
          value={settlementNote}
          onChangeText={setSettlementNote}
          placeholder="Settlement note"
          placeholderTextColor={t.colors.tertiary}
          style={[
            styles.textInput,
            {
              backgroundColor: t.colors.fill3,
              borderRadius: t.radii.field,
              color: t.colors.label,
              minHeight: 60,
              textAlignVertical: 'top',
            },
          ]}
          multiline
        />

        <View style={[styles.switchRow, { marginTop: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text variant="callout" color="label">Mark cleared now</Text>
            <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
              Optionally attach a payment receipt — supervisor gets a "cleared" notification either way.
            </Text>
          </View>
          <Switch value={markClearedNow} onValueChange={setMarkClearedNow} />
        </View>

        {markClearedNow ? (
          <View style={{ marginTop: 10 }}>
            {stagedReceipt ? (
              <View style={styles.stagedReceiptBox}>
                <Image
                  source={{ uri: stagedReceipt.localUri }}
                  style={[styles.stagedReceiptImg, { borderRadius: t.radii.field }]}
                />
                <Pressable
                  onPress={() => setStagedReceipt(null)}
                  hitSlop={6}
                  style={[
                    styles.stagedReceiptClear,
                    { backgroundColor: 'rgba(255,255,255,0.92)' },
                  ]}
                >
                  <Ionicons name="close-circle" size={20} color={t.palette.red.base} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.receiptPickRow}>
                <ReceiptPickBtn
                  icon="camera-outline"
                  label="Camera"
                  onPress={() => pickReceipt('camera')}
                />
                <ReceiptPickBtn
                  icon="image-outline"
                  label="Gallery"
                  onPress={() => pickReceipt('library')}
                />
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={onReject}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                borderRadius: t.radii.field,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text variant="footnote" style={{ color: t.palette.red.base, fontWeight: '700' }}>
              Reject
            </Text>
          </Pressable>
          <Pressable
            onPress={onApprove}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.actionBtn,
              {
                backgroundColor: t.palette.blue.base,
                borderRadius: t.radii.field,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text variant="footnote" style={{ color: '#fff', fontWeight: '700' }}>
                {markClearedNow ? 'Approve & Clear' : 'Approve'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ReceiptPickBtn({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.receiptPickBtn,
        {
          backgroundColor:
            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
          borderRadius: t.radii.field,
          borderColor: t.palette.blue.base + '33',
          borderWidth: t.hairline,
          borderStyle: 'dashed',
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons name={icon} size={16} color={t.palette.blue.base} />
      <Text
        variant="footnote"
        style={{ color: t.palette.blue.base, fontWeight: '700', marginLeft: 6 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Settlement group ───────────────────────────────────────────────────

function SettlementGroup({
  cleared,
  submissionKind,
  settlement,
  partyName,
  createdByLabel,
  uidLabel,
  onPhotoTap,
  onMarkCleared,
  canMarkCleared,
}: {
  cleared: boolean;
  submissionKind?: 'expense_reimbursement' | 'party_payment';
  settlement?: {
    clearedToParty: boolean;
    payeeLabel?: string;
    note?: string;
    clearedAt?: { toDate: () => Date } | null;
    clearedBy?: string;
    settlementPhotoUrl?: string;
  } | null;
  partyName?: string;
  createdByLabel: string;
  uidLabel: (uid?: string) => string;
  onPhotoTap: () => void;
  onMarkCleared: () => void;
  canMarkCleared: boolean;
}) {
  const t = useThemeV2();
  return (
    <View style={{ marginTop: 22 }}>
      <View style={styles.settlementHeaderRow}>
        <Text
          variant="caption2"
          color="secondary"
          style={{ letterSpacing: 0.5 }}
        >
          SETTLEMENT
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            // 90/10: only the "still uncleared" state earns colour (orange,
            // pending). Cleared payments read in neutral.
            backgroundColor: cleared
              ? t.colors.fill3
              : (t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft),
          }}
        >
          <Ionicons
            name={cleared ? 'checkmark-circle' : 'time-outline'}
            size={11}
            color={cleared ? t.colors.secondary : t.palette.orange.base}
          />
          <Text
            variant="caption2"
            style={{
              color: cleared ? t.colors.secondary : t.palette.orange.base,
              fontWeight: '700',
              letterSpacing: 0.4,
              marginLeft: 4,
            }}
          >
            {cleared ? 'CLEARED' : 'AWAITING'}
          </Text>
        </View>
      </View>

      <FormGroup>
        {submissionKind ? (
          <Row
            label="Type"
            value={
              submissionKind === 'expense_reimbursement'
                ? `Reimburse ${createdByLabel}`
                : `Payment to ${partyName || 'party'}`
            }
            divider={!!settlement}
          />
        ) : null}
        {settlement ? (
          <>
            <Row
              label="To party"
              value={settlement.clearedToParty ? 'Yes' : 'No'}
              divider={
                !!settlement.payeeLabel
                || !!settlement.note
                || !!settlement.clearedAt
                || !!settlement.clearedBy
              }
            />
            {settlement.payeeLabel ? (
              <Row
                label="Payee"
                value={settlement.payeeLabel}
                divider={!!settlement.note || !!settlement.clearedAt || !!settlement.clearedBy}
              />
            ) : null}
            {settlement.note ? (
              <Row
                label="Note"
                value={settlement.note}
                divider={!!settlement.clearedAt || !!settlement.clearedBy}
              />
            ) : null}
            {settlement.clearedAt ? (
              <Row
                label="Cleared on"
                value={formatDate(settlement.clearedAt.toDate())}
                divider={!!settlement.clearedBy}
              />
            ) : null}
            {settlement.clearedBy ? (
              <Row
                label="Cleared by"
                value={uidLabel(settlement.clearedBy)}
                divider={false}
              />
            ) : null}
          </>
        ) : (
          <Row
            label="Status"
            value="Approved without settlement details"
            divider={false}
          />
        )}
      </FormGroup>

      {settlement?.settlementPhotoUrl ? (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <Pressable
            onPress={onPhotoTap}
            style={({ pressed }) => [
              styles.photoWrap,
              {
                backgroundColor: t.colors.surface,
                borderRadius: t.radii.card,
                borderColor: t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                borderWidth: t.hairline,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Image
              source={{ uri: settlement.settlementPhotoUrl }}
              style={styles.photo}
              resizeMode="cover"
            />
            <View style={styles.photoExpandHint}>
              <Ionicons name="expand-outline" size={13} color="#fff" />
            </View>
          </Pressable>
        </View>
      ) : null}

      {canMarkCleared ? (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <Pressable
            onPress={onMarkCleared}
            style={({ pressed }) => [
              styles.markClearedBtn,
              {
                backgroundColor: t.palette.blue.base,
                borderRadius: t.radii.field,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
            <Text
              variant="footnote"
              style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}
            >
              Mark as Cleared
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ── Reject sheet ────────────────────────────────────────────────────────

function RejectSheet({
  open,
  note,
  onChangeNote,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  note: string;
  onChangeNote: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />
          <Text
            variant="headline"
            color="label"
            style={{ paddingHorizontal: 16, fontWeight: '700' }}
          >
            Reject expense
          </Text>
          <TextInput
            value={note}
            onChangeText={onChangeNote}
            placeholder="Reason (optional)"
            placeholderTextColor={t.colors.tertiary}
            style={[
              styles.rejectInput,
              {
                backgroundColor: t.colors.fill3,
                borderRadius: t.radii.field,
                color: t.colors.label,
                minHeight: 80,
                textAlignVertical: 'top',
              },
            ]}
            multiline
          />
          <View style={[styles.actionRow, { paddingHorizontal: 16, marginTop: 14 }]}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text variant="footnote" color="secondary" style={{ fontWeight: '700' }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={loading}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: t.palette.red.base,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text variant="footnote" style={{ color: '#fff', fontWeight: '700' }}>
                  Reject
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Mark as cleared sheet ──────────────────────────────────────────────

function ClearSheet({
  open,
  onClose,
  clearStagedReceipt,
  setClearStagedReceipt,
  clearToParty,
  setClearToParty,
  clearPayeeLabel,
  setClearPayeeLabel,
  clearNote,
  setClearNote,
  actionLoading,
  onConfirm,
  pickReceipt,
}: {
  open: boolean;
  onClose: () => void;
  clearStagedReceipt: StagedFile | null;
  setClearStagedReceipt: (f: StagedFile | null) => void;
  clearToParty: boolean;
  setClearToParty: (v: boolean) => void;
  clearPayeeLabel: string;
  setClearPayeeLabel: (v: string) => void;
  clearNote: string;
  setClearNote: (v: string) => void;
  actionLoading: boolean;
  onConfirm: () => void;
  pickReceipt: (src: 'camera' | 'library') => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 16,
              maxHeight: '85%',
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
            <Text
              variant="headline"
              color="label"
              style={{ flex: 1, fontWeight: '600' }}
            >
              Mark as Cleared
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={t.colors.secondary} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text variant="caption1" color="secondary">
              Attach a payment receipt (optional). Supervisor gets a "cleared"
              notification either way.
            </Text>

            {clearStagedReceipt ? (
              <View style={styles.stagedReceiptBox}>
                <Image
                  source={{ uri: clearStagedReceipt.localUri }}
                  style={[styles.stagedReceiptImg, { borderRadius: t.radii.field }]}
                />
                <Pressable
                  onPress={() => setClearStagedReceipt(null)}
                  hitSlop={6}
                  style={[
                    styles.stagedReceiptClear,
                    { backgroundColor: 'rgba(255,255,255,0.92)' },
                  ]}
                >
                  <Ionicons name="close-circle" size={20} color={t.palette.red.base} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.receiptPickRow}>
                <ReceiptPickBtn
                  icon="camera-outline"
                  label="Camera"
                  onPress={() => pickReceipt('camera')}
                />
                <ReceiptPickBtn
                  icon="image-outline"
                  label="Gallery"
                  onPress={() => pickReceipt('library')}
                />
              </View>
            )}

            <View style={styles.switchRow}>
              <Text variant="callout" color="label">Cleared to party</Text>
              <Switch value={clearToParty} onValueChange={setClearToParty} />
            </View>

            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5, marginTop: 4 }}
            >
              PAYEE LABEL (OPTIONAL)
            </Text>
            <TextInput
              value={clearPayeeLabel}
              onChangeText={setClearPayeeLabel}
              placeholder="Who was paid?"
              placeholderTextColor={t.colors.tertiary}
              style={[
                styles.textInput,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                  color: t.colors.label,
                  marginTop: 0,
                },
              ]}
            />

            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5, marginTop: 4 }}
            >
              NOTE (OPTIONAL)
            </Text>
            <TextInput
              value={clearNote}
              onChangeText={setClearNote}
              placeholder="UPI ref, bank txn id, etc."
              placeholderTextColor={t.colors.tertiary}
              style={[
                styles.textInput,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                  color: t.colors.label,
                  minHeight: 60,
                  textAlignVertical: 'top',
                  marginTop: 0,
                },
              ]}
              multiline
            />

            <View style={[styles.actionRow, { marginTop: 12 }]}>
              <Pressable
                onPress={onClose}
                disabled={actionLoading}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: t.colors.fill3,
                    borderRadius: t.radii.field,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text variant="footnote" color="secondary" style={{ fontWeight: '700' }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                disabled={actionLoading}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: t.palette.blue.base,
                    borderRadius: t.radii.field,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text variant="footnote" style={{ color: '#fff', fontWeight: '700' }}>
                    Mark Cleared
                  </Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  circleBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {},

  // Hero card
  heroCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },

  // Workflow ribbon
  workflowCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Approve card
  approveCard: {
    padding: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },

  // Settlement
  settlementHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 8,
  },

  // Photo
  photoWrap: {
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 220,
  },
  photoExpandHint: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Share CTA
  shareCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },

  // Mark as cleared CTA
  markClearedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },

  // Bottom sheet
  bottomSheet: {
    paddingTop: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },

  // Receipt picker
  receiptPickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  receiptPickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  stagedReceiptBox: {
    position: 'relative',
  },
  stagedReceiptImg: {
    width: '100%',
    height: 180,
  },
  stagedReceiptClear: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: 12,
  },

  // Reject input
  rejectInput: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
});
