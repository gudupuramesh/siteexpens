/**
 * Staff Role Library — manage org-scoped staff position presets.
 *
 * Mirrors `task-category-library.tsx` exactly so the studio admin gets
 * a familiar UX. Defaults from `roles.ts` are non-deletable; org
 * additions are removable.
 */
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { KeyboardAvoidingShell } from '@/src/ui/KeyboardFormLayout';
import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { DEFAULT_STAFF_ROLES, toRoleKey } from '@/src/features/staff/roles';
import {
  createStaffRole,
  deleteStaffRole,
} from '@/src/features/staff/staffRoleLibrary';
import { useStaffRoles } from '@/src/features/staff/useStaffRoles';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

export default function StaffRoleLibraryScreen() {
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { can } = usePermissions();
  const canWrite = can('finance.write');
  const { data: roles, loading } = useStaffRoles(orgId);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const defaultKeys = useMemo(
    () => new Set(DEFAULT_STAFF_ROLES.map((r) => r.key)),
    [],
  );

  async function onAdd() {
    const label = draft.trim();
    if (!label || !orgId || !user?.uid || !canWrite) return;
    setSaving(true);
    try {
      await createStaffRole({ orgId, label, createdBy: user.uid });
      setDraft('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function onDelete(item: { key: string; label: string }) {
    if (!canWrite) return;
    const id = `${orgId}_${toRoleKey(item.label)}`;
    Alert.alert('Delete role?', `Remove "${item.label}" from the library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStaffRole(id);
          } catch (err) {
            Alert.alert('Error', (err as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={20} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>SETTINGS</Text>
          <Text variant="bodyStrong" color="text">Staff Role Library</Text>
        </View>
        <View style={styles.navBtn} />
      </View>

      <KeyboardAvoidingShell headerInset={52}>
        {canWrite ? (
          <View style={styles.addRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Add new role (e.g. Glass Fitter)"
              placeholderTextColor={color.textFaint}
              style={styles.input}
              autoCapitalize="words"
            />
            <Pressable
              onPress={onAdd}
              disabled={!draft.trim() || saving}
              style={({ pressed }) => [
                styles.addBtn,
                (!draft.trim() || saving) && { opacity: 0.5 },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text variant="metaStrong" style={{ color: color.onPrimary }}>ADD</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.readOnlyBanner}>
            <Ionicons name="lock-closed-outline" size={14} color={color.textMuted} />
            <Text variant="meta" color="textMuted">
              Read-only — only Admins / Accountants can edit.
            </Text>
          </View>
        )}

        <FlatList
          style={{ flex: 1 }}
          data={roles}
          keyExtractor={(i) => i.key}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            const isCustom = !defaultKeys.has(item.key);
            return (
              <View style={styles.row}>
                <Text variant="body" color="text">{item.label}</Text>
                <View style={styles.rowRight}>
                  {isCustom && canWrite ? (
                    <Pressable onPress={() => onDelete(item)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={color.danger} />
                    </Pressable>
                  ) : (
                    <Text variant="caption" color="textMuted">
                      {isCustom ? 'Custom' : 'Default'}
                    </Text>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <View style={styles.empty}><Text variant="meta" color="textMuted">Loading…</Text></View>
            ) : (
              <View style={styles.empty}><Text variant="meta" color="textMuted">No roles.</Text></View>
            )
          }
        />
      </KeyboardAvoidingShell>
    </Screen>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: 2,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navEyebrow: { letterSpacing: 1.2 },
  addRow: {
    flexDirection: 'row',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    color: color.text,
  },
  addBtn: {
    width: 72,
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
  },
  listContent: { paddingHorizontal: screenInset, paddingBottom: 24 },
  row: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: color.bg,
    paddingHorizontal: space.sm,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowRight: { minWidth: 56, alignItems: 'flex-end' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
});
