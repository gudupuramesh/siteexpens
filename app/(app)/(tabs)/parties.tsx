/**
 * Parties tab stub — firm-wide vendors, clients, staff and their
 * balances. Full implementation (partyRow list, SummaryHeroCard with
 * To Pay / To Receive, create/edit flows, Firestore rules) is scheduled
 * for Phase 3 per design-system.json featureModules.phase3_next.
 */
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { LargeHeader } from '@/src/ui/LargeHeader';
import { Screen } from '@/src/ui/Screen';
import { SummaryHeroCard } from '@/src/ui/SummaryHeroCard';
import { Text } from '@/src/ui/Text';
import { screenInset, space } from '@/src/theme';

export default function PartiesTabScreen() {
  const { data: org } = useCurrentOrganization();
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
            { label: 'To Pay', value: '₹ 0' },
            { label: 'To Receive', value: '₹ 0' },
          ]}
        />
      </View>

      <View style={styles.empty}>
        <Text variant="title" color="text" align="center">
          Coming soon
        </Text>
        <Text variant="body" color="textMuted" align="center" style={styles.sub}>
          Vendors, clients and staff with live balance totals land in the
          next release.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
  },
  sub: {
    marginTop: space.xs,
    maxWidth: 300,
  },
});
