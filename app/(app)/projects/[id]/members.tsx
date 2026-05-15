/**
 * Project members — v2 design.
 *
 * Layout:
 *   1. Header — back · "Team members"
 *   2. Add CTA pill (when can manage)
 *   3. Sectioned list — Members · Pending invites
 *      Each row: avatar (color per role/status) · name + role · kebab/badge
 *
 * Tapping a row (when allowed) opens the existing RolePickerSheet to
 * change role or remove from project.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { inviteMember, removeMember } from '@/src/features/org/invites';
import { setMemberRole } from '@/src/features/org/organizations';
import { PlanLimitError } from '@/src/features/billing/errors';
import { usePaywall } from '@/src/features/billing/usePaywall';
import {
  ASSIGNABLE_ROLES_BY_ADMIN,
  ASSIGNABLE_ROLES_BY_SUPER_ADMIN,
  ROLE_LABELS,
  type AssignableRole,
} from '@/src/features/org/permissions';
import { ManualMemberEntryModal } from '@/src/features/org/ManualMemberEntryModal';
import { RolePickerSheet } from '@/src/features/org/RolePickerSheet';
import { consumeNewTeamMemberOutbox } from '@/src/features/org/newTeamMemberOutbox';
import { usePendingInvites } from '@/src/features/org/usePendingInvites';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProjectMembers, type ProjectMember } from '@/src/features/projects/useProjectMembers';
import { db, firestore } from '@/src/lib/firebase';
import { formatIndianPhone } from '@/src/lib/phone';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';
import type { RoleKey } from '@/src/features/org/types';

type Row =
  | { kind: 'member'; member: ProjectMember }
  | { kind: 'pending'; phoneNumber: string; displayName: string; role: string };

type SheetState =
  | { kind: 'idle' }
  | { kind: 'invite'; contact: { phone: string; name?: string } }
  | { kind: 'edit'; row: Row };


export default function ProjectMembersScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const currentUid = user?.uid ?? '';
  const { isOwner, isAdminish, role } = usePermissions();

  const { members, loading } = useProjectMembers(projectId);
  const { data: pending } = usePendingInvites(orgId || null);

  const [sheet, setSheet] = useState<SheetState>({ kind: 'idle' });
  const [manualOpen, setManualOpen] = useState(false);

  const partyAssignable = useMemo((): AssignableRole[] => {
    if (isOwner) return ASSIGNABLE_ROLES_BY_SUPER_ADMIN;
    if (isAdminish) return ASSIGNABLE_ROLES_BY_ADMIN;
    if (role === 'manager') return ['client'];
    return [];
  }, [isOwner, isAdminish, role]);

  const canManageTeam = partyAssignable.length > 0;

  const memberPhoneSet = new Set(
    members.map((m) => m.phoneNumber).filter((p): p is string => !!p),
  );
  const pendingForProject = pending.filter(
    (p) =>
      !memberPhoneSet.has(p.phoneNumber)
      && (p.projectIds.includes(projectId ?? '') || p.projectId === projectId),
  );

  // "Add team member" → opens the unified picker in team mode. The
  // user picks an existing org member (no-op + alert in this context),
  // a phonebook contact (→ role-picker → invite), or "+ New Member"
  // (→ small manual-entry modal → role-picker → invite).
  const startAdd = useCallback(() => {
    if (!projectId || !orgId || !canManageTeam) return;
    router.push('/(app)/select-party?mode=team' as never);
  }, [orgId, projectId, canManageTeam]);

  // Drain newTeamMemberOutbox after returning from /select-party.
  // Branches on the kind of selection the user made over there.
  useFocusEffect(
    useCallback(() => {
      const next = consumeNewTeamMemberOutbox();
      if (!next) return;
      if (next.kind === 'existing') {
        // They're already an org member — inviting them again is a
        // no-op. Tell the user. (Future: route to edit-role flow.)
        Alert.alert(
          'Already in this organisation',
          `${next.displayName} is already a team member. To change their role, tap their row in the list.`,
        );
        return;
      }
      if (next.kind === 'contact') {
        setSheet({
          kind: 'invite',
          contact: { phone: next.phoneE164, name: next.displayName },
        });
        return;
      }
      // 'manual' — open the small name+phone entry modal.
      setManualOpen(true);
    }, []),
  );

  const { openPaywall } = usePaywall();

  const onSaveRole = useCallback(
    async (selectedRole: AssignableRole) => {
      if (!orgId || !projectId) return;
      try {
        if (sheet.kind === 'invite') {
          await inviteMember({
            orgId,
            phoneNumber: sheet.contact.phone,
            role: selectedRole,
            projectIds: [projectId],
            displayName: sheet.contact.name,
          });
        } else if (sheet.kind === 'edit') {
          const row = sheet.row;
          if (row.kind === 'member') {
            await setMemberRole({ orgId, uid: row.member.uid, role: selectedRole });
          } else {
            await inviteMember({
              orgId,
              phoneNumber: row.phoneNumber,
              role: selectedRole,
              projectIds: [projectId],
              displayName: row.displayName,
            });
          }
        }
        setSheet({ kind: 'idle' });
      } catch (e) {
        if (e instanceof PlanLimitError) {
          setSheet({ kind: 'idle' });
          openPaywall({ reason: 'plan_limit_members' });
          return;
        }
        Alert.alert('Could not save role', (e as Error).message);
      }
    },
    [orgId, projectId, sheet, openPaywall],
  );

  const onRemove = useCallback(() => {
    if (!orgId || !projectId || sheet.kind !== 'edit') return;
    const target = sheet.row;
    const targetName =
      target.kind === 'member' ? target.member.displayName : target.displayName;
    Alert.alert(
      'Remove from project?',
      `${targetName} will lose access to this project.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (target.kind === 'member') {
                const uid = target.member.uid;
                const ref = db.collection('projects').doc(projectId);
                if (target.member.isProjectClient) {
                  await ref.update({ clientUids: firestore.FieldValue.arrayRemove(uid) });
                } else {
                  await ref.update({ memberIds: firestore.FieldValue.arrayRemove(uid) });
                }
              } else {
                await removeMember({ orgId, phoneNumber: target.phoneNumber });
              }
              setSheet({ kind: 'idle' });
            } catch (e) {
              Alert.alert('Could not remove', (e as Error).message);
            }
          },
        },
      ],
    );
  }, [orgId, projectId, sheet]);

  const onRowPress = useCallback(
    (row: Row) => {
      if (!canManageTeam) return;
      if (row.kind === 'member' && row.member.uid === currentUid) return;
      if (row.kind === 'member' && row.member.role === 'superAdmin') return;
      setSheet({ kind: 'edit', row });
    },
    [canManageTeam, currentUid],
  );

  const sections: Array<{ title: string; data: Row[] }> = [];
  if (members.length > 0) {
    sections.push({
      title: 'Members',
      data: members.map((m) => ({ kind: 'member', member: m }) as Row),
    });
  }
  if (pendingForProject.length > 0) {
    sections.push({
      title: 'Pending',
      data: pendingForProject.map(
        (p) =>
          ({
            kind: 'pending',
            phoneNumber: p.phoneNumber,
            displayName: p.displayName?.trim() || p.phoneNumber,
            role: p.role,
          }) as Row,
      ),
    });
  }

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const renderItem = ({ item }: { item: Row }) => {
    if (item.kind === 'member') {
      const initial = item.member.displayName.charAt(0).toUpperCase() || '?';
      const isClient = item.member.isProjectClient;
      const roleLabel = isClient
        ? 'Client'
        : item.member.role
          ? ROLE_LABELS[item.member.role]
          : 'Team member';
      const phoneDisplay = formatIndianPhone(item.member.phoneNumber);
      const isSelf = item.member.uid === currentUid;
      const isSuperAdmin = item.member.role === 'superAdmin';
      const tappable = canManageTeam && !isSelf && !isSuperAdmin;

      const avatarBg = isClient
        ? (t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft)
        : (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft);
      const avatarFg = isClient ? t.palette.orange.base : t.palette.blue.base;

      return (
        <Pressable
          onPress={() => onRowPress(item)}
          disabled={!tappable}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: cardBg,
              borderRadius: t.radii.card,
              borderColor: cardBorder,
              borderWidth: t.hairline,
            },
            tappable && pressed && { opacity: 0.85 },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
            <Text variant="footnote" style={{ color: avatarFg, fontWeight: '700' }}>
              {initial}
            </Text>
          </View>
          <View style={styles.body}>
            <Text variant="callout" color="label" numberOfLines={1}>
              {item.member.displayName}
              {isSelf ? ' (You)' : ''}
            </Text>
            <Text variant="caption1" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
              {roleLabel}
              {phoneDisplay ? ` · ${phoneDisplay}` : ''}
            </Text>
          </View>
          {tappable ? (
            <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
          ) : (
            <View
              style={[
                styles.badge,
                { backgroundColor: avatarBg, borderRadius: 999 },
              ]}
            >
              <Ionicons
                name={isClient ? 'person-outline' : 'shield-checkmark-outline'}
                size={11}
                color={avatarFg}
              />
            </View>
          )}
        </Pressable>
      );
    }

    const initial = item.displayName.charAt(0).toUpperCase() || '?';
    const phoneDisplay = formatIndianPhone(item.phoneNumber);
    return (
      <Pressable
        onPress={() => onRowPress(item)}
        disabled={!canManageTeam}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.card,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
          canManageTeam && pressed && { opacity: 0.85 },
        ]}
      >
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: t.colors.fill3,
              borderColor: t.colors.tertiary,
              borderWidth: 1,
              borderStyle: 'dashed',
            },
          ]}
        >
          <Text variant="footnote" color="secondary" style={{ fontWeight: '700' }}>
            {initial}
          </Text>
        </View>
        <View style={styles.body}>
          <Text variant="callout" color="label" numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text variant="caption1" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
            {ROLE_LABELS[item.role as keyof typeof ROLE_LABELS] ?? 'Member'} · Invited
            {phoneDisplay ? ` · ${phoneDisplay}` : ''}
          </Text>
        </View>
        {canManageTeam ? (
          <Ionicons name="chevron-forward" size={14} color={t.colors.tertiary} />
        ) : null}
      </Pressable>
    );
  };

  const anyContent = members.length > 0 || pendingForProject.length > 0;

  const sheetVisible = sheet.kind !== 'idle';
  const sheetTitle =
    sheet.kind === 'invite'
      ? sheet.contact.name ?? sheet.contact.phone
      : sheet.kind === 'edit'
        ? sheet.row.kind === 'member'
          ? sheet.row.member.displayName
          : sheet.row.displayName
        : '';
  const sheetSubtitle =
    sheet.kind === 'invite'
      ? sheet.contact.phone
      : sheet.kind === 'edit'
        ? sheet.row.kind === 'member'
          ? formatIndianPhone(sheet.row.member.phoneNumber) ?? undefined
          : `${formatIndianPhone(sheet.row.phoneNumber) ?? sheet.row.phoneNumber} · Invited`
        : undefined;

  const sheetCurrent: RoleKey | null =
    sheet.kind === 'edit'
      ? sheet.row.kind === 'member'
        ? sheet.row.member.role
        : (sheet.row.role as RoleKey) ?? null
      : null;

  const showRemove = sheet.kind === 'edit' && canManageTeam;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: t.colors.separator,
            borderBottomWidth: t.hairline,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.circleBtn,
            {
              backgroundColor: t.colors.surface,
              borderRadius: 999,
              borderColor:
                t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              borderWidth: t.hairline,
            },
            t.shadows.resting,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={16} color={t.colors.label} />
        </Pressable>
        <Text
          variant="headline"
          color="label"
          style={{ flex: 1, textAlign: 'center', fontWeight: '600' }}
          numberOfLines={1}
        >
          Team members
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {canManageTeam ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <Pressable
            onPress={startAdd}
            hitSlop={6}
            style={({ pressed }) => [
              styles.inviteCta,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: t.radii.field,
                borderColor: t.palette.blue.base + '33',
                borderWidth: t.hairline,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="person-add-outline" size={16} color={t.palette.blue.base} />
            <Text
              variant="footnote"
              style={{
                color: t.palette.blue.base,
                fontWeight: '700',
                marginLeft: 6,
              }}
            >
              Add team member or client
            </Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !anyContent ? (
        <View style={styles.empty}>
          <Text variant="footnote" color="secondary">Loading…</Text>
        </View>
      ) : !anyContent ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={32} color={t.colors.tertiary} />
          <Text variant="callout" color="label" style={{ marginTop: 12, fontWeight: '600' }}>
            No team members
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
          >
            Add team members or clients to collaborate on this project.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) =>
            item.kind === 'member' ? `m-${item.member.uid}` : `pi-${item.phoneNumber}`
          }
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.5 }}
              >
                {`${section.title.toUpperCase()} · ${section.data.length}`}
              </Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      <RolePickerSheet
        visible={sheetVisible}
        onClose={() => setSheet({ kind: 'idle' })}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        assignable={partyAssignable}
        current={sheetCurrent}
        onSave={onSaveRole}
        onRemove={showRemove ? onRemove : undefined}
        saveLabel={sheet.kind === 'invite' ? 'Add to project' : 'Save role'}
      />

      {/* Manual entry modal — appears when user picked "+ New Member"
          in /select-party (contact not in their phonebook). Captures
          name + phone, then hands off to the existing role picker. */}
      <ManualMemberEntryModal
        state={{ open: manualOpen }}
        onClose={() => setManualOpen(false)}
        onContinue={(name, phoneE164) => {
          setManualOpen(false);
          setSheet({ kind: 'invite', contact: { phone: phoneE164, name } });
        }}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  circleBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  badge: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});
