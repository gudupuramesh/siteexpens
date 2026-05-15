/**
 * Finance entry — view / edit / delete a single org finance row (v2).
 *
 * Layout:
 *   1. SheetHeader (Cancel · "Finance entry" · Save)
 *   2. AmbientBackground
 *   3. FormGroup "Type" — Expense / Income tone-tinted pill row
 *   4. FormGroup "Category" — chip rail (Salary / Rent / etc.)
 *   5. FormGroup "Details" — Payee · Amount · Paid on (DateTimeSheet)
 *   6. FormGroup "Method" — Cash / Bank / UPI / Card pill row
 *   7. FormGroup "Note" — multiline InputRow
 *   8. Red.soft "Delete entry" button at the bottom (writers only)
 *
 * Permission: gated behind `finance.read` for view; mutations need
 * `finance.write`. Direct URL hits without read render a friendly
 * access-denied state.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const PAY_METHODS: { key: OrgFinancePaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
  { key: 'bank', label: 'Bank', icon: 'business-outline' },
  { key: 'upi', label: 'UPI', icon: 'qr-code-outline' },
  { key: 'card', label: 'Card', icon: 'card-outline' },
];

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function OrgFinanceDetailScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
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
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Finance entry"
          cancelLabel="Back"
          saveLabel=""
          saveDisabled
          onCancel={() => router.back()}
          onSave={() => {}}
        />
        <View style={styles.emptyBox}>
          <View
            style={[
              styles.emptyIcon,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                borderRadius: t.radii.tile + 4,
              },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={28} color={t.palette.orange.base} />
          </View>
          <Text variant="title3" color="label" style={{ marginTop: 14, fontWeight: '700' }}>
            No access
          </Text>
          <Text
            variant="callout"
            color="secondary"
            style={{ marginTop: 6, textAlign: 'center', maxWidth: 320 }}
          >
            You don't have permission to view this entry. Ask a Super Admin or
            Admin to grant you the Accountant role.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Finance entry"
          cancelLabel="Cancel"
          saveLabel="Save"
          saveDisabled
          onCancel={() => router.back()}
          onSave={() => {}}
        />
        <View style={styles.emptyBox}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Finance entry"
          cancelLabel="Back"
          saveLabel=""
          saveDisabled
          onCancel={() => router.back()}
          onSave={() => {}}
        />
        <View style={styles.emptyBox}>
          <Text variant="callout" color="secondary">
            Entry not found
          </Text>
        </View>
      </View>
    );
  }

  const isExpense = kind === 'expense';
  const kindTone = isExpense ? t.palette.red : t.palette.green;
  const incomeTone = t.palette.green;
  const expenseTone = t.palette.red;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="Finance entry"
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={busy}
        saveDisabled={!canWrite}
        onCancel={() => router.back()}
        onSave={() => void save()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Type */}
          <Text
            variant="caption2"
            color="secondary"
            style={{
              paddingHorizontal: 32,
              paddingTop: 18,
              paddingBottom: 8,
              letterSpacing: 0.4,
            }}
          >
            TYPE
          </Text>
          <View style={styles.kindRow}>
            <KindPill
              active={isExpense}
              tone={expenseTone}
              icon="arrow-up-circle"
              label="Expense"
              sub="Money out"
              onPress={() => canWrite && setKind('expense')}
              disabled={!canWrite}
            />
            <KindPill
              active={!isExpense}
              tone={incomeTone}
              icon="arrow-down-circle"
              label="Income"
              sub="Money in"
              onPress={() => canWrite && setKind('income')}
              disabled={!canWrite}
            />
          </View>

          {/* Category */}
          <Text
            variant="caption2"
            color="secondary"
            style={{
              paddingHorizontal: 32,
              paddingTop: 24,
              paddingBottom: 8,
              letterSpacing: 0.4,
            }}
          >
            CATEGORY
          </Text>
          <View style={styles.chipGrid}>
            {ORG_FINANCE_CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  disabled={!canWrite}
                  onPress={() => setCategory(c.key)}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: active
                        ? t.mode === 'dark'
                          ? t.palette.blue.softDark
                          : t.palette.blue.soft
                        : t.colors.fill3,
                      borderRadius: 999,
                      borderColor: active ? t.palette.blue.base + '55' : 'transparent',
                      borderWidth: active ? 1 : 0,
                    },
                    pressed && { opacity: 0.85 },
                    !canWrite && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="footnote"
                    style={{
                      color: active ? t.palette.blue.base : t.colors.label,
                      fontWeight: active ? '700' : '500',
                    }}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Details */}
          <FormGroup header="Details">
            <InputRow
              label="Payee"
              value={payee}
              onChangeText={setPayee}
              placeholder="e.g. Ramesh"
              autoCapitalize="words"
            />
            <InputRow
              label={`Amount (₹)`}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
            />
            <Row
              label="Paid on"
              value={formatDateLong(paidAt)}
              chevron
              onPress={() => canWrite && setShowDate(true)}
              divider={false}
            />
          </FormGroup>

          {/* Method */}
          <Text
            variant="caption2"
            color="secondary"
            style={{
              paddingHorizontal: 32,
              paddingTop: 24,
              paddingBottom: 8,
              letterSpacing: 0.4,
            }}
          >
            METHOD
          </Text>
          <View style={styles.chipGrid}>
            {PAY_METHODS.map((m) => {
              const active = method === m.key;
              return (
                <Pressable
                  key={m.key}
                  disabled={!canWrite}
                  onPress={() => setMethod(m.key)}
                  style={({ pressed }) => [
                    styles.methodChip,
                    {
                      backgroundColor: active
                        ? t.mode === 'dark'
                          ? t.palette.blue.softDark
                          : t.palette.blue.soft
                        : t.colors.fill3,
                      borderRadius: 999,
                      borderColor: active ? t.palette.blue.base + '55' : 'transparent',
                      borderWidth: active ? 1 : 0,
                    },
                    pressed && { opacity: 0.85 },
                    !canWrite && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons
                    name={m.icon}
                    size={14}
                    color={active ? t.palette.blue.base : t.colors.tertiary}
                  />
                  <Text
                    variant="footnote"
                    style={{
                      color: active ? t.palette.blue.base : t.colors.label,
                      fontWeight: active ? '700' : '500',
                      marginLeft: 6,
                    }}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Note */}
          <FormGroup header="Note">
            <InputRow
              label="Memo"
              value={note}
              onChangeText={setNote}
              placeholder="Optional"
              multiline
              divider={false}
            />
          </FormGroup>

          {/* Delete (writers only) */}
          {canWrite ? (
            <View style={{ paddingHorizontal: 16, marginTop: 32 }}>
              <Pressable
                onPress={remove}
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
                  variant="callout"
                  style={{
                    color: t.palette.red.base,
                    fontWeight: '700',
                    marginLeft: 8,
                  }}
                >
                  Delete entry
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* tone hint — silence the unused-var warning when canWrite is false */}
          <View style={{ height: 0, opacity: 0 }} pointerEvents="none">
            <View style={{ backgroundColor: kindTone.base, height: 0 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker */}
      <DateTimeSheet
        open={showDate}
        value={paidAt}
        mode="date"
        title="Paid on"
        onChange={(d) => setPaidAt(d)}
        onClose={() => setShowDate(false)}
      />
    </View>
  );
}

function KindPill({
  active,
  tone,
  icon,
  label,
  sub,
  onPress,
  disabled,
}: {
  active: boolean;
  tone: { base: string; soft: string; softDark: string };
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.kindPill,
        {
          backgroundColor: active
            ? t.mode === 'dark'
              ? tone.softDark
              : tone.soft
            : t.colors.surface,
          borderRadius: t.radii.field,
          borderColor: active
            ? tone.base + '55'
            : t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: active ? 1.5 : t.hairline,
        },
        pressed && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.7 },
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? tone.base : t.colors.tertiary}
      />
      <View style={{ marginLeft: 8 }}>
        <Text
          variant="footnote"
          style={{
            color: active ? tone.base : t.colors.label,
            fontWeight: active ? '700' : '600',
          }}
        >
          {label}
        </Text>
        <Text
          variant="caption2"
          style={{
            color: active ? tone.base : t.colors.tertiary,
            marginTop: 1,
          }}
        >
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Kind selector
  kindRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  kindPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // Category + method chips
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  // Delete
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
});
