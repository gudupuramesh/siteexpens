import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/src/ui/Text';
import { color, screenInset, shadow, space } from '@/src/theme';

export function DesignTab() {
  return (
    <View style={styles.container}>
      <View style={styles.empty}>
        <Ionicons name="document-outline" size={28} color={color.textFaint} />
        <Text variant="bodyStrong" color="text" style={styles.emptyTitle}>
          No designs uploaded
        </Text>
        <Text variant="meta" color="textMuted" align="center">
          Add 2D layouts, 3D renders, PDFs and reference images.
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
        accessibilityLabel="Upload design"
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
