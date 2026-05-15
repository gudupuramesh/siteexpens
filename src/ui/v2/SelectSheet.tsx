/**
 * v2 SelectSheet — bottom sheet single-select picker.
 *
 * Used for short option lists like Source / Status / Priority / Project
 * type. Selecting an option auto-confirms (calls onPick) and dismisses
 * the sheet — no separate Done button (the action IS the selection).
 *
 * Header: Cancel · Title (no Done — selection is the commit).
 */
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeV2 } from '@/src/theme/v2';

import { Text } from './Text';

export type SelectSheetOption<K extends string = string> = {
  key: K;
  label: string;
};

export type SelectSheetProps<K extends string = string> = {
  open: boolean;
  title: string;
  options: SelectSheetOption<K>[];
  selected?: K;
  onPick: (key: K) => void;
  onClose: () => void;
};

export function SelectSheet<K extends string = string>({
  open,
  title,
  options,
  selected,
  onPick,
  onClose,
}: SelectSheetProps<K>) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
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
          {/* Grabber */}
          <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />

          {/* Header — Cancel · Title */}
          <View
            style={[
              styles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={onClose} hitSlop={8} style={styles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={styles.title}
              numberOfLines={1}
            >
              {title}
            </Text>
            <View style={styles.sideBtn} />
          </View>

          {/* Options — tap to pick + auto-dismiss */}
          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((opt, idx) => {
              const isSelected = opt.key === selected;
              return (
                <View key={opt.key}>
                  <Pressable
                    onPress={() => {
                      onPick(opt.key);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.optionRow,
                      pressed && { backgroundColor: t.colors.fill3 },
                    ]}
                  >
                    <Text
                      variant="body"
                      color="label"
                      style={{
                        flex: 1,
                        fontWeight: isSelected ? '600' : '400',
                      }}
                    >
                      {opt.label}
                    </Text>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={t.palette.blue.base}
                      />
                    ) : null}
                  </Pressable>
                  {idx < options.length - 1 ? (
                    <View
                      style={{
                        height: t.hairline,
                        backgroundColor: t.colors.separator,
                        marginLeft: 16,
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingTop: 8,
  },
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
  sideBtn: {
    minWidth: 70,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
  },
});
