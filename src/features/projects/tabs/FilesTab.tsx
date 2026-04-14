import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

export function FilesTab() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      {/* Site photos placeholder */}
      <View style={styles.section}>
        <Text variant="metaStrong" color="text">Site Photos</Text>
        <View style={styles.photoRow}>
          <Pressable style={styles.addPhotoBtn}>
            <Ionicons name="camera-outline" size={24} color={color.textFaint} />
            <Text variant="caption" color="textMuted">Add</Text>
          </Pressable>
        </View>
      </View>

      {/* Folders */}
      <View style={styles.section}>
        <Text variant="metaStrong" color="text">Folders</Text>
        <View style={styles.emptyFolders}>
          <Ionicons name="folder-outline" size={24} color={color.textFaint} />
          <Text variant="meta" color="textMuted">No folders added</Text>
        </View>
      </View>

      {/* New Folder button */}
      <View style={styles.newFolderWrap}>
        <Pressable
          style={({ pressed }) => [styles.newFolderBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="folder-open-outline" size={18} color={color.primary} />
          <Text variant="bodyStrong" color="primary">New Folder</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
        accessibilityLabel="Upload file"
      >
        <Ionicons name="cloud-upload-outline" size={22} color={color.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    gap: space.sm,
  },
  photoRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyFolders: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.separator,
    gap: space.xs,
  },
  newFolderWrap: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
  },
  newFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    borderStyle: 'dashed',
  },
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
