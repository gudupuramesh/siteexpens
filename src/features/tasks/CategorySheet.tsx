/**
 * Shared task UI: the Category sheet used by both add-task and
 * edit-task. The picker lets the user choose from existing categories
 * or add a new one inline (with org-scoped persistence).
 */
import {
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

export type CategoryOption = {
  key: string;
  label: string;
};

export function CategorySheet({
  open,
  onClose,
  categoryOptions,
  selectedCategory,
  onPick,
  newCategory,
  setNewCategory,
  addingCategory,
  onAddCategory,
}: {
  open: boolean;
  onClose: () => void;
  categoryOptions: CategoryOption[];
  selectedCategory: string;
  onPick: (key: string) => void;
  newCategory: string;
  setNewCategory: (v: string) => void;
  addingCategory: boolean;
  onAddCategory: () => void;
}) {
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
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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
            <Pressable onPress={onClose} hitSlop={8} style={styles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>Cancel</Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[styles.title, { fontWeight: '600' }]}
              numberOfLines={1}
            >
              Category
            </Text>
            <View style={styles.sideBtn} />
          </View>

          {/* Add new category row */}
          <View style={styles.addRow}>
            <View
              style={[
                styles.addInputWrap,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                },
              ]}
            >
              <Ionicons name="add" size={16} color={t.colors.tertiary} />
              <TextInput
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder="Add new category"
                placeholderTextColor={t.colors.tertiary}
                style={[
                  styles.addInput,
                  { color: t.colors.label, ...t.type.callout },
                ]}
                autoCapitalize="words"
              />
            </View>
            <Pressable
              onPress={onAddCategory}
              disabled={!newCategory.trim() || addingCategory}
              hitSlop={6}
              style={({ pressed }) => [
                styles.addBtn,
                {
                  backgroundColor: t.palette.blue.base,
                  borderRadius: t.radii.field,
                },
                (!newCategory.trim() || addingCategory) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                variant="caption2"
                style={{ color: '#fff', fontWeight: '700', letterSpacing: 0.4 }}
              >
                {addingCategory ? '…' : 'ADD'}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {categoryOptions.map((c, i) => {
              const active = selectedCategory === c.key;
              return (
                <View key={c.key}>
                  <Pressable
                    onPress={() => {
                      onPick(c.key);
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
                      style={{ flex: 1, fontWeight: active ? '600' : '400' }}
                    >
                      {c.label}
                    </Text>
                    {active ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={t.palette.blue.base}
                      />
                    ) : null}
                  </Pressable>
                  {i < categoryOptions.length - 1 ? (
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  addInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addInput: {
    flex: 1,
    paddingVertical: 0,
    margin: 0,
  },
  addBtn: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
  },
});
