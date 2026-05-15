/**
 * Party tab — v2 design.
 *
 * Layout:
 *   1. Team chip — overlapping avatars + member count, taps to /members
 *   2. KPI strip — Advance paid · To receive (when transactions exist)
 *   3. Parties list — surface card per party with avatar + name/type/phone +
 *      running balance pill on the right (To Receive / To Pay)
 */
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePendingInvites } from '@/src/features/org/usePendingInvites';
import { useProjectMembers } from '@/src/features/projects/useProjectMembers';
import { useProjectParties } from '@/src/features/parties/useProjectParties';
import { getPartyTypeLabel } from '@/src/features/parties/types';
import type { Party } from '@/src/features/parties/types';
import { normalizeTransactionType } from '@/src/features/transactions/types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { formatInr } from '@/src/lib/format';
import { formatIndianPhone } from '@/src/lib/phone';

import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

const MAX_VISIBLE_AVATARS = 3;

type PartyBalance = {
  totalIn: number;
  totalOut: number;
  balance: number;
  txnCount: number;
};

export function PartyTab() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
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
      !memberPhoneSet.has(p.phoneNumber)
      && (p.projectIds.includes(projectId ?? '') || p.projectId === projectId),
  ).length;

  const totalTeamCount = members.length + pendingCount;

  const balanceByPartyId = useMemo(() => {
    const map = new Map<string, PartyBalance>();
    for (const tx of transactions) {
      const key = tx.partyId;
      if (!key) continue;
      const entry = map.get(key) ?? { totalIn: 0, totalOut: 0, balance: 0, txnCount: 0 };
      const isIn = normalizeTransactionType(tx.type) === 'payment_in';
      if (isIn) entry.totalIn += tx.amount;
      else entry.totalOut += tx.amount;
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

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  // Avatar tint — neutral. Per the app-wide colour discipline, party
  // identity colour was decorative (categorical hash by uid). Now every
  // avatar uses the same neutral grey (`fill3` bg + `secondary` glyph,
  // applied directly at the call site below); the initial letter still
  // differentiates rows visually.

  const renderParty = ({ item }: { item: Party }) => {
    const balance = balanceByPartyId.get(item.id) ?? null;
    const initial = item.name.charAt(0).toUpperCase() || '?';
    const phoneDisplay = formatIndianPhone(item.phone);
    return (
      <Pressable
        onPress={() =>
          router.push(`/(app)/party/${item.id}?projectId=${projectId ?? ''}` as never)
        }
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.card,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View
          style={[
            styles.avatar,
            {
              backgroundColor:
                t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
            },
          ]}
        >
          <Text
            variant="footnote"
            style={{ color: t.palette.blue.base, fontWeight: '700' }}
          >
            {initial}
          </Text>
        </View>
        <View style={styles.body}>
          <Text
            variant="callout"
            color="label"
           
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text variant="caption1" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
            {getPartyTypeLabel(item.partyType)}
            {phoneDisplay ? ` · ${phoneDisplay}` : ''}
            {balance ? ` · ${balance.txnCount} txn${balance.txnCount !== 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        {balance ? (
          <View style={styles.trailing}>
            <Text
              variant="footnote"
              style={{
                // 90/10 discipline: positive balance ("TO RECEIVE") goes
                // neutral — the label tells you. Negative balance keeps red
                // because the studio actually owes the party (a problem to
                // act on).
                color: balance.balance < 0 ? t.palette.red.base : t.colors.label,
                fontWeight: '600',
                fontVariant: ['tabular-nums'],
              }}
              numberOfLines={1}
            >
              {formatInr(Math.abs(balance.balance))}
            </Text>
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.4, marginTop: 1 }}
            >
              {balance.balance >= 0 ? 'TO RECEIVE' : 'TO PAY'}
            </Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Team chip */}
      {totalTeamCount > 0 ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Pressable
            onPress={() => router.push(`/(app)/projects/${projectId}/members` as never)}
            style={({ pressed }) => [
              styles.teamChip,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.card,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={styles.avatarStack}>
              {members.slice(0, MAX_VISIBLE_AVATARS).map((m, i) => {
                const initial = m.displayName.charAt(0).toUpperCase() || '?';
                return (
                  <View
                    key={m.uid}
                    style={[
                      styles.stackAvatar,
                      {
                        backgroundColor: t.colors.fill3,
                        borderColor: cardBg,
                        zIndex: MAX_VISIBLE_AVATARS - i,
                      },
                      i > 0 && { marginLeft: -8 },
                    ]}
                  >
                    <Text
                      variant="caption2"
                      style={{ color: t.colors.secondary, fontWeight: '700' }}
                    >
                      {initial}
                    </Text>
                  </View>
                );
              })}
              {totalTeamCount > MAX_VISIBLE_AVATARS ? (
                <View
                  style={[
                    styles.overflowCircle,
                    {
                      backgroundColor: t.colors.fill3,
                      borderColor: cardBg,
                      marginLeft: -8,
                    },
                  ]}
                >
                  <Text variant="caption2" color="secondary" style={{ fontWeight: '700' }}>
                    +{totalTeamCount - MAX_VISIBLE_AVATARS}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.body}>
              <Text variant="callout" color="label" style={{ fontWeight: '700' }}>
                {totalTeamCount} {totalTeamCount === 1 ? 'member' : 'members'}
              </Text>
              <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                Tap to view team
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
          </Pressable>
        </View>
      ) : null}

      {/* KPI strip — neutral tones (90/10 discipline). The labels tell the
          user what each value is; numbers don't need colour to be read. */}
      {balanceByPartyId.size > 0 ? (
        <View style={styles.kpiRow}>
          <KpiTile label="ADVANCE PAID" value={formatInr(totalAdvancePaid)} />
          <KpiTile label="TO RECEIVE" value={formatInr(totalToReceive)} />
        </View>
      ) : null}

      {/* List */}
      {isLoading && !anyContent ? (
        <View style={styles.empty}>
          <Text variant="footnote" color="secondary">Loading…</Text>
        </View>
      ) : sortedParties.length === 0 && members.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={32} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
            No parties yet
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
          >
            Parties and team members show up here once they're linked to this
            project via tasks, attendance, or transactions.
          </Text>
        </View>
      ) : sortedParties.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.5 }}
            >
              {`PARTIES · ${sortedParties.length}`}
            </Text>
          </View>
          <FlatList
            data={sortedParties}
            keyExtractor={(item) => item.id}
            renderItem={renderParty}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl {...refresh.props} />}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * KPI metric tile — neutral by design (90/10 colour discipline).
 * `tone` and `bg` props are accepted for back-compat but ignored.
 */
function KpiTile({
  label,
  value,
}: {
  label: string;
  value: string;
  /** @deprecated value renders in neutral label colour. */
  tone?: string;
  /** @deprecated dot renders with neutral fill3 background. */
  bg?: string;
}) {
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.kpiTile,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
      ]}
    >
      <View style={[styles.kpiDot, { backgroundColor: t.colors.fill3 }]}>
        <View style={[styles.kpiDotInner, { backgroundColor: t.colors.tertiary }]} />
      </View>
      <View style={styles.kpiText}>
        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4, fontSize: 9 }}>
          {label}
        </Text>
        <Text
          variant="footnote"
          color="label"
          style={{
            fontWeight: '600',
            fontVariant: ['tabular-nums'],
            marginTop: 1,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
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
  },
  overflowCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // KPI strip
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  kpiTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  kpiDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  kpiText: {
    flex: 1,
    minWidth: 0,
  },

  sectionHeader: {
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    alignItems: 'flex-end',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
