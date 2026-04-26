/**
 * Edit Transaction screen. Pre-fills form from existing transaction data.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

import { useAuth } from '@/src/features/auth/useAuth';
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
  const params = useLocalSearchParams<{ id: string; txnId: string }>();
  const projectId = params.id;
  const txnId = params.txnId;
  const { user } = useAuth();
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

  async function onSubmit(data: FormData) {
    if (!txnId) return;
    setSubmitError(undefined);
    try {
      await updateTransaction(txnId, {
        amount: parseFloat(data.amount),
        description: data.description || '',
        partyName: data.partyName,
        category: (data.category as TransactionCategory) || undefined,
        paymentMethod: (data.paymentMethod as PaymentMethod) || undefined,
        referenceNumber: data.referenceNumber || undefined,
        status: data.status,
        date: data.date,
      });
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
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
        <Pressable onPress={onDelete} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="trash-outline" size={20} color={color.danger} />
        </Pressable>
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

          {submitError && <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>{submitError}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Update Transaction" onPress={handleSubmit(onSubmit)} loading={isSubmitting} disabled={!isValid || !isDirty} />
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
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.none, backgroundColor: color.bg, borderWidth: 1, borderColor: color.borderStrong },
  scroll: { paddingHorizontal: screenInset, paddingTop: 12, paddingBottom: space.xl, backgroundColor: color.bgGrouped },
  sectionLabel: { marginTop: space.md, marginBottom: space.xs },
  methodRow: { flexDirection: 'row', gap: space.xs, marginBottom: space.sm, flexWrap: 'wrap' },
  methodChip: { flex: 1, minWidth: '23%', alignItems: 'center', gap: 4, paddingVertical: space.sm, borderRadius: radius.none, borderWidth: 1, borderColor: color.borderStrong, backgroundColor: color.bg },
  methodChipActive: { backgroundColor: color.primary, borderColor: color.primary },
  statusChip: { flex: 1, paddingVertical: space.xs, borderRadius: radius.none, borderWidth: 1, borderColor: color.borderStrong, alignItems: 'center' },
  statusChipActive: { backgroundColor: color.primary, borderColor: color.primary },
  dropdownField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.bg, borderRadius: radius.none, borderWidth: 1, borderColor: color.borderStrong, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48, marginBottom: space.sm },
  footer: { paddingHorizontal: screenInset, paddingVertical: space.sm, backgroundColor: color.bgGrouped, borderTopWidth: 1, borderTopColor: color.borderStrong },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: color.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.sm, paddingBottom: space.xxl, maxHeight: '65%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.border, alignSelf: 'center', marginBottom: space.sm },
  modalTitle: { textAlign: 'center', marginBottom: space.sm },
  modalList: { paddingHorizontal: screenInset },
  catOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm, paddingHorizontal: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator },
  catOptionActive: { backgroundColor: color.primarySoft, borderRadius: radius.sm },
});
