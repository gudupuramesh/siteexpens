/**
 * Parties — firm-wide vendors, clients, staff and their balances.
 * Stack route opened from Settings (More) → not a bottom tab.
 *
 * Layout matches the rest of the app's vocabulary:
 *  - Custom nav header (chevron-back + "Parties" title + spacer)
 *  - Subtle 3-cell summary bar (Total / To Pay / To Receive) on a
 *    white canvas with a hairline border — replaces the heavy blue
 *    "PARTY BALANCES" hero brick that didn't match the rest of the
 *    app's design language.
 *  - Party rows render as ProjectRow-style elevated white cards
 *    instead of flush ledger strips.
 */
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { type Party, getPartyTypeLabel } from '@/src/features/parties/types';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, screenInset, space } from '@/src/theme';

function PartyRow({ item }: { item: Party }) {
  const initial = item.name.charAt(0).toUpperCase();
  const roleLabel = getPartyTypeLabel((item.partyType ?? item.role) as never);

  return (
    <Pressable
      onPress={() => router.push(`/(app)/party/${item.id}` as never)}
      style={({ pressed }) => [styles.partyRow, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.avatar}>
        <Text variant="metaStrong" style={{ color: color.primary }}>
          {initial}
        </Text>
      </View>
      <View style={styles.partyBody}>
        <Text variant="rowTitle" color="text" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="meta" color="textMuted" numberOfLines={1}>
          {roleLabel}
          {item.phone ? ` · ${item.phone}` : ''}
        </Text>
      </View>
      <View style={styles.roleBadge}>
        <Text variant="caption" style={{ color: color.primary }}>
          {roleLabel}
        </Text>
      </View>
    </Pressable>
  );
}

export default function PartiesScreen() {
  const insets = useSafeAreaInsets();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: parties, loading } = useParties(orgId);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)' as never);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom nav header — matches subscription.tsx /
          select-company.tsx / party detail. iOS 26's stock back
          button gets enlarged into a Liquid Glass pill that
          sometimes refuses taps; rolling our own keeps it
          predictable. */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={color.primary} />
          <Text variant="body" color="primary">
            Back
          </Text>
        </Pressable>
        <Text variant="rowTitle" color="text" style={styles.headerTitle}>
          Parties
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Summary strip — three hairline-divided cells on a single
          bounded card. Same vocabulary as the laminate stat bar
          and the transaction Received/Spent/Net strip elsewhere
          in the app. */}
      <View style={styles.summaryWrap}>
        <View style={styles.summaryCard}>
          <SummaryCell label="TOTAL" value={String(parties.length)} />
          <View style={styles.summaryDivider} />
          <SummaryCell label="TO PAY" value="₹0" tone={color.danger} />
          <View style={styles.summaryDivider} />
          <SummaryCell label="TO RECEIVE" value="₹0" tone={color.success} />
        </View>
      </View>

      {loading && parties.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading parties…</Text>
        </View>
      ) : parties.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={32} color={color.textFaint} />
          <Text variant="body" color="textMuted" align="center" style={styles.sub}>
            Add vendors, clients, contractors and track balances.
          </Text>
          <Pressable onPress={() => router.push('/(app)/add-party' as never)}>
            <Text variant="metaStrong" color="primary">Add your first party</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={parties}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PartyRow item={item} />}
          ItemSeparatorComponent={() => <View style={styles.cardGap} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/(app)/add-party' as never);
        }}
        style={({ pressed }) => [
          styles.fab,
          { bottom: 24 + insets.bottom },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add party"
      >
        <Ionicons name="add" size={26} color={color.onPrimary} />
      </Pressable>
    </View>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={tone ? [styles.summaryValue, { color: tone }] : styles.summaryValue}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 80,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 80,
  },

  // Summary strip
  summaryWrap: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    overflow: 'hidden',
  },
  summaryCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
  },
  summaryLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.2,
  },
  summaryValue: {
    fontFamily: fontFamily.mono,
    fontSize: 18,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },

  // List
  listContent: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: 96,
  },
  cardGap: { height: 10 },

  // Party row — elevated white card
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyBody: { flex: 1, minWidth: 0, gap: 2 },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    backgroundColor: color.primarySoft,
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
    gap: space.xs,
  },
  sub: { maxWidth: 300 },

  // FAB
  fab: {
    position: 'absolute',
    right: screenInset,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
