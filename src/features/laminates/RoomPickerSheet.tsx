/**
 * v2 RoomPickerSheet — bottom sheet to pick a laminate room.
 *
 * Sections:
 *   • Project rooms (already used in this project)
 *   • Common rooms (curated default list)
 *
 * Search filters across both. When the search has no exact match, an
 * "Add 'X' as room" footer surfaces.
 */
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export type RoomPickerSheetProps = {
  open: boolean;
  selected: string;
  existingRooms: string[];
  commonRooms: string[];
  onPick: (room: string) => void;
  onClose: () => void;
};

export function RoomPickerSheet({
  open,
  selected,
  existingRooms,
  commonRooms,
  onPick,
  onClose,
}: RoomPickerSheetProps) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useStateLazy('');

  const allRooms = [...new Set([...existingRooms, ...commonRooms])];
  const filtered = search
    ? allRooms.filter((r) => r.toLowerCase().includes(search.toLowerCase()))
    : allRooms;

  const close = () => {
    Keyboard.dismiss();
    setSearch('');
    onClose();
  };

  const pick = (r: string) => {
    onPick(r);
    Keyboard.dismiss();
    setSearch('');
    onClose();
  };

  const showAddCustom =
    search.trim().length > 0
    && !allRooms.some((r) => r.toLowerCase() === search.trim().toLowerCase());

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '85%',
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />
          <View
            style={[
              styles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={close} hitSlop={8} style={styles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>Cancel</Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[styles.title, { fontWeight: '600' }]}
            >
              Select room
            </Text>
            <View style={styles.sideBtn} />
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View
              style={[
                styles.searchBar,
                { backgroundColor: t.colors.fill3, borderRadius: t.radii.field },
              ]}
            >
              <Ionicons name="search" size={16} color={t.colors.tertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search or type new room…"
                placeholderTextColor={t.colors.tertiary}
                style={[
                  styles.searchInput,
                  { color: t.colors.label, ...t.type.callout },
                ]}
                autoFocus
                returnKeyType="search"
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {!search && existingRooms.length > 0 ? (
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 32, paddingTop: 16, paddingBottom: 6 }}
              >
                PROJECT ROOMS
              </Text>
            ) : null}
            {!search && existingRooms.map((r) => (
              <RoomRow
                key={`existing_${r}`}
                room={r}
                active={selected === r}
                icon="home"
                onPress={() => pick(r)}
              />
            ))}

            {!search && existingRooms.length > 0 ? (
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 32, paddingTop: 16, paddingBottom: 6 }}
              >
                COMMON ROOMS
              </Text>
            ) : null}
            {filtered
              .filter((r) => search || !existingRooms.includes(r))
              .map((r) => (
                <RoomRow
                  key={r}
                  room={r}
                  active={selected === r}
                  icon="home-outline"
                  onPress={() => pick(r)}
                />
              ))}
          </ScrollView>

          {showAddCustom ? (
            <View
              style={[
                styles.addCustomWrap,
                {
                  borderTopColor: t.colors.separator,
                  borderTopWidth: t.hairline,
                },
              ]}
            >
              <Pressable
                onPress={() => pick(search.trim())}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.addCustomBtn,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                    borderRadius: t.radii.field,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="add-circle-outline" size={16} color={t.palette.blue.base} />
                <Text
                  variant="footnote"
                  style={{
                    color: t.palette.blue.base,
                    fontWeight: '700',
                    marginLeft: 6,
                  }}
                  numberOfLines={1}
                >
                  Add "{search.trim()}" as room
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RoomRow({
  room,
  active,
  icon,
  onPress,
}: {
  room: string;
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.roomRow,
        pressed && { backgroundColor: t.colors.fill3 },
      ]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? t.palette.blue.base : t.colors.tertiary}
      />
      <Text
        variant="body"
        color="label"
        style={{ flex: 1, marginLeft: 12, fontWeight: active ? '600' : '400' }}
      >
        {room}
      </Text>
      {active ? (
        <Ionicons name="checkmark-circle" size={18} color={t.palette.blue.base} />
      ) : null}
    </Pressable>
  );
}

// Local state shim so we don't need a top-level useState import name clash
// in the file we'll embed this in.
import { useState as useStateLazy } from 'react';

const styles = StyleSheet.create({
  sheet: { paddingTop: 8 },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sideBtn: { minWidth: 70 },
  title: { flex: 1, textAlign: 'center' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, paddingVertical: 0, margin: 0 },

  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  addCustomWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
});
