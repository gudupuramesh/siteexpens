import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Text } from '@/src/ui/Text';
import { color, screenInset, shadow, space } from '@/src/theme';

export function MOMTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <View style={styles.empty}>
        <Ionicons name="document-text-outline" size={28} color={color.textFaint} />
        <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
          No meeting notes
        </Text>
        <Text variant="meta" color="textMuted" align="center">
          Record minutes of meetings with clients, contractors and team.
        </Text>
      </View>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(app)/projects/${projectId}/add-mom` as never);
        }}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
        accessibilityLabel="Add meeting notes"
      >
        <Ionicons name="add" size={24} color={color.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },
  emptyTitle: { marginTop: space.xxs },
  fab: {
    position: 'absolute',
    right: screenInset,
    bottom: space.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
