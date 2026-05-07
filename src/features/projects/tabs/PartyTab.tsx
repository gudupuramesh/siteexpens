/**
 * Project Party tab — compact team-members chip at top, then full party list
 * with running balances. Tapping the team chip navigates to the dedicated
 * Team Members page where invite/role logic lives.
 */
import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePendingInvites } from '@/src/features/org/usePendingInvites';
import { useProjectMembers, type ProjectMember } from '@/src/features/projects/useProjectMembers';
import { useProjectParties } from '@/src/features/parties/useProjectParties';
import { getPartyTypeLabel } from '@/src/features/parties/types';
import type { Party } from '@/src/features/parties/types';
import { normalizeTransactionType } from '@/src/features/transactions/types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { formatInr } from '@/src/lib/format';
import { formatIndianPhone } from '@/src/lib/phone';
import { Text } from '@/src/ui/Text';
import { color, screenInset, space } from '@/src/theme';

const AVATAR_COLORS = [color.primary, '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
const MAX_VISIBLE_AVATARS = 3;

type PartyBalance = {
  totalIn: number;
  totalOut: number;
  balance: number;
  txnCount: number;
};

export function PartyTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';

  const { members } = useProjectMembers(projectId);
  const { parties, loading: partiesLoading } = useProjectParties(orgId, projectId);
  const { data: transactions, loading: txnsLoading } = useTransactions(projectId);
  const { data: pending } = usePendingInvites(orgId || null);

  const memberPhoneSet = new Set(
    members.map((m) => m.phoneNumber).filter((p): p is string => !!p),
  );
  const pendingCount = pending.filter(
    (p) =>
      !memberPhoneSet.has(p.phoneNumber) &&
      (p.projectIds.includes(projectId ?? '') || p.projectId === projectId),
  ).length;

  const totalTeamCount = members.length + pendingCount;

  const balanceByPartyId = useMemo(() => {
    const map = new Map<string, PartyBalance>();
    for (const t of transactions) {
      const key = t.partyId;
      if (!key) continue;
      const entry = map.get(key) ?? { totalIn: 0, totalOut: 0, balance: 0, txnCount: 0 };
      const isIn = normalizeTransactionType(t.type) === 'payment_in';
      if (isIn) entry.totalIn += t.amount;
      else entry.totalOut += t.amount;
      entry.balance = entry.totalIn - entry.totalOut;
      entry.txnCount += 1;
      map.set(key, entry);
    }
    return map;
  }, [transactions]);

  let totalAdvancePaid = 0;
  let totalToReceive = 0;
  for (const b of balanceByPartyId.values()) {
    totalAdvancePaid += b.totalOut;
    if (b.balance > 0) totalToReceive += b.balance;
  }

  const sortedParties = useMemo(
    () => [...parties].sort((a, b) => a.name.localeCompare(b.name)),
    [parties],
  );

  const anyContent = members.length > 0 || sortedParties.length > 0;
  const isLoading = partiesLoading || txnsLoading;

  const renderParty = ({ item }: { item: Party }) => {
    const balance = balanceByPartyId.get(item.id) ?? null;
    const initial = item.name.charAt(0).toUpperCase() || '?';
    const phoneDisplay = formatIndianPhone(item.phone);
    return (
      <Pressable
        onPress={() =>
          router.push(
            `/(app)/party/${item.id}?projectId=${projectId ?? ''}` as never,
          )
        }
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.78 }]}
      >
        <View style={styles.avatar}>
          <Text variant="metaStrong" style={{ color: color.primary }}>
            {initial}
          </Text>
        </View>
        <View style={styles.body}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>
            {item.name}
          </Text>
          <Text variant="meta" color="textMuted" numberOfLines={1}>
            {getPartyTypeLabel(item.partyType)}
            {phoneDisplay ? ` · ${phoneDisplay}` : ''}
            {balance ? ` · ${balance.txnCount} txn${balance.txnCount !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        {balance ? (
          <View style={styles.trailing}>
            <Text
              variant="metaStrong"
              style={{ color: balance.balance >= 0 ? color.success : color.danger }}
            >
              {formatInr(Math.abs(balance.balance))}
            </Text>
            <Text variant="caption" color="textMuted">
              {balance.balance >= 0 ? 'To Receive' : 'To Pay'}
            </Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Compact team chip */}
      {totalTeamCount > 0 && (
        <Pressable
          onPress={() => router.push(`/(app)/projects/${projectId}/members` as never)}
          style={({ pressed }) => [styles.teamChip, pressed && { opacity: 0.82 }]}
        >
          <View style={styles.avatarStack}>
            {members.slice(0, MAX_VISIBLE_AVATARS).map((m, i) => {
              const initial = m.displayName.charAt(0).toUpperCase() || '?';
              const bg = AVATAR_COLORS[m.uid.charCodeAt(0) % AVATAR_COLORS.length];
              return (
                <View
                  key={m.uid}
                  style={[
                    styles.stackAvatar,
                    { backgroundColor: bg, zIndex: MAX_VISIBLE_AVATARS - i },
                    i > 0 && { marginLeft: -8 },
                  ]}
                >
                  <Text variant="metaStrong" style={{ color: '#fff', fontSize: 11 }}>
                    {initial}
                  </Text>
                </View>
              );
            })}
            {totalTeamCount > MAX_VISIBLE_AVATARS && (
              <View style={[styles.overflowCircle, { marginLeft: -8, zIndex: 0 }]}>
                <Text variant="metaStrong" color="textMuted" style={{ fontSize: 10 }}>
                  +{totalTeamCount - MAX_VISIBLE_AVATARS}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.body}>
            <Text variant="rowTitle" color="text">
              {totalTeamCount} {totalTeamCount === 1 ? 'member' : 'members'}
            </Text>
            <Text variant="meta" color="textMuted">
              Tap to view team
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
        </Pressable>
      )}

      {/* Summary bar */}
      {balanceByPartyId.size > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryCell}>
            <Text variant="caption" color="textMuted">ADVANCE PAID</Text>
            <Text variant="metaStrong" style={{ color: color.danger }}>
              {formatInr(totalAdvancePaid)}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryCell}>
            <Text variant="caption" color="textMuted">TO RECEIVE</Text>
            <Text variant="metaStrong" style={{ color: color.success }}>
              {formatInr(totalToReceive)}
            </Text>
          </View>
        </View>
      )}

      {/* Parties list */}
      {isLoading && !anyContent ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : sortedParties.length === 0 && members.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
            No parties yet
          </Text>
          <Text variant="meta" color="textMuted" align="center">
            Parties and team members show up here once they&apos;re linked to this
            project via tasks, attendance, or transactions.
          </Text>
        </View>
      ) : sortedParties.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text variant="caption" color="textMuted">
              PARTIES · {sortedParties.length}
            </Text>
          </View>
          <FlatList
            data={sortedParties}
            keyExtractor={(item) => item.id}
            renderItem={renderParty}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.separator,
    borderRadius: 10,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    gap: space.sm,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: color.surface,
  },
  overflowCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.bgGrouped,
    borderWidth: 2,
    borderColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.separator,
    overflow: 'hidden',
    paddingHorizontal: screenInset,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },
  sectionHeader: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.xs,
    backgroundColor: color.bgGrouped,
  },
  listContent: {
    paddingHorizontal: screenInset,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.separator,
    borderRadius: 10,
    marginBottom: space.xs,
    gap: space.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 2,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },
  emptyTitle: { marginTop: space.xxs },
});
