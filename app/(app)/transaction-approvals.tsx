/**
 * Org-wide transaction-approvals inbox — surfaces every transaction
 * that a supervisor or site engineer has submitted (`workflowStatus
 * === 'pending_approval'`) and is waiting for an admin to review.
 *
 * Mounted from the home tab Summary card's "APPROVALS" cell tap.
 *
 * Source: `useProjectTotals(orgId).transactions` — already
 * role-scoped (admins see everything in their org; restricted roles
 * see only what their access permits). We re-filter to
 * `pending_approval` here so the count on the home cell stays in
 * lock-step with the row count on this screen.
 *
 * Each row shows: direction icon · description · party · project ·
 * amount (color-coded by direction). Tap → routes to the existing
 * per-project transaction detail (`/(app)/projects/[id]/transaction/
 * [txnId]`) which already houses the Approve / Reject UI for admins.
 *
 * Read-only — the actual approve / reject action stays on the detail
 * screen so we don't duplicate the existing settlement + reject-note
 * workflow logic here.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useProjects } from '@/src/features/projects/useProjects';
import {
  normalizeTransactionType,
  type Transaction,
} from '@/src/features/transactions/types';
import { useProjectTotals } from '@/src/features/transactions/useProjectTotals';
import { formatInr } from '@/src/lib/format';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

// ── Helpers ─────────────────────────────────────────────────────────

function formatSubmittedAgo(d: Date | null | undefined, now: number): string {
  if (!d) return '—';
  const diffMs = now - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ── Screen ──────────────────────────────────────────────────────────

export default function TransactionApprovalsScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;

  const { transactions, loading } = useProjectTotals(orgId);
  const { data: projects } = useProjects();

  const projectName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  // Pending-approval rows, freshest submission first so the most
  // recently-submitted requests are on top.
  const pending = useMemo(() => {
    const list = transactions.filter(
      (tx) => tx.workflowStatus === 'pending_approval',
    );
    list.sort((a, b) => {
      const at = a.submittedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
      const bt = b.submittedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
      return bt - at;
    });
    return list;
  }, [transactions]);

  const now = Date.now();

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header */}
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
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.headerSideBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={t.colors.label} />
        </Pressable>

        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text
            variant="headline"
            color="label"
            style={{ fontWeight: '700' }}
            numberOfLines={1}
          >
            Approvals
          </Text>
          <Text variant="caption2" color="secondary" numberOfLines={1}>
            {loading
              ? 'Loading…'
              : pending.length === 0
                ? 'All caught up'
                : `${pending.length} awaiting review`}
          </Text>
        </View>

        <View style={styles.headerSideBtn} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      ) : pending.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 24,
            gap: 8,
          }}
          renderItem={({ item }) => (
            <ApprovalRow
              tx={item}
              projectName={projectName.get(item.projectId) ?? item.projectId}
              now={now}
            />
          )}
        />
      )}
    </View>
  );
}

// ── Row ────────────────────────────────────────────────────────────

function ApprovalRow({
  tx,
  projectName,
  now,
}: {
  tx: Transaction;
  projectName: string;
  now: number;
}) {
  const t = useThemeV2();
  const direction = normalizeTransactionType(tx.type);
  const isIn = direction === 'payment_in';
  const submittedAt = tx.submittedAt?.toDate?.() ?? tx.createdAt?.toDate?.() ?? null;
  const ago = formatSubmittedAgo(submittedAt, now);

  // Color the amount + direction icon by sign so admins can scan
  // "money in" vs "money out" at a glance — same vocabulary the
  // hero card uses for IN / OUT.
  const amountColor = isIn ? t.palette.green.base : t.palette.red.base;
  const tileBg = isIn
    ? t.mode === 'dark'
      ? t.palette.green.softDark
      : t.palette.green.soft
    : t.mode === 'dark'
      ? t.palette.red.softDark
      : t.palette.red.soft;

  return (
    <Pressable
      onPress={() =>
        router.push(
          `/(app)/projects/${tx.projectId}/transaction/${tx.id}` as never,
        )
      }
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${isIn ? 'Payment in' : 'Payment out'}, ${tx.partyName || tx.description || 'transaction'}, ${formatInr(tx.amount)}, ${projectName}`}
    >
      {/* Direction tile */}
      <View
        style={[
          styles.dirTile,
          {
            backgroundColor: tileBg,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Ionicons
          name={isIn ? 'arrow-down' : 'arrow-up'}
          size={16}
          color={amountColor}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="callout"
          color="label"
          style={{ fontWeight: '600' }}
          numberOfLines={1}
        >
          {tx.description || tx.partyName || (isIn ? 'Payment in' : 'Payment out')}
        </Text>
        <Text
          variant="caption1"
          color="secondary"
          style={{ marginTop: 2 }}
          numberOfLines={1}
        >
          {projectName}
          {tx.partyName ? `  ·  ${tx.partyName}` : ''}
          {`  ·  ${ago}`}
        </Text>
      </View>

      <Text
        variant="callout"
        style={{
          color: amountColor,
          fontWeight: '700',
          fontVariant: ['tabular-nums'],
        }}
        numberOfLines={1}
      >
        {isIn ? '+' : '−'}
        {formatInr(tx.amount)}
      </Text>
    </Pressable>
  );
}

// ── Empty ──────────────────────────────────────────────────────────

function EmptyState() {
  const t = useThemeV2();
  return (
    <View style={styles.emptyWrap}>
      <View
        style={[
          styles.emptyTile,
          {
            backgroundColor:
              t.mode === 'dark'
                ? t.palette.green.softDark
                : t.palette.green.soft,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Ionicons
          name="checkmark-done-outline"
          size={28}
          color={t.palette.green.base}
        />
      </View>
      <Text
        variant="title3"
        color="label"
        style={{ marginTop: 14, fontWeight: '700' }}
      >
        Nothing to review
      </Text>
      <Text
        variant="caption1"
        color="secondary"
        style={{ marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }}
      >
        When your team submits transactions for approval, they'll appear here.
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  headerSideBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  dirTile: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
  },
  emptyTile: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
