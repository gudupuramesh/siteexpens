/**
 * CRM tab stub — leads, pipeline, follow-ups. Phase 6 per
 * design-system.json featureModules.
 */
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { LargeHeader } from '@/src/ui/LargeHeader';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { screenInset, space } from '@/src/theme';

export default function CrmTabScreen() {
  const { data: org } = useCurrentOrganization();
  const initial = (org?.name ?? '?').charAt(0).toUpperCase();

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      <LargeHeader
        eyebrow={org?.name ?? 'Your firm'}
        title="CRM"
        trailing={<Text variant="rowTitle" color="onPrimary">{initial}</Text>}
      />

      <View style={styles.empty}>
        <Text variant="title" color="text" align="center">
          Coming soon
        </Text>
        <Text variant="body" color="textMuted" align="center" style={styles.sub}>
          Leads, pipeline and follow-ups will live here once the core
          project flows are complete.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
