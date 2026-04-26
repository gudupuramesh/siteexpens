/**
 * Transaction detail — read-only preview.
 * Shows all fields of a transaction with an Edit pencil in the top-right that
 * routes to the edit-transaction screen.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { useProject } from '@/src/features/projects/useProject';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import {
  getCategoryLabel,
  getPaymentMethodLabel,
  normalizeTransactionType,
  PAYMENT_METHODS,
} from '@/src/features/transactions/types';
import { formatDate, formatInr } from '@/src/lib/format';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

const STATUS_CFG: Record<string, { bg: string; fg: string; label: string }> = {
  paid: { bg: color.successSoft, fg: color.success, label: 'Paid' },
  pending: { bg: color.warningSoft, fg: color.warning, label: 'Pending' },
  partial: { bg: color.dangerSoft, fg: color.danger, label: 'Partial' },
};

export default function TransactionDetailScreen() {
  const { id: projectId, txnId } = useLocalSearchParams<{ id: string; txnId: string }>();
  const { user } = useAuth();
  const { data: project } = useProject(projectId);
  const { data, loading } = useTransactions(projectId);

  const txn = useMemo(() => data.find((t) => t.id === txnId), [data, txnId]);

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

  const txnType = normalizeTransactionType(txn.type);
  const isIn = txnType === 'payment_in';
  const statusCfg = STATUS_CFG[txn.status] ?? STATUS_CFG.paid;
  const pmMeta = txn.paymentMethod
    ? PAYMENT_METHODS.find((m) => m.key === txn.paymentMethod)
    : null;
  const addedByOwner = !!project?.ownerId && txn.createdBy === project.ownerId;
  const addedBySelf = !!user?.uid && txn.createdBy === user.uid;
  const addedByLabel = addedByOwner ? 'Owner' : addedBySelf ? 'You' : 'Team member';
  const approvedLabel = addedByOwner ? 'Auto Approved' : 'Approved';

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
            <Ionicons name="shield-checkmark-outline" size={14} color={color.success} />
            <Text variant="caption" style={styles.approvalText}>
              {approvedLabel}
            </Text>
          </View>
          <Text variant="caption" color="textMuted">
            Added by {addedByLabel}
          </Text>
        </View>

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

        {/* Bill photo */}
        {!!txn.photoUrl && (
          <View style={styles.card}>
            <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
              BILL / RECEIPT
            </Text>
            <Image source={{ uri: txn.photoUrl }} style={styles.photo} />
          </View>
        )}

        <View style={{ height: space.xl }} />
      </ScrollView>
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
  },
  approvalBar: {
    marginTop: 4,
    marginBottom: 6,
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
  },
  approvalText: {
    color: color.success,
    letterSpacing: 0.5,
  },
  statusPill: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.none,
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
    borderRadius: radius.none,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
});
