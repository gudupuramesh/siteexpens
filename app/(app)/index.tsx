/**
 * "Projects" landing screen. Phase 1 ships only the empty state — the
 * "+ New Project" FAB is deliberately inert; wiring it up to the
 * create-project flow lands in the Organizations & Projects PR.
 *
 * Layout follows the dense native style: a large-title header, a single
 * section header ("All Projects"), the empty state centered in the
 * remaining space, and a 52pt FAB pinned bottom-right.
 */
import { Stack } from 'expo-router';
import { signOut } from 'firebase/auth';
import { Pressable, StyleSheet, View } from 'react-native';

import { auth } from '@/src/lib/firebase';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { SectionHeader } from '@/src/ui/SectionHeader';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

export default function MyProjectsScreen() {
  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <View style={styles.header}>
        <Text variant="largeTitle" color="text">
          Projects
        </Text>
        <Pressable onPress={() => signOut(auth)} hitSlop={12}>
          <Text variant="metaStrong" color="primary">
            Sign out
          </Text>
        </Pressable>
      </View>

      <SectionHeader trailing="0">All projects</SectionHeader>

      <View style={styles.empty}>
        <Text variant="body" color="textMuted" align="center">
          No projects yet.
        </Text>
        <View style={styles.emptyAction}>
          <Button
            variant="text"
            label="Create your first project"
            disabled
          />
        </View>
      </View>

      <Pressable
        onPress={() => {
          /* wired up in next PR */
        }}
        disabled
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: 80, // visual balance against the FAB
  },
  emptyAction: {
    marginTop: space.xs,
  },
  fab: {
    position: 'absolute',
    right: screenInset,
    bottom: screenInset,
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5, // disabled in Phase 1
    ...shadow.fab,
  },
  fabIcon: {
    fontSize: 28,
    lineHeight: 30,
  },
});
