/**
 * Project Party tab — lists every party involved in this project (derived from
 * transactions + attendance + tasks) plus the app-user team members. Parties
 * with transactions show their running balance; parties brought in only via
 * attendance or task-assignment display their role instead.
 */
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useProjectMembers, type ProjectMember } from '@/src/features/projects/useProjectMembers';
import { useProjectParties } from '@/src/features/parties/useProjectParties';
import { getPartyTypeLabel } from '@/src/features/parties/types';
import type { Party } from '@/src/features/parties/types';
import { normalizeTransactionType } from '@/src/features/transactions/types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { formatInr } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { color, screenInset, space } from '@/src/theme';

type PartyBalance = {
  totalIn: number;
  totalOut: number;
  balance: number;
  txnCount: number;
};

type Row =
  | { kind: 'member'; member: ProjectMember }
  | { kind: 'party'; party: Party; balance: PartyBalance | null };

export function PartyTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';

  const { members } = useProjectMembers(projectId);
  const { parties, loading: partiesLoading } = useProjectParties(orgId, projectId);
  const { data: transactions, loading: txnsLoading } = useTransactions(projectId);

  // Aggregate balance per partyId
  const balanceByPartyId = new Map<string, PartyBalance>();
  for (const t of transactions) {
    const key = t.partyId;
    if (!key) continue;
    const entry = balanceByPartyId.get(key) ?? {
      totalIn: 0,
      totalOut: 0,
      balance: 0,
      txnCount: 0,
    };
    const isIn = normalizeTransactionType(t.type) === 'payment_in';
    if (isIn) entry.totalIn += t.amount;
    else entry.totalOut += t.amount;
    entry.balance = entry.totalIn - entry.totalOut;
    entry.txnCount += 1;
    balanceByPartyId.set(key, entry);
  }

  // Summary totals (across parties only — members don't have balances)
  let totalAdvancePaid = 0;
  let totalToReceive = 0;
  for (const b of balanceByPartyId.values()) {
    totalAdvancePaid += b.totalOut;
    if (b.balance > 0) totalToReceive += b.balance;
  }

  const sortedParties = [...parties].sort((a, b) => a.name.localeCompare(b.name));

  const sections: Array<{ title: string; data: Row[] }> = [];
  if (members.length > 0) {
    sections.push({
      title: 'Team',
      data: members.map((m) => ({ kind: 'member', member: m }) as Row),
    });
  }
  if (sortedParties.length > 0) {
    sections.push({
      title: 'Parties',
      data: sortedParties.map(
        (p) => ({ kind: 'party', party: p, balance: balanceByPartyId.get(p.id) ?? null }) as Row,
      ),
    });
  }

  const anyContent = members.length > 0 || sortedParties.length > 0;
  const isLoading = partiesLoading || txnsLoading;

  const renderItem = ({ item }: { item: Row }) => {
    if (item.kind === 'member') {
      const initial = item.member.displayName.charAt(0).toUpperCase() || '?';
      return (
        <View style={[styles.row, styles.rowStatic]}>
          <View style={[styles.avatar, styles.avatarMember]}>
            <Text variant="metaStrong" style={{ color: color.onPrimary }}>
              {initial}
            </Text>
          </View>
          <View style={styles.body}>
            <Text variant="rowTitle" color="text" numberOfLines={1}>
              {item.member.displayName}
            </Text>
            <Text variant="meta" color="textMuted">
              Team member
            </Text>
          </View>
          <View style={styles.memberBadge}>
            <Ionicons name="shield-checkmark-outline" size={14} color={color.primary} />
          </View>
        </View>
      );
    }

    const { party, balance } = item;
    const initial = party.name.charAt(0).toUpperCase() || '?';
    return (
      <Pressable
        onPress={() => router.push(`/(app)/party/${party.id}` as never)}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.78 }]}
      >
        <View style={styles.avatar}>
          <Text variant="metaStrong" style={{ color: color.primary }}>
            {initial}
          </Text>
        </View>
        <View style={styles.body}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>
            {party.name}
          </Text>
          <Text variant="meta" color="textMuted" numberOfLines={1}>
            {getPartyTypeLabel(party.partyType)}
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

      {isLoading && !anyContent ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : !anyContent ? (
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
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) =>
            item.kind === 'member' ? `m-${item.member.uid}` : `p-${item.party.id}-${index}`
          }
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text variant="caption" color="textMuted">
                {section.title.toUpperCase()} · {section.data.length}
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.separator,
    overflow: 'hidden',
    paddingVertical: 0,
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
  listContent: {
    paddingHorizontal: screenInset,
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 0,
    paddingTop: space.md,
    paddingBottom: space.xs,
    backgroundColor: color.bg,
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
  rowStatic: {
    opacity: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMember: {
    backgroundColor: color.primary,
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
  memberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
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
