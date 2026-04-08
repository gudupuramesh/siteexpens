/**
 * Projects tab — the primary firm dashboard.
 *
 * Structure (per design-system.json v2 layoutPatterns.projectsDashboard):
 *   1. LargeHeader (org eyebrow + "Projects" large title + avatar button)
 *   2. StatStrip (Approvals / Material / Tasks pending — 3 neutral tiles)
 *   3. Toolbar row: filter / sort / search icons + "+ Project" inline action
 *   4. Scrollable FlatList of ProjectCards
 *   5. Floating FAB (bottom-right, above the tab bar)
 */
import { router, Stack } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useProjects } from '@/src/features/projects/useProjects';
import { LargeHeader } from '@/src/ui/LargeHeader';
import { ProjectCard } from '@/src/ui/ProjectCard';
import { Screen } from '@/src/ui/Screen';
import { StatStrip } from '@/src/ui/StatStrip';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

export default function ProjectsTabScreen() {
  const { data: org } = useCurrentOrganization();
  const { data: projects, loading } = useProjects();
  const companyInitial = (org?.name ?? '?').charAt(0).toUpperCase();

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      <LargeHeader
        eyebrow={org?.name ?? 'Your firm'}
        title="Projects"
        trailing={
          <Text variant="rowTitle" color="onPrimary">
            {companyInitial}
          </Text>
        }
        onTrailingPress={() => router.push('/(app)/profile')}
      />

      <View style={styles.stats}>
        <StatStrip
          cells={[
            { label: 'Active', value: String(projects.length), tone: 'info' },
            { label: 'Tasks', value: '0', tone: 'success' },
            { label: 'Pending', value: '0', tone: 'warning' },
          ]}
        />
      </View>

      <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <Pressable style={styles.toolBtn} accessibilityLabel="Filter">
            <Text variant="body" color="textMuted">⚙</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} accessibilityLabel="Sort">
            <Text variant="body" color="textMuted">⇅</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} accessibilityLabel="Search">
            <Text variant="body" color="textMuted">⌕</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/projects/new')}
          hitSlop={8}
        >
          <Text variant="metaStrong" color="primary">+ Project</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      ) : projects.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="body" color="textMuted" align="center">
            No projects yet.
          </Text>
          <Pressable
            onPress={() => router.push('/(app)/projects/new')}
            style={styles.emptyBtn}
          >
            <Text variant="metaStrong" color="primary">
              Create your first project
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <ProjectCard
              name={item.name}
              siteAddress={item.siteAddress}
              startDate={item.startDate ? item.startDate.toDate() : null}
              endDate={item.endDate ? item.endDate.toDate() : null}
              value={item.value}
              photoUri={item.photoUri}
              onPress={() => router.push(`/(app)/projects/${item.id}` as never)}
            />
          )}
        />
      )}

      <Pressable
        onPress={() => router.push('/(app)/projects/new')}
        style={({ pressed }) => [
          styles.fab,
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="New project"
      >
        <Text variant="title" color="onPrimary" style={styles.fabIcon}>
          +
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: {
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingVertical: space.md,
  },
  toolbarLeft: {
    flexDirection: 'row',
    gap: space.xs,
  },
  toolBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: screenInset,
    paddingBottom: 96,
  },
  sep: {
    height: space.md,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: 80,
  },
  emptyBtn: {
    marginTop: space.sm,
  },
  fab: {
    position: 'absolute',
    right: screenInset,
    bottom: 88,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
  fabIcon: {
    fontSize: 30,
    lineHeight: 32,
  },
});
