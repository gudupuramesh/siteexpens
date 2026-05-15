/**
 * Staff Role Library — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Staff roles" · count caption
 *   2. Either an inline "Add new role" field (writers) OR a read-only
 *      banner (read-only viewers without `finance.write`)
 *   3. Sectioned list — Default + Custom roles
 *   4. Trash on custom rows; "DEFAULT" pill on defaults
 *
 * Mirrors `task-category-library.tsx` so admins get the same UX.
 * Preserves Firestore writes — `createStaffRole`, `deleteStaffRole`,
 * the `useStaffRoles` snapshot hook, and the `finance.write` capability
 * gate.
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
import { usePermissions } from '@/src/features/org/usePermissions';
import { DEFAULT_STAFF_ROLES, toRoleKey } from '@/src/features/staff/roles';
import {
  createStaffRole,
  deleteStaffRole,
} from '@/src/features/staff/staffRoleLibrary';
import { useStaffRoles } from '@/src/features/staff/useStaffRoles';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

export default function StaffRoleLibraryScreen() {
  const t = useThemeV2();
  const refresh = usePullToRefresh();
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

  const sections = useMemo(() => {
    const def: typeof roles = [];
    const custom: typeof roles = [];
    for (const r of roles) {
      if (defaultKeys.has(r.key)) def.push(r);
      else custom.push(r);
    }
    return { def, custom };
  }, [roles, defaultKeys]);

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

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const canAdd = !!draft.trim() && !saving && canWrite;

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
            Staff roles
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
          {/* Add row OR read-only banner */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            {canWrite ? (
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
                  placeholder="Add new role (e.g. Glass Fitter)"
                  placeholderTextColor={t.colors.tertiary}
                  style={[
                    styles.input,
                    { color: t.colors.label, ...t.type.body },
                  ]}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={() => void onAdd()}
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
            ) : (
              <View
                style={[
                  styles.banner,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                    borderRadius: t.radii.field,
                    borderColor: t.palette.orange.base + '33',
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={14}
                  color={t.palette.orange.base}
                />
                <Text
                  variant="footnote"
                  style={{
                    color: t.palette.orange.base,
                    fontWeight: '600',
                    marginLeft: 8,
                    flex: 1,
                  }}
                >
                  Read-only — only Admins / Accountants can edit
                </Text>
              </View>
            )}
          </View>

          {/* Loading */}
          {loading && roles.length === 0 ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <Text variant="callout" color="secondary">
                Loading…
              </Text>
            </View>
          ) : (
            <>
              {sections.def.length > 0 ? (
                <Section header="Default" count={sections.def.length}>
                  {sections.def.map((r, idx) => (
                    <RoleRow
                      key={r.key}
                      label={r.label}
                      isCustom={false}
                      canDelete={false}
                      divider={idx < sections.def.length - 1}
                    />
                  ))}
                </Section>
              ) : null}

              {sections.custom.length > 0 ? (
                <Section header="Custom" count={sections.custom.length}>
                  {sections.custom.map((r, idx) => (
                    <RoleRow
                      key={r.key}
                      label={r.label}
                      isCustom
                      canDelete={canWrite}
                      divider={idx < sections.custom.length - 1}
                      onDelete={() => onDelete(r)}
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
                      name="briefcase-outline"
                      size={22}
                      color={t.colors.tertiary}
                    />
                    <Text
                      variant="callout"
                      color="secondary"
                      style={{ marginTop: 6, textAlign: 'center' }}
                    >
                      No custom roles yet
                    </Text>
                    <Text
                      variant="caption1"
                      color="tertiary"
                      style={{ marginTop: 2, textAlign: 'center' }}
                    >
                      {canWrite
                        ? 'Type a name above and tap ADD'
                        : 'Admins / Accountants can add new roles'}
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

function RoleRow({
  label,
  isCustom,
  canDelete,
  divider,
  onDelete,
}: {
  label: string;
  isCustom: boolean;
  canDelete: boolean;
  divider: boolean;
  onDelete?: () => void;
}) {
  const t = useThemeV2();
  return (
    <View style={[styles.row, { minHeight: 48, position: 'relative' }]}>
      <Text variant="body" color="label" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {canDelete && isCustom ? (
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
            styles.tag,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
          ]}
        >
          <Text
            variant="caption2"
            color="tertiary"
            style={{ fontWeight: '700', letterSpacing: 0.4 }}
          >
            {isCustom ? 'CUSTOM' : 'DEFAULT'}
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

  // Read-only banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  tag: {
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
