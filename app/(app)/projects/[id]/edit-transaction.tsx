/**
 * Edit Transaction screen. Pre-fills form from existing transaction data.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

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
  // Editing a posted txn = finance write. Site Engineer / Supervisor
  // can only "submit" new ones, not edit; they shouldn't reach this
  // screen via UI but the guard catches deep links.
  useGuardedRoute({ capability: 'transaction.write' });

  const params = useLocalSearchParams<{ id: string; txnId: string }>();
  const projectId = params.id;
  const txnId = params.txnId;
  const { user } = useAuth();
  const { can } = usePermissions();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: transactions } = useTransactions(projectId);

  const txn = useMemo(
    () => transactions.find((t) => t.id === txnId),
    [transactions, txnId],
  );

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  // Receipt state — same shape as edit-laminate:
  //   - existingReceipt   = what's in Firestore right now
  //   - stagedReplacement = a freshly-picked local file waiting for save
  //   - receiptCleared    = user tapped × on the existing receipt
  // Upload happens during onSubmit, not pick. Old key is only deleted
  // after the new doc-write succeeds.
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

  // Pre-fill when transaction loads
  useEffect(() => {
    if (txn) {
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
      // Hydrate the receipt UI from the existing Firestore values.
      // Older docs may have a photoUrl without a photoStoragePath
      // (pre-R2 era) — we still render the preview but won't be able
      // to delete the old R2 object on replace.
      if (txn.photoUrl) {
        setExistingReceipt({
          publicUrl: txn.photoUrl,
          key: txn.photoStoragePath,
        });
      }
    }
  }, [txn, reset]);

  const selectedDate = watch('date');
  const selectedCategory = watch('category');
  const selectedPaymentMethod = watch('paymentMethod');
  const categoryLabel = TRANSACTION_CATEGORIES.find((c) => c.key === selectedCategory)?.label;

  function handleDateChange(_: DateTimePickerEvent, date?: Date) {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) setValue('date', date, { shouldDirty: true });
  }

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

    // Stage the replacement locally — upload during Save.
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
      // Step 1 — upload the staged replacement (if any).
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

      // Step 2 — Decide what to write:
      //   - replaced → new url + key
      //   - cleared → '' (FieldValue.delete via updateTransaction)
      //   - neither → skip the photo fields
      let photoUrl: string | undefined;
      let photoStoragePath: string | undefined;
      if (newPhotoUrl) {
        photoUrl = newPhotoUrl;
        photoStoragePath = newPhotoKey;
      } else if (receiptCleared) {
        photoUrl = '';
        photoStoragePath = '';
      } else if (existingReceipt) {
        // Preserve existing.
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

      // Step 3 — Delete the OLD R2 key only after doc-write succeeded.
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
      // Wait briefly so the parent screen's onSnapshot listener catches
      // the just-updated doc before navigation completes.
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  async function onDelete() {
    Alert.alert('Delete Transaction', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.collection('transactions').doc(txnId).delete();
            // Clean up the receipt object in R2 + decrement project
            // storage totals. Best-effort — if it fails we leave an
            // orphan, but the txn doc is already gone so the UX is
            // complete.
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

  if (!txn) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="meta" color="textMuted">Loading...</Text>
        </View>
      </Screen>
    );
  }

  const wf = txn.workflowStatus ?? 'posted';
  const mayEditTxn =
    wf !== 'rejected' &&
    (can('transaction.write') ||
      (wf === 'pending_approval' &&
        !!user?.uid &&
        txn.createdBy === user.uid &&
        can('transaction.submit')));
  const mayDeleteTxn =
    can('transaction.write') ||
    (wf === 'pending_approval' &&
      !!user?.uid &&
      txn.createdBy === user.uid &&
      can('transaction.submit'));

  if (wf === 'rejected') {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="arrow-back" size={22} color={color.text} />
          </Pressable>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>
            Transaction rejected
          </Text>
          <View style={styles.navBtn} />
        </View>
        <View style={{ flex: 1, padding: space.md }}>
          <Text variant="meta" color="textMuted">
            This expense was rejected and cannot be edited.
          </Text>
          {!!txn.rejectionNote && (
            <Text variant="meta" color="text" style={{ marginTop: space.sm }}>
              {txn.rejectionNote}
            </Text>
          )}
        </View>
      </Screen>
    );
  }

  if (!mayEditTxn) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="arrow-back" size={22} color={color.text} />
          </Pressable>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>
            Cannot edit
          </Text>
          <View style={styles.navBtn} />
        </View>
        <View style={{ flex: 1, padding: space.md }}>
          <Text variant="meta" color="textMuted">
            You do not have permission to edit this transaction.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>EXPENSE</Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>
            Edit {isPaymentIn ? 'Payment In' : 'Payment Out'}
          </Text>
        </View>
        {mayDeleteTxn ? (
          <Pressable onPress={onDelete} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="trash-outline" size={20} color={color.danger} />
          </Pressable>
        ) : (
          <View style={styles.navBtn} />
        )}
      </View>

      <View style={styles.hero}>
        <Text variant="caption" color="textMuted" style={styles.heroLabel}>
          AMOUNT - INR
        </Text>
        <View style={styles.heroAmountRow}>
          <Text variant="title" style={{ color: isPaymentIn ? color.success : color.primary }}>
            {isPaymentIn ? '+ Rs' : '- Rs'}
          </Text>
          <Controller control={control} name="amount" render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              value={value}
              onChangeText={(t) => onChange(t.replace(/[^\d.]/g, ''))}
              onBlur={onBlur}
              placeholder="0"
              keyboardType="numeric"
              style={styles.heroAmountInput}
              placeholderTextColor={color.textFaint}
            />
          )} />
        </View>
        <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateChip}>
          <Text variant="metaStrong" color="text">{formatDate(selectedDate)}</Text>
          <Ionicons name="chevron-down" size={14} color={color.textMuted} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <Controller control={control} name="partyName" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Party Name *" placeholder="Party name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.partyName?.message} square strongBorder />
          )} />
          {errors.amount?.message ? (
            <Text variant="caption" color="danger" style={{ marginTop: 2 }}>
              {errors.amount.message}
            </Text>
          ) : null}

          <Controller control={control} name="description" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Description" placeholder="Description" value={value ?? ''} onChangeText={onChange} onBlur={onBlur} square strongBorder />
          )} />

          <Controller control={control} name="referenceNumber" render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Reference Number" placeholder="Bill / Invoice number" value={value ?? ''} onChangeText={onChange} onBlur={onBlur} square strongBorder />
          )} />

          {/* Payment Method */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>PAYMENT METHOD</Text>
          <View style={styles.methodRow}>
            {PAYMENT_METHODS.map((m) => {
              const active = selectedPaymentMethod === m.key;
              return (
                <Pressable key={m.key} onPress={() => setValue('paymentMethod', active ? '' : m.key, { shouldDirty: true })} style={[styles.methodChip, active && styles.methodChipActive]}>
                  <Ionicons name={m.icon as any} size={16} color={active ? color.onPrimary : color.textMuted} />
                  <Text variant="caption" style={{ color: active ? color.onPrimary : color.text, textAlign: 'center' }}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Category */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>COST CODE</Text>
          <Pressable onPress={() => setShowCategoryPicker(true)} style={styles.dropdownField}>
            <Text variant="body" color={categoryLabel ? 'text' : 'textFaint'}>{categoryLabel ?? 'Select category'}</Text>
            <Ionicons name="chevron-down" size={18} color={color.textMuted} />
          </Pressable>

          {/* Status */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>STATUS</Text>
          <View style={styles.methodRow}>
            {(['paid', 'pending', 'partial'] as const).map((s) => {
              const active = watch('status') === s;
              return (
                <Pressable key={s} onPress={() => setValue('status', s, { shouldDirty: true })} style={[styles.statusChip, active && styles.statusChipActive]}>
                  <Text variant="caption" style={{ color: active ? color.onPrimary : color.textMuted }}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                </Pressable>
              );
            })}
          </View>

          {showDatePicker && (
            <DateTimePicker value={selectedDate} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={handleDateChange} />
          )}

          {/* Receipt section — pre-filled from txn.photoUrl. Camera +
              Library let the user attach (or replace) a receipt. The
              old R2 object is deleted only after a successful save. */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>RECEIPT</Text>
          {(stagedReplacement || (existingReceipt && !receiptCleared)) ? (
            <View style={styles.receiptRow}>
              <View style={styles.receiptThumbWrap}>
                <Image
                  source={{ uri: stagedReplacement?.localUri ?? existingReceipt?.publicUrl ?? '' }}
                  style={styles.receiptThumb}
                  resizeMode="cover"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="metaStrong" color="text">
                  {stagedReplacement ? 'Replacement queued' : 'Receipt attached'}
                </Text>
                <Text variant="caption" color="textMuted">
                  {stagedReplacement
                    ? 'Will upload when you tap Save.'
                    : 'Tap a button below to replace.'}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setStagedReplacement(null);
                  setReceiptCleared(!!existingReceipt);
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={20} color={color.textFaint} />
              </Pressable>
            </View>
          ) : (
            <View style={[styles.receiptRow, { justifyContent: 'center' }]}>
              <Text variant="caption" color="textMuted">No receipt attached</Text>
            </View>
          )}
          <View style={styles.receiptBtnRow}>
            <Pressable
              onPress={() => pickReceipt('camera')}
              style={({ pressed }) => [
                styles.receiptBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="camera-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" style={{ color: color.primary }}>Camera</Text>
            </Pressable>
            <Pressable
              onPress={() => pickReceipt('library')}
              style={({ pressed }) => [
                styles.receiptBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" style={{ color: color.primary }}>Library</Text>
            </Pressable>
          </View>

          {submitError && <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>{submitError}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={savePhase ?? 'Update Transaction'}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            // Save enabled when form changed OR receipt staging changed.
            disabled={!isValid || (!isDirty && !stagedReplacement && !receiptCleared)}
          />
        </View>
      </KeyboardAvoidingView>

      {/* Category Picker */}
      <Modal visible={showCategoryPicker} animationType="slide" transparent onRequestClose={() => setShowCategoryPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryPicker(false)}><View /></Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text variant="bodyStrong" color="text" style={styles.modalTitle}>Cost Code</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalList}>
            {TRANSACTION_CATEGORIES.map((c) => {
              const active = selectedCategory === c.key;
              return (
                <Pressable key={c.key} onPress={() => { setValue('category', active ? '' : c.key, { shouldDirty: true }); setShowCategoryPicker(false); }} style={[styles.catOption, active && styles.catOptionActive]}>
                  <Text variant="body" color={active ? 'primary' : 'text'} style={active ? { fontWeight: '600' } : undefined}>{c.label}</Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={color.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: screenInset, paddingTop: 2, paddingBottom: 8, backgroundColor: color.bgGrouped, borderBottomWidth: 1, borderBottomColor: color.borderStrong },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navEyebrow: { letterSpacing: 1.2 },
  navTitle: { textAlign: 'center' },
  hero: {
    paddingHorizontal: screenInset,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },
  heroLabel: { letterSpacing: 1.2, marginBottom: 4 },
  heroAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  heroAmountInput: { flex: 1, fontSize: 34, fontWeight: '700', color: color.text, paddingVertical: 0 },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: color.bg, borderWidth: 1, borderColor: color.borderStrong },
  scroll: { paddingHorizontal: screenInset, paddingTop: 12, paddingBottom: space.xl, backgroundColor: color.bgGrouped },
  sectionLabel: { marginTop: space.md, marginBottom: space.xs },

  // Receipt section styling — matches the rest of the form's sharp /
  // hairline / dense aesthetic.
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    minHeight: 56,
  },
  receiptThumbWrap: {
    width: 44, height: 44,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  receiptThumb: { width: '100%', height: '100%' },
  receiptOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  receiptBtnRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xs,
  },
  receiptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.primary,
  },
  methodRow: { flexDirection: 'row', gap: space.xs, marginBottom: space.sm, flexWrap: 'wrap' },
  methodChip: { flex: 1, minWidth: '23%', alignItems: 'center', gap: 4, paddingVertical: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: color.borderStrong, backgroundColor: color.bg },
  methodChipActive: { backgroundColor: color.primary, borderColor: color.primary },
  statusChip: { flex: 1, paddingVertical: space.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: color.borderStrong, alignItems: 'center' },
  statusChipActive: { backgroundColor: color.primary, borderColor: color.primary },
  dropdownField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: color.borderStrong, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48, marginBottom: space.sm },
  footer: { paddingHorizontal: screenInset, paddingVertical: space.sm, backgroundColor: color.bgGrouped, borderTopWidth: 1, borderTopColor: color.borderStrong },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.sm, paddingBottom: space.xxl, maxHeight: '65%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.border, alignSelf: 'center', marginBottom: space.sm },
  modalTitle: { textAlign: 'center', marginBottom: space.sm },
  modalList: { paddingHorizontal: screenInset },
  catOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm, paddingHorizontal: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator },
  catOptionActive: { backgroundColor: color.primarySoft, borderRadius: radius.sm },
});
