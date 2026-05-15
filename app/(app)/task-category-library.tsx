/**
 * Task Category Library — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Task categories" · count caption
 *   2. Inline "Add new category" field with blue ADD pill
 *   3. Sectioned list — Default categories + Custom categories
 *   4. Trash icon on custom rows (default rows show "DEFAULT" pill)
 *
 * Preserves Firestore writes — `createTaskCategory`, `deleteTaskCategory`
 * and the snapshot `useTaskCategories` hook.
 */
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import {
  createTaskCategory,
  deleteTaskCategory,
  toCategoryKey,
} from '@/src/features/tasks/taskCategories';
import { useTaskCategories } from '@/src/features/tasks/useTaskCategories';
import { DEFAULT_TASK_CATEGORIES } from '@/src/features/tasks/types';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

export default function TaskCategoryLibraryScreen() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: categories, loading } = useTaskCategories(orgId);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const defaultKeys = useMemo(
    () => new Set(DEFAULT_TASK_CATEGORIES.map((c) => c.key)),
    [],
  );

  const sections = useMemo(() => {
    const def: typeof categories = [];
    const custom: typeof categories = [];
    for (const c of categories) {
      if (defaultKeys.has(c.key)) def.push(c);
      else custom.push(c);
    }
    return { def, custom };
  }, [categories, defaultKeys]);

  async function onAdd() {
    const label = draft.trim();
    if (!label || !orgId || !user?.uid) return;
    setSaving(true);
    try {
      await createTaskCategory({ orgId, label, createdBy: user.uid });
      setDraft('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function onDelete(item: { key: string; label: string }) {
    const id = `${orgId}_${toCategoryKey(item.label)}`;
    Alert.alert(
      'Delete category?',
      `Remove "${item.label}" from master library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTaskCategory(id);
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            }
          },
        },
      ],
    );
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const canAdd = !!draft.trim() && !saving;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — transparent so the AmbientBackground flows through */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="label">
            Task categories
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            {sections.def.length} DEFAULT · {sections.custom.length} CUSTOM
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl {...refresh.props} />}
        >
          {/* Add row */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <View
              style={[
                styles.addCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.field,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <Ionicons
                name="add-circle-outline"
                size={18}
                color={t.colors.tertiary}
              />
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Add new category"
                placeholderTextColor={t.colors.tertiary}
                style={[
                  styles.input,
                  { color: t.colors.label, ...t.type.body },
                ]}
                returnKeyType="done"
                onSubmitEditing={() => void onAdd()}
                autoCapitalize="words"
              />
              <Pressable
                onPress={() => void onAdd()}
                disabled={!canAdd}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.addBtn,
                  {
                    backgroundColor: canAdd
                      ? t.palette.blue.base
                      : t.colors.fill3,
                    borderRadius: 999,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text
                  variant="caption2"
                  style={{
                    color: canAdd ? '#fff' : t.colors.tertiary,
                    fontWeight: '700',
                    letterSpacing: 0.5,
                  }}
                >
                  {saving ? '…' : 'ADD'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Loading */}
          {loading && categories.length === 0 ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <Text variant="callout" color="secondary">
                Loading…
              </Text>
            </View>
          ) : (
            <>
              {sections.def.length > 0 ? (
                <Section header="Default" count={sections.def.length}>
                  {sections.def.map((c, idx) => (
                    <CategoryRow
                      key={c.key}
                      label={c.label}
                      isCustom={false}
                      divider={idx < sections.def.length - 1}
                    />
                  ))}
                </Section>
              ) : null}

              {sections.custom.length > 0 ? (
                <Section header="Custom" count={sections.custom.length}>
                  {sections.custom.map((c, idx) => (
                    <CategoryRow
                      key={c.key}
                      label={c.label}
                      isCustom
                      divider={idx < sections.custom.length - 1}
                      onDelete={() => onDelete(c)}
                    />
                  ))}
                </Section>
              ) : (
                <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
                  <Text
                    variant="caption2"
                    color="secondary"
                    style={{ paddingHorizontal: 16, paddingBottom: 7, letterSpacing: 0.4 }}
                  >
                    CUSTOM
                  </Text>
                  <View
                    style={[
                      styles.emptyCustom,
                      {
                        backgroundColor: cardBg,
                        borderRadius: t.radii.group,
                        borderColor: cardBorder,
                        borderWidth: t.hairline,
                      },
                    ]}
                  >
                    <Ionicons
                      name="layers-outline"
                      size={22}
                      color={t.colors.tertiary}
                    />
                    <Text
                      variant="callout"
                      color="secondary"
                      style={{ marginTop: 6, textAlign: 'center' }}
                    >
                      No custom categories yet
                    </Text>
                    <Text
                      variant="caption1"
                      color="tertiary"
                      style={{ marginTop: 2, textAlign: 'center' }}
                    >
                      Type a name above and tap ADD
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Section({
  header,
  count,
  children,
}: {
  header: string;
  count: number;
  children: React.ReactNode;
}) {
  const t = useThemeV2();
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  return (
    <View style={{ marginTop: 24 }}>
      <View style={styles.sectionHeader}>
        <Text variant="caption2" color="secondary" style={{ letterSpacing: 0.4 }}>
          {header.toUpperCase()}
        </Text>
        <Text variant="caption2" color="tertiary">
          {count}
        </Text>
      </View>
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.group,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function CategoryRow({
  label,
  isCustom,
  divider,
  onDelete,
}: {
  label: string;
  isCustom: boolean;
  divider: boolean;
  onDelete?: () => void;
}) {
  const t = useThemeV2();
  return (
    <View style={[styles.row, { minHeight: 48, position: 'relative' }]}>
      <Text variant="body" color="label" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {isCustom ? (
        <Pressable
          onPress={onDelete}
          hitSlop={10}
          style={({ pressed }) => [
            styles.deleteBtn,
            {
              backgroundColor:
                t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
              borderRadius: 999,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="trash-outline" size={13} color={t.palette.red.base} />
        </Pressable>
      ) : (
        <View
          style={[
            styles.defaultPill,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
          ]}
        >
          <Text
            variant="caption2"
            color="tertiary"
            style={{ fontWeight: '700', letterSpacing: 0.4 }}
          >
            DEFAULT
          </Text>
        </View>
      )}
      {divider ? (
        <View
          style={[
            styles.rowDivider,
            { backgroundColor: t.colors.separator, left: 16 },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Add row
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    margin: 0,
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 7,
  },
  sectionCard: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  defaultPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  // Empty
  emptyCustom: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
});
