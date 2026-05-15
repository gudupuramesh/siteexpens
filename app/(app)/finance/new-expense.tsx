/**
 * Add a studio finance entry (expense or income) — v2 design.
 *
 * Layout (top → bottom):
 *   1. SheetHeader: Cancel · "New entry" · Save
 *   2. KeyboardAvoidingView + ScrollView so keyboard never overlaps inputs
 *      a. Type pill row (Expense / Income)
 *      b. FormGroup "Details" — Category (sheet) · Payee/Member (sheet/input) ·
 *         Amount · Paid on (date sheet)
 *      c. FormGroup "Payment" — Method pill row · Note (multiline)
 *
 * Date picker uses v2 DateTimeSheet (with Done button). Category +
 * Member pickers use v2 SelectSheet.
 */
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const PAY_METHODS: { key: OrgFinancePaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'bank', label: 'Bank' },
  { key: 'upi', label: 'UPI' },
  { key: 'card', label: 'Card' },
];

const KIND_OPTIONS: { key: OrgFinanceKind; label: string }[] = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
];

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function NewOrgFinanceScreen() {
  const t = useThemeV2();
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
  const [showCategoryPick, setShowCategoryPick] = useState(false);
  const [showMemberPick, setShowMemberPick] = useState(false);
  const [method, setMethod] = useState<OrgFinancePaymentMethod>('bank');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!can('finance.write')) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="New entry"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">
            You don't have permission to add studio finances.
          </Text>
        </View>
      </View>
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

  const categoryLabel =
    ORG_FINANCE_CATEGORIES.find((c) => c.key === category)?.label ?? '—';
  const isSalary = category === 'salary';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="New entry"
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={busy}
        onCancel={() => router.back()}
        onSave={() => void save()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Type pill row */}
          <View style={styles.pillBlock}>
            <Text
              variant="caption2"
              color="tertiary"
              style={[styles.pillBlockLabel, { letterSpacing: 0.5 }]}
            >
              TYPE
            </Text>
            <View style={styles.pillRow}>
              {KIND_OPTIONS.map((k) => {
                const sel = kind === k.key;
                const isExpense = k.key === 'expense';
                const tone = sel
                  ? (isExpense ? t.palette.red.base : t.palette.green.base)
                  : t.colors.secondary;
                const bg = sel
                  ? (isExpense
                      ? (t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft)
                      : (t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft))
                  : t.colors.fill3;
                return (
                  <Pressable
                    key={k.key}
                    onPress={() => setKind(k.key)}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.pillChip,
                      {
                        backgroundColor: bg,
                        borderRadius: t.radii.pill,
                        borderColor: sel ? tone + '33' : 'transparent',
                        borderWidth: sel ? 1 : 0,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View style={[styles.pillDot, { backgroundColor: tone }]} />
                    <Text
                      variant="footnote"
                      style={{
                        color: tone,
                        fontWeight: sel ? '700' : '500',
                        marginLeft: 5,
                      }}
                    >
                      {k.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Details */}
          <FormGroup header="Details">
            <Row
              label="Category"
              value={categoryLabel}
              chevron
              onPress={() => setShowCategoryPick(true)}
            />
            {isSalary ? (
              <Row
                label="Team member"
                value={payee || 'Pick a member'}
                chevron
                onPress={() => setShowMemberPick(true)}
              />
            ) : (
              <InputRow
                label="Payee"
                value={payee}
                onChangeText={(v) => {
                  setPayee(v);
                  setPayeeUid(null);
                }}
                placeholder="Vendor name"
                autoCapitalize="words"
              />
            )}
            <InputRow
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              placeholder="₹0"
              keyboardType="decimal-pad"
              autoCapitalize="none"
            />
            <Row
              label="Paid on"
              value={fmtDate(paidAt)}
              chevron
              onPress={() => setShowDate(true)}
              divider={false}
            />
          </FormGroup>

          {/* Payment */}
          <FormGroup header="Payment">
            <View style={styles.methodRowBlock}>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12 }}
              >
                METHOD
              </Text>
              <View style={[styles.pillRow, { paddingHorizontal: 12, paddingVertical: 10 }]}>
                {PAY_METHODS.map((m) => {
                  const sel = method === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => setMethod(m.key)}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.pillChip,
                        {
                          backgroundColor: sel
                            ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                            : t.colors.fill3,
                          borderRadius: t.radii.pill,
                          borderColor: sel ? t.palette.blue.base + '33' : 'transparent',
                          borderWidth: sel ? 1 : 0,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Text
                        variant="footnote"
                        style={{
                          color: sel ? t.palette.blue.base : t.colors.secondary,
                          fontWeight: sel ? '700' : '500',
                        }}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View
                style={[
                  styles.methodDivider,
                  { backgroundColor: t.colors.separator },
                ]}
              />
            </View>
            <InputRow
              label="Note"
              value={note}
              onChangeText={setNote}
              placeholder="Optional"
              multiline
              divider={false}
            />
          </FormGroup>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category picker */}
      <SelectSheet
        open={showCategoryPick}
        title="Category"
        options={ORG_FINANCE_CATEGORIES}
        selected={category}
        onPick={(k) => {
          setCategory(k as OrgFinanceCategory);
          if (k !== 'salary') {
            setPayeeUid(null);
          }
        }}
        onClose={() => setShowCategoryPick(false)}
      />

      {/* Team member picker (only relevant when category === salary) */}
      <SelectSheet
        open={showMemberPick}
        title="Team member"
        options={members.map((m) => ({ key: m.uid, label: m.displayName }))}
        selected={payeeUid ?? undefined}
        onPick={(uid) => {
          const m = members.find((x) => x.uid === uid);
          if (m) {
            setPayeeUid(m.uid);
            setPayee(m.displayName);
          }
        }}
        onClose={() => setShowMemberPick(false)}
      />

      {/* Date picker — bottom sheet with Done */}
      <DateTimeSheet
        open={showDate}
        value={paidAt}
        onChange={setPaidAt}
        onClose={() => setShowDate(false)}
        mode="date"
        title="Paid on"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: 8, paddingBottom: 60 },

  // Type pill row block
  pillBlock: {
    paddingTop: 16,
    paddingBottom: 4,
  },
  pillBlockLabel: {
    paddingHorizontal: 32,
    paddingBottom: 8,
  },
  pillRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 7,
  },
  pillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Method row inside Payment FormGroup
  methodRowBlock: {
    paddingBottom: 0,
  },
  methodDivider: {
    height: 0.5,
    marginLeft: 16,
  },
});
