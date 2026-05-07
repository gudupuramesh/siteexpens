/**
 * Bottom-sheet modal that lists project members with a search box.
 * Reuses the overlay/sheet visual pattern from LibraryPickerModal.
 */
import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useProjectMembers } from '@/src/features/projects/useProjectMembers';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

type Props = {
  visible: boolean;
  projectId: string;
  onPick: (uid: string, displayName: string) => void;
  onClose: () => void;
  allowUnassign?: boolean;
};

export function MemberPickerModal({ visible, projectId, onPick, onClose, allowUnassign }: Props) {
  const [search, setSearch] = useState('');
  const { members, loading } = useProjectMembers(projectId);

  /** Project clients are not assignable as internal task owners. */
  const staffOnly = useMemo(
    () => members.filter((m) => !m.isProjectClient),
    [members],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staffOnly;
    return staffOnly.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [staffOnly, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text variant="bodyStrong" color="text" style={styles.title}>
          Assign to
        </Text>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={color.textMuted} />
          <TextInput
            placeholder="Search members..."
            placeholderTextColor={color.textFaint}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            autoFocus
          />
        </View>

        {allowUnassign && (
          <Pressable
            onPress={() => {
              onPick('', '');
              setSearch('');
            }}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.avatar, { backgroundColor: color.bgGrouped }]}>
              <Ionicons name="person-remove-outline" size={18} color={color.textMuted} />
            </View>
            <Text variant="body" color="textMuted" style={styles.flex}>
              Unassigned
            </Text>
          </Pressable>
        )}

        <FlatList
          data={filtered}
          keyExtractor={(m) => m.uid}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onPick(item.uid, item.displayName);
                setSearch('');
              }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.avatar}>
                <Text variant="metaStrong" style={{ color: color.onPrimary }}>
                  {item.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text variant="body" color="text" style={styles.flex} numberOfLines={1}>
                {item.displayName}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={color.textFaint} />
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="meta" color="textMuted">
                {loading ? 'Loading…' : search ? 'No matches' : 'No members in this project'}
              </Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.sm,
    maxHeight: '80%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.border, alignSelf: 'center', marginBottom: space.sm },
  title: { textAlign: 'center', marginBottom: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: screenInset,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: color.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  list: { paddingHorizontal: screenInset, maxHeight: 420 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: screenInset,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { paddingVertical: space.xl, alignItems: 'center' },
});
