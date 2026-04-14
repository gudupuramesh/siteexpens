/**
 * Parties tab — firm-wide vendors, clients, staff and their balances.
 * Lists all org-level parties with role badges, wired to Firestore.
 */
import { router, Stack } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { type Party, getPartyTypeLabel } from '@/src/features/parties/types';
import { LargeHeader } from '@/src/ui/LargeHeader';
import { Screen } from '@/src/ui/Screen';
import { SummaryHeroCard } from '@/src/ui/SummaryHeroCard';
import { Separator } from '@/src/ui/Separator';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

function PartyRow({ item }: { item: Party }) {
  const initial = item.name.charAt(0).toUpperCase();
  const roleLabel = getPartyTypeLabel((item.partyType ?? item.role) as any);

  return (
    <View style={styles.partyRow}>
      <View style={styles.avatar}>
        <Text variant="metaStrong" style={{ color: color.primary }}>{initial}</Text>
      </View>
      <View style={styles.partyBody}>
        <Text variant="rowTitle" color="text" numberOfLines={1}>{item.name}</Text>
        <Text variant="meta" color="textMuted" numberOfLines={1}>
          {roleLabel}{item.phone ? ` · ${item.phone}` : ''}
        </Text>
      </View>
      <View style={styles.roleBadge}>
        <Text variant="caption" style={{ color: color.primary }}>{roleLabel}</Text>
      </View>
    </View>
  );
}

export default function PartiesTabScreen() {
  const insets = useSafeAreaInsets();
  const { data: org } = useCurrentOrganization();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId;
  const { data: parties, loading } = useParties(orgId);
  const initial = (org?.name ?? '?').charAt(0).toUpperCase();

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      <LargeHeader
        eyebrow={org?.name ?? 'Your firm'}
        title="Parties"
        trailing={<Text variant="rowTitle" color="onPrimary">{initial}</Text>}
      />

      <View style={styles.hero}>
        <SummaryHeroCard
          title="Party balances"
          metrics={[
            { label: 'Total Parties', value: String(parties.length) },
            { label: 'To Pay', value: '₹ 0' },
            { label: 'To Receive', value: '₹ 0' },
          ]}
        />
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
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* FAB */}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
  },
  listContent: {
    paddingTop: space.md,
    paddingBottom: 80,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  roleBadge: {
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: color.primarySoft,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
    gap: space.xs,
  },
  sub: {
    maxWidth: 300,
  },
  fab: {
    position: 'absolute',
    right: screenInset,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
