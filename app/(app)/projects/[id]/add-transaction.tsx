/**
 * Add Transaction — Payment In / Payment Out — v2 design.
 *
 * Receives `type` from query params. Party picker shows project parties first,
 * then all org parties. Users can add a new party from contacts inline.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "Payment In/Out" · Save
 *   2. Amount hero card — colored sign + big tabular amount + date pill
 *   3. Submission-kind picker (only when submit-only role is filing payment_out)
 *   4. FormGroup "Party" — picker row that opens the party sheet
 *   5. FormGroup "Details" — Description · Reference (InputRows)
 *   6. FormGroup "Payment" — method pill row · cost code (SelectSheet)
 *   7. Collapsible "More" with status pill row
 *   8. Receipt staged-photo card (pure local preview)
 *   9. Footer with camera + gallery + Save button
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as Contacts from 'expo-contacts';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { guessImageMimeType, recordStorageEvent } from '@/src/lib/r2Upload';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';
import { auth, db } from '@/src/lib/firebase';

import { useAuth } from '@/src/features/auth/useAuth';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { consumeNewPartyOutbox } from '@/src/features/parties/newPartyOutbox';
import { normalizeIndianPhoneE164 } from '@/src/lib/phone';
import {
  getPartyTypeLabel,
  type Party,
} from '@/src/features/parties/types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { createTransaction } from '@/src/features/transactions/transactions';
import {
  TRANSACTION_CATEGORIES,
  PAYMENT_METHODS,
  type TransactionCategory,
  type PaymentMethod,
  type TransactionSubmissionKind,
} from '@/src/features/transactions/types';
import { formatDate } from '@/src/lib/format';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { useThemeV2 } from '@/src/theme/v2';

// ── Schema ──

const schema = z.object({
  type: z.enum(['payment_in', 'payment_out']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount'),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  partyName: z.string().trim().min(1, 'Select or enter party'),
  partyId: z.string().optional(),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  referenceNumber: z.string().optional(),
  status: z.enum(['paid', 'pending', 'partial']),
  date: z.date(),
});

type FormData = z.infer<typeof schema>;

// ── Diagnostics (preserved from v1) ──
type AddTxnFailureContext = {
  err: { code?: string; message?: string };
  projectId: string;
  orgId: string;
  createdByPassed: string;
  authUid: string | null;
  primaryOrgId: string | null;
  roleFromHook: string | null;
  workflowStatus: 'posted' | 'pending_approval';
};

async function logAddTxnFailure(ctx: AddTxnFailureContext): Promise<string> {
  let orgDocSnapshot: {
    exists: boolean;
    ownerId?: string;
    isInMemberIds?: boolean;
    rolesMapEntry?: string | null;
    memberCount?: number;
  } = { exists: false };
  try {
    const snap = await db.collection('organizations').doc(ctx.orgId).get();
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown> | undefined;
      const memberIds = Array.isArray(data?.memberIds)
        ? (data!.memberIds as string[])
        : [];
      const roles = (data?.roles ?? {}) as Record<string, string>;
      orgDocSnapshot = {
        exists: true,
        ownerId: data?.ownerId as string | undefined,
        isInMemberIds: memberIds.includes(ctx.createdByPassed),
        rolesMapEntry: roles[ctx.createdByPassed] ?? null,
        memberCount: memberIds.length,
      };
    }
  } catch {
    /* swallow — best-effort */
  }
  return formatDiagnostic({
    err: ctx.err,
    projectId: ctx.projectId,
    orgId: ctx.orgId,
    createdByPassed: ctx.createdByPassed,
    authUid: ctx.authUid,
    primaryOrgId: ctx.primaryOrgId,
    roleFromHook: ctx.roleFromHook,
    workflowStatus: ctx.workflowStatus,
    orgDoc: orgDocSnapshot,
  });
}

function formatDiagnostic(p: {
  err: { code?: string; message?: string };
  projectId: string;
  orgId: string;
  createdByPassed: string;
  authUid: string | null;
  primaryOrgId: string | null;
  roleFromHook: string | null;
  workflowStatus: string;
  orgDoc: {
    exists: boolean;
    ownerId?: string;
    isInMemberIds?: boolean;
    rolesMapEntry?: string | null;
    memberCount?: number;
  };
}): string {
  return JSON.stringify(p);
}

// ── Component ──

export default function AddTransactionScreen() {
  useGuardedRoute({ anyOf: ['transaction.write', 'transaction.submit'] });

  const t = useThemeV2();
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const projectId = params.id;

  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { can, role, loading: permLoading } = usePermissions();
  const postsTxnDirectly = can('transaction.write');
  const mayAddTxn = postsTxnDirectly || can('transaction.submit');

  const initialType: 'payment_in' | 'payment_out' =
    params.type === 'payment_in' ? 'payment_in' : 'payment_out';
  const { data: allParties } = useParties(orgId || undefined);
  const { data: transactions } = useTransactions(projectId);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMoreDetail, setShowMoreDetail] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [stagedReceipt, setStagedReceipt] = useState<StagedFile | null>(null);
  const [savePhase, setSavePhase] = useState<string>();
  const [submissionKind, setSubmissionKind] =
    useState<TransactionSubmissionKind>('expense_reimbursement');

  useEffect(() => {
    if (permLoading || !user) return;
    if (!mayAddTxn) {
      Alert.alert('No access', 'You cannot add transactions for this studio.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }, [permLoading, mayAddTxn, user]);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: initialType,
      amount: '',
      description: '',
      partyName: '',
      partyId: '',
      category: '',
      paymentMethod: '',
      referenceNumber: '',
      status: 'paid',
      date: new Date(),
    },
    mode: 'onChange',
  });

  const selectedType = watch('type');
  const selectedDate = watch('date');
  const selectedPartyName = watch('partyName');
  const selectedCategory = watch('category');
  const selectedPaymentMethod = watch('paymentMethod');
  const selectedStatus = watch('status');

  const isPaymentIn = selectedType === 'payment_in';
  const navTitle = isPaymentIn ? 'Payment In' : 'Payment Out';

  useEffect(() => {
    if (permLoading) return;
    if (!postsTxnDirectly && selectedType === 'payment_in') {
      setValue('type', 'payment_out');
    }
  }, [permLoading, postsTxnDirectly, selectedType, setValue]);

  const categoryLabel = TRANSACTION_CATEGORIES.find((c) => c.key === selectedCategory)?.label;
  const categoryOptions = useMemo(
    () => TRANSACTION_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
    [],
  );

  // ── Handlers ──

  // After a successful new-party creation (or duplicate match) in the
  // add-party form, drain the outbox and auto-select the resulting
  // party. `useFocusEffect` guarantees we read it exactly once — the
  // first time this screen regains focus after `router.back()`.
  useFocusEffect(
    useCallback(() => {
      const next = consumeNewPartyOutbox();
      if (!next) return;
      setValue('partyName', next.name, { shouldValidate: true });
      setValue('partyId', next.id);
    }, [setValue]),
  );

  async function pickReceipt(source: 'camera' | 'library') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        source === 'camera'
          ? 'Allow camera access to capture a receipt.'
          : 'Allow photo library access to attach a receipt.',
      );
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setStagedReceipt({
      id: 'receipt',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
  }

  function clearReceipt() {
    setStagedReceipt(null);
  }

  async function onSubmit(data: FormData) {
    if (!user) {
      setSubmitError('Not signed in. Please sign in again.');
      return;
    }
    if (!projectId) {
      setSubmitError('Project not loaded. Please reopen the project.');
      return;
    }
    if (!orgId) {
      setSubmitError('Studio not loaded yet — try again in a moment.');
      return;
    }
    setSubmitError(undefined);
    try {
      let receiptUrl: string | undefined;
      let receiptKey: string | undefined;
      let receiptSize = 0;
      let receiptContentType = '';
      if (stagedReceipt) {
        setSavePhase('Uploading receipt…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [stagedReceipt],
          kind: 'transaction',
          refId: projectId,
          compress: 'balanced',
        });
        if (failed.length > 0) {
          setSubmitError(`Receipt upload failed: ${failed[0].error}`);
          setSavePhase(undefined);
          return;
        }
        receiptUrl = uploaded[0].publicUrl;
        receiptKey = uploaded[0].key;
        receiptSize = uploaded[0].sizeBytes;
        receiptContentType = uploaded[0].contentType;
      }

      setSavePhase('Saving transaction…');
      const workflowStatus = postsTxnDirectly ? 'posted' : 'pending_approval';
      let txnId: string;
      try {
        txnId = await createTransaction({
          projectId,
          orgId,
          type: data.type,
          amount: parseFloat(data.amount),
          description: data.description || '',
          partyId: data.partyId || undefined,
          partyName: data.partyName,
          category: (data.category as TransactionCategory) || undefined,
          paymentMethod: (data.paymentMethod as PaymentMethod) || undefined,
          referenceNumber: data.referenceNumber || undefined,
          status: data.status,
          date: data.date,
          createdBy: user.uid,
          photoUrl: receiptUrl,
          photoStoragePath: receiptKey,
          workflowStatus,
          submissionKind:
            !postsTxnDirectly && data.type === 'payment_out' ? submissionKind : undefined,
        });
      } catch (err) {
        const e = err as { code?: string; message?: string };
        const diag = await logAddTxnFailure({
          err: e,
          projectId,
          orgId,
          createdByPassed: user.uid,
          authUid: auth.currentUser?.uid ?? null,
          primaryOrgId: userDoc?.primaryOrgId ?? null,
          roleFromHook: role,
          workflowStatus,
        });
        const friendlyHead =
          e.code === 'permission-denied'
            ? "Couldn't save — you don't have permission for this studio."
            : e.message ?? 'Could not save the transaction.';
        setSubmitError(`${friendlyHead}\n\nDiagnostic: ${diag}`);
        setSavePhase(undefined);
        return;
      }

      if (receiptKey) {
        void recordStorageEvent({
          projectId,
          kind: 'transaction',
          refId: txnId,
          key: receiptKey,
          sizeBytes: receiptSize,
          contentType: receiptContentType,
          action: 'upload',
        });
      }
      await new Promise((r) => setTimeout(r, 150));
      router.replace(`/(app)/projects/${projectId}/transaction/${txnId}` as never);
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  // ── Render ──

  const heroAmountColor = isPaymentIn ? t.palette.green.base : t.palette.red.base;
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title={navTitle}
        cancelLabel="Cancel"
        saveLabel={postsTxnDirectly ? 'Save' : 'Submit'}
        saveLoading={isSubmitting}
        saveDisabled={!isValid || !orgId}
        onCancel={() => router.back()}
        onSave={() => void handleSubmit(onSubmit)()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero amount card */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.hero,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                AMOUNT · INR
              </Text>
              <View style={styles.heroAmountRow}>
                <Text
                  variant="title1"
                  style={{
                    color: heroAmountColor,
                    fontWeight: '700',
                  }}
                >
                  {isPaymentIn ? '+ ₹' : '− ₹'}
                </Text>
                <Controller
                  control={control}
                  name="amount"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      value={value}
                      onChangeText={(txt) => onChange(txt.replace(/[^\d.]/g, ''))}
                      onBlur={onBlur}
                      placeholder="0"
                      keyboardType="decimal-pad"
                      style={[
                        styles.heroAmountInput,
                        {
                          color: heroAmountColor,
                          ...t.type.title1,
                          fontWeight: '700',
                        },
                      ]}
                      placeholderTextColor={t.colors.tertiary}
                    />
                  )}
                />
              </View>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.dateChip,
                  {
                    backgroundColor: t.colors.fill3,
                    borderRadius: 999,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="calendar-outline" size={13} color={t.colors.label} />
                <Text
                  variant="footnote"
                  color="label"
                  style={{ fontWeight: '600', marginLeft: 6 }}
                >
                  {formatDate(selectedDate)}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={11}
                  color={t.colors.tertiary}
                  style={{ marginLeft: 4 }}
                />
              </Pressable>
            </View>
          </View>

          {/* Submission kind picker — only for submit-only roles on payment_out */}
          {!postsTxnDirectly && selectedType === 'payment_out' ? (
            <View style={styles.kindBlock}>
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 32, paddingBottom: 8 }}
              >
                THIS IS A
              </Text>
              <View style={styles.kindRow}>
                <KindOption
                  active={submissionKind === 'expense_reimbursement'}
                  icon="wallet-outline"
                  title="Personal expense"
                  desc="I paid out-of-pocket"
                  onPress={() => setSubmissionKind('expense_reimbursement')}
                />
                <KindOption
                  active={submissionKind === 'party_payment'}
                  icon="people-outline"
                  title="Party payment"
                  desc="Studio owes the party"
                  onPress={() => setSubmissionKind('party_payment')}
                />
              </View>
            </View>
          ) : null}

          {/* Party */}
          <FormGroup header="Party">
            <Row
              label={isPaymentIn ? 'From' : 'To'}
              value={selectedPartyName || 'Pick a party'}
              valueColor={selectedPartyName ? undefined : t.colors.tertiary}
              chevron
              onPress={() => router.push('/(app)/select-party' as never)}
              divider={false}
            />
          </FormGroup>
          {!selectedPartyName ? (
            <FieldNote text="Required" tone={t.colors.tertiary} />
          ) : null}

          {/* Details */}
          <FormGroup header="Details">
            <Controller
              control={control}
              name="description"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Description"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Cement purchase"
                  autoCapitalize="sentences"
                />
              )}
            />
            <Controller
              control={control}
              name="referenceNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Reference"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Bill / Invoice / Cheque #"
                  autoCapitalize="characters"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {errors.amount?.message ? (
            <FieldNote text={errors.amount.message} tone={t.palette.red.base} />
          ) : null}

          {/* Payment */}
          <FormGroup header="Payment">
            <View style={styles.methodBlock}>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12 }}
              >
                METHOD
              </Text>
              <View style={styles.methodRow}>
                {PAYMENT_METHODS.map((m) => {
                  const active = selectedPaymentMethod === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => setValue('paymentMethod', active ? '' : m.key)}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.methodChip,
                        {
                          backgroundColor: active
                            ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                            : t.colors.fill3,
                          borderRadius: 999,
                          borderColor: active ? t.palette.blue.base + '33' : 'transparent',
                          borderWidth: active ? 1 : 0,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Ionicons
                        name={m.icon as keyof typeof Ionicons.glyphMap}
                        size={14}
                        color={active ? t.palette.blue.base : t.colors.secondary}
                      />
                      <Text
                        variant="caption2"
                        style={{
                          color: active ? t.palette.blue.base : t.colors.secondary,
                          fontWeight: active ? '700' : '600',
                          marginLeft: 5,
                          letterSpacing: 0.3,
                        }}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View
                style={{
                  height: 0.5,
                  backgroundColor: t.colors.separator,
                  marginLeft: 16,
                }}
              />
            </View>
            <Row
              label="Cost code"
              value={categoryLabel ?? 'None'}
              valueColor={categoryLabel ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setShowCategoryPicker(true)}
              divider={false}
            />
          </FormGroup>

          {/* More — collapsible status picker */}
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <Pressable
              onPress={() => setShowMoreDetail(!showMoreDetail)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.moreToggle,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text variant="footnote" color="label" style={{ fontWeight: '600', flex: 1 }}>
                More options
              </Text>
              <Ionicons
                name={showMoreDetail ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={t.colors.secondary}
              />
            </Pressable>
            {showMoreDetail ? (
              <View style={{ marginTop: 10 }}>
                <Text
                  variant="caption2"
                  color="tertiary"
                  style={{ letterSpacing: 0.5, paddingHorizontal: 4, paddingBottom: 6 }}
                >
                  PAYMENT STATUS
                </Text>
                <View style={styles.statusRow}>
                  {(['paid', 'pending', 'partial'] as const).map((s) => {
                    const active = selectedStatus === s;
                    const tone =
                      s === 'paid'
                        ? { fg: t.palette.green.base, bg: t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft }
                        : s === 'pending'
                          ? { fg: t.palette.orange.base, bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft }
                          : { fg: t.palette.red.base, bg: t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft };
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setValue('status', s)}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.statusChip,
                          {
                            backgroundColor: active ? tone.bg : t.colors.fill3,
                            borderRadius: 999,
                            borderColor: active ? tone.fg + '33' : 'transparent',
                            borderWidth: active ? 1 : 0,
                          },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <Text
                          variant="caption2"
                          style={{
                            color: active ? tone.fg : t.colors.secondary,
                            fontWeight: active ? '700' : '600',
                            letterSpacing: 0.4,
                          }}
                        >
                          {s.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          {/* Receipt */}
          {stagedReceipt ? (
            <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
              <View
                style={[
                  styles.receiptRow,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.card,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <Image
                  source={{ uri: stagedReceipt.localUri }}
                  style={[styles.receiptThumb, { borderRadius: t.radii.tile }]}
                  resizeMode="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text variant="footnote" color="label" style={{ fontWeight: '700' }}>
                    Receipt attached
                  </Text>
                  <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                    Will upload when you tap Save.
                  </Text>
                </View>
                <Pressable onPress={clearReceipt} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={t.colors.tertiary} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Submit hint for submit-only roles */}
          {!postsTxnDirectly ? (
            <Text
              variant="caption1"
              color="tertiary"
              style={{
                paddingHorizontal: 32,
                marginTop: 14,
                fontStyle: 'italic',
                lineHeight: 17,
              }}
            >
              Submitted expenses stay pending until an Admin approves. Project totals
              update after approval.
            </Text>
          ) : null}

          {submitError ? (
            <FieldNote text={submitError} tone={t.palette.red.base} />
          ) : null}

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Footer — receipt actions */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: t.colors.surface,
              borderTopColor: t.colors.separator,
              borderTopWidth: t.hairline,
            },
          ]}
        >
          <Pressable
            onPress={() => pickReceipt('camera')}
            hitSlop={8}
            style={({ pressed }) => [
              styles.footerIcon,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="Take photo"
          >
            <Ionicons name="camera-outline" size={18} color={t.palette.blue.base} />
          </Pressable>
          <Pressable
            onPress={() => pickReceipt('library')}
            hitSlop={8}
            style={({ pressed }) => [
              styles.footerIcon,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityLabel="Upload file"
          >
            <Ionicons name="cloud-upload-outline" size={18} color={t.palette.blue.base} />
          </Pressable>
          <Text
            variant="caption2"
            color="tertiary"
            style={{ marginLeft: 4, flex: 1, letterSpacing: 0.4 }}
          >
            ATTACH RECEIPT
          </Text>
          <Text
            variant="caption2"
            color="tertiary"
            style={{ letterSpacing: 0.4 }}
          >
            {stagedReceipt ? '1 ATTACHED' : 'OPTIONAL'}
          </Text>
        </View>
      </KeyboardAvoidingView>

      {/* ── Date picker ── */}
      <DateTimeSheet
        open={showDatePicker}
        value={selectedDate}
        onChange={(d) => setValue('date', d)}
        onClose={() => setShowDatePicker(false)}
        mode="date"
        title="Date"
      />

      {/* ── Cost code picker ── */}
      <SelectSheet
        open={showCategoryPicker}
        title="Cost code"
        options={[{ key: '', label: 'None' }, ...categoryOptions]}
        selected={selectedCategory ?? ''}
        onPick={(k) => setValue('category', k)}
        onClose={() => setShowCategoryPicker(false)}
      />

      <SubmitProgressOverlay
        visible={isSubmitting}
        intent="submitTransaction"
        phaseLabel={savePhase}
      />
    </View>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

function FieldNote({ text, tone }: { text: string; tone: string }) {
  return (
    <Text
      variant="caption2"
      style={{
        color: tone,
        paddingHorizontal: 32,
        marginTop: 8,
      }}
    >
      {text}
    </Text>
  );
}

function KindOption({
  active,
  icon,
  title,
  desc,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.kindOption,
        {
          backgroundColor: active
            ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
            : t.colors.surface,
          borderRadius: t.radii.card,
          borderColor: active
            ? t.palette.blue.base + '33'
            : (t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? t.palette.blue.base : t.colors.secondary}
      />
      <Text
        variant="footnote"
        style={{
          color: active ? t.palette.blue.base : t.colors.label,
          fontWeight: '700',
          marginTop: 6,
        }}
      >
        {title}
      </Text>
      <Text variant="caption1" color="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
        {desc}
      </Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { paddingBottom: 60 },

  // Hero amount
  heroCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'flex-start',
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    gap: 2,
  },
  heroAmountInput: {
    flex: 1,
    paddingVertical: 0,
    margin: 0,
    minWidth: 100,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 12,
  },

  // Submission kind
  kindBlock: {
    paddingTop: 22,
  },
  kindRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  kindOption: {
    flex: 1,
    padding: 14,
    alignItems: 'flex-start',
  },

  // Method block
  methodBlock: {},
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // More toggle
  moreToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statusChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },

  // Receipt
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  receiptThumb: {
    width: 48,
    height: 48,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  footerIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sheet
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
  sheetSideBtn: {
    minWidth: 70,
  },
  sheetTitle: {
    flex: 1,
    textAlign: 'center',
  },

  // Search
  searchBar: {
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

  // Party list
  sectionHeader: {
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 6,
  },
  partyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  partyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  partyTypeTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  partyActions: {
    flexDirection: 'row',
    paddingBottom: 8,
  },
  partyActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },

  creatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
