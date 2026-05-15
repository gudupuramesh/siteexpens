/**
 * Project overview — full-screen view of OverviewTab content (v2).
 *
 * Was previously the first tab inside ProjectDetailScreen. Moved out
 * because (a) the tab strip was getting crowded and (b) the overview
 * is a "context dashboard" the user wants to glance at, not a thing
 * they're actively working in — so it makes more sense behind the
 * three-dot menu in the project header than as a swipe target.
 *
 * The OverviewTab component owns the body; this screen just hosts it
 * with a v2 transparent header over an AmbientBackground.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useProject } from '@/src/features/projects/useProject';
import { OverviewTab } from '@/src/features/projects/tabs/OverviewTab';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export default function ProjectOverviewScreen() {
  const t = useThemeV2();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: project } = useProject(id);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — back · title · Edit (jumps straight to the edit form,
          replaces the old "EDIT DETAILS" pill that lived below the
          project-details FormGroup so the affordance is always visible
          in the standard top-right slot). */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="label" numberOfLines={1}>
            {project?.name ?? 'Overview'}
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            PROJECT OVERVIEW
          </Text>
        </View>
        <Pressable
          onPress={() => router.push(`/(app)/projects/${id}/edit-project` as never)}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor:
                t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
              borderRadius: 999,
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Edit project"
        >
          <Ionicons name="create-outline" size={16} color={t.palette.blue.base} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <OverviewTab />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
