import { FlatList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

import { useTransactions } from '@/src/features/transactions/useTransactions';
import { normalizeTransactionType } from '@/src/features/transactions/types';
import { formatInr } from '@/src/lib/format';
import { Text } from '@/src/ui/Text';
import { Separator } from '@/src/ui/Separator';
import { color, screenInset, space } from '@/src/theme';

type PartyAggregate = {
  name: string;
  totalIn: number;
  totalOut: number;
  balance: number;
  txnCount: number;
};

export function PartyTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { data: transactions, loading } = useTransactions(projectId);

  // Derive unique parties from transactions
  const parties: PartyAggregate[] = [];
  if (transactions.length > 0) {
    const map = new Map<string, PartyAggregate>();
    for (const t of transactions) {
      const key = t.partyName || 'Others';
      const existing = map.get(key);
      const isIn = normalizeTransactionType(t.type) === 'payment_in';
      if (existing) {
        if (isIn) existing.totalIn += t.amount;
        else existing.totalOut += t.amount;
        existing.balance = existing.totalIn - existing.totalOut;
        existing.txnCount += 1;
      } else {
        map.set(key, {
          name: key,
          totalIn: isIn ? t.amount : 0,
          totalOut: isIn ? 0 : t.amount,
          balance: isIn ? t.amount : -t.amount,
          txnCount: 1,
        });
      }
    }
    parties.push(...Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
  }

  // Compute totals
  const totalAdvancePaid = parties.reduce((s, p) => s + p.totalOut, 0);
  const totalPending = parties.reduce((s, p) => s + Math.max(0, p.balance), 0);

  const renderItem = ({ item }: { item: PartyAggregate }) => {
    const initial = item.name.charAt(0).toUpperCase();
    return (
      <View style={styles.partyRow}>
        <View style={styles.avatar}>
          <Text variant="metaStrong" style={{ color: color.primary }}>{initial}</Text>
        </View>
        <View style={styles.partyBody}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>{item.name}</Text>
          <Text variant="meta" color="textMuted">
            {item.txnCount} transaction{item.txnCount !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.partyTrailing}>
          <Text
            variant="metaStrong"
            style={{ color: item.balance >= 0 ? color.success : color.danger }}
          >
            {formatInr(Math.abs(item.balance))}
          </Text>
          <Text variant="caption" color="textMuted">
            {item.balance >= 0 ? 'To Receive' : 'To Pay'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {parties.length > 0 && (
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
              {formatInr(totalPending)}
            </Text>
          </View>
        </View>
      )}

      {loading && transactions.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : parties.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
            No parties yet
          </Text>
          <Text variant="meta" color="textMuted" align="center">
            Parties will appear here once you add transactions with party names.
          </Text>
        </View>
      ) : (
        <FlatList
          data={parties}
          keyExtractor={(item) => item.name}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    paddingVertical: space.sm,
    paddingHorizontal: screenInset,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },
  listContent: {
    paddingBottom: 40,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
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
  partyBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  partyTrailing: {
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
