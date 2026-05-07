/**
 * View / edit / delete a single org finance row.
 *
 * Relocated from `app/(app)/finances/[id].tsx` as part of the Finance hub
 * consolidation. Param renamed `id` → `expenseId` to be unambiguous against
 * future siblings (e.g. `staff/[staffId]`).
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { db } from '@/src/lib/firebase';
import { usePermissions } from '@/src/features/org/usePermissions';
import { deleteOrgFinance, updateOrgFinance } from '@/src/features/finances/finances';
import {
  ORG_FINANCE_CATEGORIES,
  type OrgFinance,
  type OrgFinanceCategory,
  type OrgFinanceKind,
  type OrgFinancePaymentMethod,
} from '@/src/features/finances/types';
import { DatePickerModal } from '@/src/ui/DatePickerModal';
import { KeyboardFormLayout } from '@/src/ui/KeyboardFormLayout';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

const PAY_METHODS: { key: OrgFinancePaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'bank', label: 'Bank' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
];

export default function OrgFinanceDetailScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const { can } = usePermissions();
  const canRead = can('finance.read');
  const canWrite = can('finance.write');

  const [row, setRow] = useState<OrgFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<OrgFinanceKind>('expense');
  const [category, setCategory] = useState<OrgFinanceCategory>('other');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [payee, setPayee] = useState('');
  const [method, setMethod] = useState<OrgFinancePaymentMethod>('bank');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!expenseId) return;
    setLoading(true);
    try {
      const snap = await db.collection('orgFinances').doc(expenseId).get();
      if (!snap.exists) {
        setRow(null);
        return;
      }
      const v = { id: snap.id, ...(snap.data() as Omit<OrgFinance, 'id'>) };
      setRow(v);
      setKind(v.kind);
      setCategory(v.category);
      setAmount(String(v.amount));
      setPaidAt(v.paidAt?.toDate() ?? new Date());
      setPayee(v.payee ?? '');
      setMethod((v.paymentMethod as OrgFinancePaymentMethod) ?? 'bank');
      setNote(v.note ?? '');
    } catch (e) {
      console.warn(e);
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    void load();
  }, [load, canRead]);

  const save = async () => {
    if (!expenseId || !canWrite) return;
    const n = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Amount', 'Enter a valid amount.');
      return;
    }
    setBusy(true);
    try {
      await updateOrgFinance(expenseId, {
        kind,
        category,
        amount: n,
        paidAt,
        payee: payee.trim(),
        paymentMethod: method,
        note: note.trim(),
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!expenseId || !canWrite) return;
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOrgFinance(expenseId);
            router.back();
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          }
        },
      },
    ]);
  };

  if (!canRead) {
    return (
      <Screen bg="grouped" padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body" color="textMuted">
          {"You don't have permission to view this entry."}
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text variant="metaStrong" color="primary">Go back</Text>
        </Pressable>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen bg="grouped" padded>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={color.primary} />
      </Screen>
    );
  }

  if (!row) {
    return (
      <Screen bg="grouped" padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body" color="textMuted">Entry not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text variant="metaStrong" color="primary">Go back</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardFormLayout>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={color.text} />
          </Pressable>
          <Text variant="title" color="text" style={{ flex: 1 }}>
            Finance entry
          </Text>
          {canWrite ? (
            <>
              <Pressable onPress={save} disabled={busy} hitSlop={12}>
                <Text variant="bodyStrong" color="primary">{busy ? '…' : 'Save'}</Text>
              </Pressable>
              <Pressable onPress={remove} hitSlop={12}>
                <Ionicons name="trash-outline" size={22} color={color.danger} />
              </Pressable>
            </>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text variant="caption" color="textMuted" style={styles.label}>KIND</Text>
          <View style={styles.rowChips}>
            {(['expense', 'income'] as OrgFinanceKind[]).map((k) => (
              <Pressable
                key={k}
                disabled={!canWrite}
                onPress={() => setKind(k)}
                style={[styles.bigChip, kind === k && styles.bigChipOn]}
              >
                <Text variant="metaStrong" color={kind === k ? 'onPrimary' : 'text'}>
                  {k === 'expense' ? 'Expense' : 'Income'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text variant="caption" color="textMuted" style={styles.label}>CATEGORY</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ORG_FINANCE_CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                disabled={!canWrite}
                onPress={() => setCategory(c.key)}
                style={[styles.bigChip, category === c.key && styles.bigChipOn]}
              >
                <Text variant="meta" color={category === c.key ? 'onPrimary' : 'text'}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text variant="caption" color="textMuted" style={styles.label}>PAYEE</Text>
          <TextInput
            value={payee}
            onChangeText={setPayee}
            editable={canWrite}
            style={styles.input}
          />

          <Text variant="caption" color="textMuted" style={styles.label}>AMOUNT (₹)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            editable={canWrite}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text variant="caption" color="textMuted" style={styles.label}>PAID ON</Text>
          <Pressable onPress={() => canWrite && setShowDate(true)} style={styles.inputLike}>
            <Text variant="body" color="text">
              {paidAt.toLocaleDateString('en-IN')}
            </Text>
          </Pressable>

          <Text variant="caption" color="textMuted" style={styles.label}>METHOD</Text>
          <View style={styles.rowChips}>
            {PAY_METHODS.map((m) => (
              <Pressable
                key={m.key}
                disabled={!canWrite}
                onPress={() => setMethod(m.key)}
                style={[styles.bigChip, method === m.key && styles.bigChipOn]}
              >
                <Text variant="meta" color={method === m.key ? 'onPrimary' : 'text'}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text variant="caption" color="textMuted" style={styles.label}>NOTE</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            editable={canWrite}
            multiline
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
          />
        </ScrollView>
      </KeyboardFormLayout>

      <DatePickerModal
        visible={showDate}
        value={paidAt}
        onClose={() => setShowDate(false)}
        onConfirm={(d) => {
          setPaidAt(d);
          setShowDate(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  form: { padding: screenInset, paddingBottom: 120 },
  label: { marginTop: space.md, marginBottom: 6, letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 12,
    fontSize: 16,
    color: color.text,
    backgroundColor: color.bg,
  },
  inputLike: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 12,
    backgroundColor: color.bg,
  },
  rowChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bigChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  bigChipOn: { backgroundColor: color.primary, borderColor: color.primary },
});
