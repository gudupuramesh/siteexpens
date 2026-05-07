/**
 * Add a studio finance entry (expense or income).
 *
 * Relocated from `app/(app)/finances/new.tsx` as part of the Finance hub
 * consolidation. The legacy path now redirects here.
 */
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { auth } from '@/src/lib/firebase';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { usePermissions } from '@/src/features/org/usePermissions';
import { createOrgFinance } from '@/src/features/finances/finances';
import {
  ORG_FINANCE_CATEGORIES,
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

export default function NewOrgFinanceScreen() {
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { members } = useOrgMembers(orgId || undefined);
  const { can } = usePermissions();

  const [kind, setKind] = useState<OrgFinanceKind>('expense');
  const [category, setCategory] = useState<OrgFinanceCategory>('other');
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [payee, setPayee] = useState('');
  const [payeeUid, setPayeeUid] = useState<string | null>(null);
  const [showMemberPick, setShowMemberPick] = useState(false);
  const [method, setMethod] = useState<OrgFinancePaymentMethod>('bank');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!can('finance.write')) {
    return (
      <Screen bg="grouped" padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body" color="textMuted">
          {"You don't have permission to add studio finances."}
        </Text>
      </Screen>
    );
  }

  const save = async () => {
    const uid = auth.currentUser?.uid;
    if (!orgId || !uid) return;
    const n = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Amount', 'Enter a valid amount.');
      return;
    }
    setBusy(true);
    try {
      await createOrgFinance({
        orgId,
        kind,
        category,
        amount: n,
        paidAt,
        payee: payee.trim() || undefined,
        payeeUid: payeeUid ?? undefined,
        paymentMethod: method,
        note: note.trim() || undefined,
        createdBy: uid,
      });
      // Snapshot-propagation buffer (see add-transaction.tsx).
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardFormLayout>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={color.text} />
          </Pressable>
          <Text variant="title" color="text" style={{ flex: 1 }}>
            Add entry
          </Text>
          <Pressable onPress={save} disabled={busy} hitSlop={12}>
            <Text variant="bodyStrong" color="primary">{busy ? '…' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Text variant="caption" color="textMuted" style={styles.label}>KIND</Text>
          <View style={styles.rowChips}>
            {(['expense', 'income'] as OrgFinanceKind[]).map((k) => (
              <Pressable
                key={k}
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.sm }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {ORG_FINANCE_CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => {
                    setCategory(c.key);
                    if (c.key !== 'salary') {
                      setPayeeUid(null);
                    }
                  }}
                  style={[styles.bigChip, category === c.key && styles.bigChipOn]}
                >
                  <Text variant="meta" color={category === c.key ? 'onPrimary' : 'text'}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {category === 'salary' ? (
            <>
              <Text variant="caption" color="textMuted" style={styles.label}>TEAM MEMBER</Text>
              <Pressable
                onPress={() => setShowMemberPick(true)}
                style={styles.inputLike}
              >
                <Text variant="body" color={payee ? 'text' : 'textMuted'}>
                  {payee || 'Pick a team member'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={color.textMuted} />
              </Pressable>
            </>
          ) : (
            <>
              <Text variant="caption" color="textMuted" style={styles.label}>PAYEE / VENDOR</Text>
              <TextInput
                value={payee}
                onChangeText={setPayee}
                placeholder="Name"
                placeholderTextColor={color.textFaint}
                style={styles.input}
              />
            </>
          )}

          <Text variant="caption" color="textMuted" style={styles.label}>AMOUNT (₹)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={color.textFaint}
            style={styles.input}
          />

          <Text variant="caption" color="textMuted" style={styles.label}>PAID ON</Text>
          <Pressable onPress={() => setShowDate(true)} style={styles.inputLike}>
            <Text variant="body" color="text">
              {paidAt.toLocaleDateString('en-IN')}
            </Text>
          </Pressable>

          <Text variant="caption" color="textMuted" style={styles.label}>METHOD</Text>
          <View style={styles.rowChips}>
            {PAY_METHODS.map((m) => (
              <Pressable
                key={m.key}
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
            placeholder="Optional"
            placeholderTextColor={color.textFaint}
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            multiline
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

      <Modal visible={showMemberPick} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowMemberPick(false)} />
        <View style={styles.modalSheet}>
          <Text variant="bodyStrong" color="text" style={{ marginBottom: space.sm }}>
            Select member
          </Text>
          <FlatList
            data={members}
            keyExtractor={(m) => m.uid}
            renderItem={({ item }) => (
              <Pressable
                style={styles.memberRow}
                onPress={() => {
                  setPayeeUid(item.uid);
                  setPayee(item.displayName);
                  setShowMemberPick(false);
                }}
              >
                <Text variant="body" color="text">{item.displayName}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    maxHeight: '50%',
    backgroundColor: color.surface,
    padding: screenInset,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  memberRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
});
