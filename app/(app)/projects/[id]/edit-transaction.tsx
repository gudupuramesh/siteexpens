/**
 * Edit Transaction — v2 design.
 *
 * Pre-fills form from existing transaction data. Same shape as add-transaction
 * but without the type/party-create flow:
 *
 *   1. SheetHeader: Cancel · "Edit Payment In/Out" · Save
 *   2. Hero amount card — colored sign + tabular amount + date pill
 *   3. FormGroup "Party" — partyName InputRow
 *   4. FormGroup "Details" — Description · Reference (InputRow)
 *   5. FormGroup "Payment" — method pill row · cost code SelectSheet · status
 *   6. Receipt strip (replace / clear)
 *   7. Footer with camera + gallery action buttons
 *
 * Delete is a circular button in the header (right side).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { guessImageMimeType } from '@/src/lib/r2Upload';
import { commitStagedFiles, type StagedFile } from '@/src/lib/commitStagedFiles';
import { deleteR2Object } from '@/src/lib/r2Delete';

import { useAuth } from '@/src/features/auth/useAuth';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { updateTransaction } from '@/src/features/transactions/transactions';
import {
  TRANSACTION_CATEGORIES,
  PAYMENT_METHODS,
  normalizeTransactionType,
  type TransactionCategory,
  type PaymentMethod,
} from '@/src/features/transactions/types';
import { formatDate } from '@/src/lib/format';
import { db } from '@/src/lib/firebase';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const schema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount'),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  partyName: z.string().trim().min(1, 'Party required'),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  referenceNumber: z.string().optional(),
  status: z.enum(['paid', 'pending', 'partial']),
  date: z.date(),
});

type FormData = z.infer<typeof schema>;

export default function EditTransactionScreen() {
  useGuardedRoute({ capability: 'transaction.write' });

  const t = useThemeV2();
  const params = useLocalSearchParams<{ id: string; txnId: string }>();
  const projectId = params.id;
  const txnId = params.txnId;
  const { user } = useAuth();
  const { can } = usePermissions();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: transactions, loading: txnsLoading } = useTransactions(projectId);

  const txn = useMemo(
    () => transactions.find((tx) => tx.id === txnId),
    [transactions, txnId],
  );

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [existingReceipt, setExistingReceipt] = useState<{
    publicUrl: string;
    key?: string;
  } | null>(null);
  const [stagedReplacement, setStagedReplacement] = useState<StagedFile | null>(null);
  const [receiptCleared, setReceiptCleared] = useState(false);
  const [savePhase, setSavePhase] = useState<string>();

  const txnType = txn ? normalizeTransactionType(txn.type) : 'payment_out';
  const isPaymentIn = txnType === 'payment_in';

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isValid, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: '',
      description: '',
      partyName: '',
      category: '',
      paymentMethod: '',
      referenceNumber: '',
      status: 'paid',
      date: new Date(),
    },
    mode: 'onChange',
  });

  // Pre-fill the form ONCE per transaction.
  //
  // BUG (was here): the dep was `[txn, reset]`. `txn` is the result of
  // `transactions.find(...)`, and `transactions` is a Firestore snapshot
  // that re-emits with brand-new object references whenever the underlying
  // listener fires (initial load, auth-token refresh, peer transactions
  // changing, retry after a transient permission-denied, etc.).
  //
  // Each re-emit gave us a NEW `txn` reference (even when the content was
  // identical), so this effect ran AGAIN, calling `reset(...)` and
  // overwriting whatever the user had typed mid-edit. Result: type a digit
  // → snapshot fires within a second → form snaps back to the original
  // value. Looked like the input was rejecting the user's keystrokes.
  //
  // Fix: key the effect on `txn?.id` (a stable string). The transaction's
  // identity doesn't change during an edit session, so the pre-fill runs
  // exactly once when the screen first acquires the txn data, and never
  // again. Field hydrations (`reset`, `setExistingReceipt`) are wrapped
  // in a guard so a re-render with the same id doesn't re-hydrate.
  const hydratedForId = useRef<string | null>(null);
  useEffect(() => {
    if (!txn) return;
    if (hydratedForId.current === txn.id) return;
    hydratedForId.current = txn.id;
    reset({
      amount: String(txn.amount),
      description: txn.description || '',
      partyName: txn.partyName || '',
      category: txn.category || '',
      paymentMethod: txn.paymentMethod || '',
      referenceNumber: txn.referenceNumber || '',
      status: txn.status || 'paid',
      date: txn.date ? txn.date.toDate() : new Date(),
    });
    if (txn.photoUrl) {
      setExistingReceipt({
        publicUrl: txn.photoUrl,
        key: txn.photoStoragePath,
      });
    }
  }, [txn?.id, txn, reset]);

  const selectedDate = watch('date');
  const selectedCategory = watch('category');
  const selectedPaymentMethod = watch('paymentMethod');
  const selectedStatus = watch('status');
  const categoryLabel = TRANSACTION_CATEGORIES.find((c) => c.key === selectedCategory)?.label;

  async function pickReceipt(source: 'camera' | 'library') {
    if (!projectId || !txn) return;
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
    setStagedReplacement({
      id: 'replacement',
      localUri: asset.uri,
      contentType: asset.mimeType || guessImageMimeType(asset.uri),
    });
    setReceiptCleared(false);
  }

  async function onSubmit(data: FormData) {
    if (!txnId || !projectId) return;
    setSubmitError(undefined);
    try {
      let newPhotoUrl: string | undefined;
      let newPhotoKey: string | undefined;
      if (stagedReplacement) {
        setSavePhase('Uploading receipt…');
        const { uploaded, failed } = await commitStagedFiles({
          files: [stagedReplacement],
          kind: 'transaction',
          refId: projectId,
          projectId,
          compress: 'balanced',
        });
        if (failed.length > 0) {
          setSubmitError(`Receipt upload failed: ${failed[0].error}`);
          setSavePhase(undefined);
          return;
        }
        newPhotoUrl = uploaded[0].publicUrl;
        newPhotoKey = uploaded[0].key;
      }

      let photoUrl: string | undefined;
      let photoStoragePath: string | undefined;
      if (newPhotoUrl) {
        photoUrl = newPhotoUrl;
        photoStoragePath = newPhotoKey;
      } else if (receiptCleared) {
        photoUrl = '';
        photoStoragePath = '';
      } else if (existingReceipt) {
        photoUrl = existingReceipt.publicUrl;
        photoStoragePath = existingReceipt.key;
      }

      setSavePhase('Saving transaction…');
      await updateTransaction(txnId, {
        amount: parseFloat(data.amount),
        description: data.description || '',
        partyName: data.partyName,
        category: (data.category as TransactionCategory) || undefined,
        paymentMethod: (data.paymentMethod as PaymentMethod) || undefined,
        referenceNumber: data.referenceNumber || undefined,
        status: data.status,
        date: data.date,
        photoUrl,
        photoStoragePath,
      });

      const oldKey = existingReceipt?.key;
      const shouldDeleteOld =
        oldKey && (newPhotoKey || receiptCleared) && oldKey !== newPhotoKey;
      if (shouldDeleteOld && oldKey) {
        void deleteR2Object({
          projectId,
          key: oldKey,
          kind: 'transaction',
          refId: projectId,
          sizeBytes: 0,
          contentType: 'image/jpeg',
        });
      }
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  async function onDelete() {
    Alert.alert('Delete transaction', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.collection('transactions').doc(txnId).delete();
            const receiptKey = txn?.photoStoragePath ?? existingReceipt?.key;
            if (receiptKey && projectId) {
              void deleteR2Object({
                projectId,
                key: receiptKey,
                kind: 'transaction',
                refId: projectId,
                sizeBytes: 0,
                contentType: 'image/jpeg',
              });
            }
            router.back();
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  }

  // Loading
  if (!txn && txnsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit transaction"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="footnote" color="secondary">Loading…</Text>
        </View>
      </View>
    );
  }

  // Loaded but the transaction wasn't found in the result set. Either it
  // was deleted, or — much more commonly — Firestore Security Rules denied
  // the parent query (stale auth token after a role/claims update). The
  // pattern is: the device cached an ID token from before the user was
  // added to the org or had their role bumped, so rules reject the read.
  // Sign out + back in mints a fresh token with the current claims.
  if (!txn) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit transaction"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={[styles.centered, { padding: 32 }]}>
          <Ionicons
            name="alert-circle-outline"
            size={32}
            color={t.colors.tertiary}
          />
          <Text
            variant="callout"
            color="label"
            style={{ marginTop: 12, textAlign: 'center', fontWeight: '600' }}
          >
            Couldn't load this transaction
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 6, textAlign: 'center', lineHeight: 18 }}
          >
            It may have been deleted, or your access to this project has
            changed. If you were just added to this workspace or your role
            was updated, sign out and back in to refresh your session.
          </Text>
          <Pressable
            onPress={() => router.back()}
            hitSlop={6}
            style={{ marginTop: 18 }}
          >
            <Text
              variant="footnote"
              style={{ color: t.palette.blue.base, fontWeight: '600' }}
            >
              Go back
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const wf = txn.workflowStatus ?? 'posted';
  const mayEditTxn =
    wf !== 'rejected'
    && (can('transaction.write')
      || (wf === 'pending_approval'
        && !!user?.uid
        && txn.createdBy === user.uid
        && can('transaction.submit')));
  const mayDeleteTxn =
    can('transaction.write')
    || (wf === 'pending_approval'
      && !!user?.uid
      && txn.createdBy === user.uid
      && can('transaction.submit'));

  if (wf === 'rejected') {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Transaction rejected"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={[styles.centered, { padding: 32 }]}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            This expense was rejected and cannot be edited.
          </Text>
          {txn.rejectionNote ? (
            <Text variant="footnote" color="label" style={{ marginTop: 12, textAlign: 'center' }}>
              {txn.rejectionNote}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (!mayEditTxn) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Cannot edit"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={[styles.centered, { padding: 32 }]}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center' }}>
            You do not have permission to edit this transaction.
          </Text>
        </View>
      </View>
    );
  }

  const heroAmountColor = isPaymentIn ? t.palette.green.base : t.palette.red.base;
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title={`Edit ${isPaymentIn ? 'Payment In' : 'Payment Out'}`}
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={isSubmitting}
        saveDisabled={!isValid || (!isDirty && !stagedReplacement && !receiptCleared) || !orgId}
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
                  style={{ color: heroAmountColor, fontWeight: '700' }}
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

          {/* Party */}
          <FormGroup header="Party">
            <Controller
              control={control}
              name="partyName"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Party name"
                  autoCapitalize="words"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {errors.partyName?.message ? (
            <FieldNote text={errors.partyName.message} tone={t.palette.red.base} />
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
                  placeholder="Bill / Invoice #"
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
                      onPress={() => setValue('paymentMethod', active ? '' : m.key, { shouldDirty: true })}
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
            />
            <View style={styles.statusBlock}>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12 }}
              >
                STATUS
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
                      onPress={() => setValue('status', s, { shouldDirty: true })}
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
          </FormGroup>

          {/* Receipt */}
          <View style={{ paddingHorizontal: 16, marginTop: 22 }}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
            >
              RECEIPT
            </Text>
            {(stagedReplacement || (existingReceipt && !receiptCleared)) ? (
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
                  source={{ uri: stagedReplacement?.localUri ?? existingReceipt?.publicUrl ?? '' }}
                  style={[styles.receiptThumb, { borderRadius: t.radii.tile }]}
                  resizeMode="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text variant="footnote" color="label" style={{ fontWeight: '700' }}>
                    {stagedReplacement ? 'Replacement queued' : 'Receipt attached'}
                  </Text>
                  <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                    {stagedReplacement
                      ? 'Will upload when you tap Save.'
                      : 'Use the buttons below to replace.'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setStagedReplacement(null);
                    setReceiptCleared(!!existingReceipt);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={20} color={t.colors.tertiary} />
                </Pressable>
              </View>
            ) : (
              <View
                style={[
                  styles.receiptEmpty,
                  {
                    backgroundColor: t.colors.fill3,
                    borderRadius: t.radii.card,
                  },
                ]}
              >
                <Text variant="caption1" color="secondary">
                  No receipt attached
                </Text>
              </View>
            )}
            <View style={styles.receiptBtnRow}>
              <ReceiptBtn
                icon="camera-outline"
                label="Camera"
                onPress={() => pickReceipt('camera')}
              />
              <ReceiptBtn
                icon="image-outline"
                label="Gallery"
                onPress={() => pickReceipt('library')}
              />
            </View>
          </View>

          {submitError ? (
            <FieldNote text={submitError} tone={t.palette.red.base} />
          ) : null}

          {/* Delete (when allowed) */}
          {mayDeleteTxn ? (
            <View style={{ paddingHorizontal: 16, marginTop: 26 }}>
              <Pressable
                onPress={onDelete}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                    borderRadius: t.radii.field,
                    borderColor: t.palette.red.base + '33',
                    borderWidth: t.hairline,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="trash-outline" size={16} color={t.palette.red.base} />
                <Text
                  variant="footnote"
                  style={{
                    color: t.palette.red.base,
                    fontWeight: '700',
                    marginLeft: 6,
                  }}
                >
                  Delete transaction
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker */}
      <DateTimeSheet
        open={showDatePicker}
        value={selectedDate}
        onChange={(d) => setValue('date', d, { shouldDirty: true })}
        onClose={() => setShowDatePicker(false)}
        mode="date"
        title="Date"
      />

      {/* Cost code picker */}
      <SelectSheet
        open={showCategoryPicker}
        title="Cost code"
        options={[
          { key: '', label: 'None' },
          ...TRANSACTION_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
        ]}
        selected={selectedCategory ?? ''}
        onPick={(k) => setValue('category', k, { shouldDirty: true })}
        onClose={() => setShowCategoryPicker(false)}
      />
    </View>
  );
}

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

function ReceiptBtn({
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
      hitSlop={6}
      style={({ pressed }) => [
        styles.receiptBtn,
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

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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

  // Method
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

  // Status
  statusBlock: {},
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
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
  receiptEmpty: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  receiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
