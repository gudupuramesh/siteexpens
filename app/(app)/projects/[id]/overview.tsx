/**
 * Project overview — full-screen view of the OverviewTab content.
 *
 * Was previously the first tab inside ProjectDetailScreen. Moved out
 * because (a) the tab strip was getting crowded and (b) the overview
 * is a "context dashboard" the user wants to glance at, not a thing
 * they're actively working in — so it makes more sense behind the
 * three-dot menu in the project header than as a swipe target.
 *
 * The OverviewTab component itself is unchanged (still self-contained,
 * reads its own params + Firestore state); this screen just hosts it
 * with a back-arrow header.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useProject } from '@/src/features/projects/useProject';
import { OverviewTab } from '@/src/features/projects/tabs/OverviewTab';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, screenInset } from '@/src/theme';

export default function ProjectOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project } = useProject(id);

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.navBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>
            PROJECT
          </Text>
          <Text variant="bodyStrong" color="text" numberOfLines={1}>
            {project?.name ?? 'Overview'}
          </Text>
        </View>
        <View style={styles.navBtn} />
      </View>

      <View style={styles.body}>
        <OverviewTab />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  navCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navEyebrow: { letterSpacing: 1.1 },
  body: { flex: 1 },
});
