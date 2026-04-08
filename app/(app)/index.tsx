/**
 * "My Projects" landing screen. Phase 1 ships only the empty state — the
 * "+ New Project" button is deliberately inert; wiring it up to the
 * create-project flow lands in the Organizations & Projects PR.
 */
import { Stack } from 'expo-router';
import { signOut } from 'firebase/auth';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { auth } from '@/src/lib/firebase';
import { colors } from '@/src/theme/colors';

export default function MyProjectsScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'My Projects',
          headerRight: () => (
            <TouchableOpacity onPress={() => signOut(auth)}>
              <Text style={styles.headerAction}>Sign out</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No projects yet</Text>
        <Text style={styles.emptyBody}>
          Create your first project to start tracking expenses, staff, attendance and
          material requests.
        </Text>

        <TouchableOpacity style={[styles.button, styles.buttonDisabled]} disabled>
          <Text style={styles.buttonText}>+ New Project</Text>
        </TouchableOpacity>
        <Text style={styles.comingSoon}>Coming in the next update</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBody: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: '600',
  },
  comingSoon: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  headerAction: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 8,
  },
});
