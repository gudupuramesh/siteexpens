import * as Contacts from 'expo-contacts';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Keyboard,
  Pressable,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';

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
import { RolePickerSheet } from '@/src/features/org/RolePickerSheet';
import { usePendingInvites } from '@/src/features/org/usePendingInvites';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProjectMembers, type ProjectMember } from '@/src/features/projects/useProjectMembers';
import { db, firestore } from '@/src/lib/firebase';
import { formatIndianPhone, normalizeIndianPhoneE164 } from '@/src/lib/phone';
import { Text } from '@/src/ui/Text';
import { Screen } from '@/src/ui/Screen';
import { color, screenInset, space } from '@/src/theme';
import type { RoleKey } from '@/src/features/org/types';

type Row =
  | { kind: 'member'; member: ProjectMember }
  | { kind: 'pending'; phoneNumber: string; displayName: string; role: string };

type SheetState =
  | { kind: 'idle' }
  | { kind: 'invite'; contact: { phone: string; name?: string } }
  | { kind: 'edit'; row: Row };

export default function ProjectMembersScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const currentUid = user?.uid ?? '';
  const { isOwner, isAdminish, role } = usePermissions();

  const { members, loading } = useProjectMembers(projectId);
  const { data: pending } = usePendingInvites(orgId || null);

  const [sheet, setSheet] = useState<SheetState>({ kind: 'idle' });

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
      !memberPhoneSet.has(p.phoneNumber) &&
      (p.projectIds.includes(projectId ?? '') || p.projectId === projectId),
  );

  const startAdd = useCallback(async () => {
    if (!projectId || !orgId || !canManageTeam) return;
    Keyboard.dismiss();
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow contacts access to add a member.');
        return;
      }
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(resolve, 320);
        });
      });
      const result = await Contacts.presentContactPickerAsync();
      if (!result) return;
      const name =
        result.name ?? [result.firstName, result.lastName].filter(Boolean).join(' ');
      const candidates =
        result.phoneNumbers?.map((p) => p.number ?? p.digits ?? '') ?? [];
      let normalized: string | null = null;
      for (const c of candidates) {
        const n = normalizeIndianPhoneE164(c);
        if (n) {
          normalized = n;
          break;
        }
      }
      if (!normalized) {
        Alert.alert(
          'Phone not supported',
          'That contact needs a 10-digit Indian mobile number (we currently support +91 only).',
        );
        return;
      }
      setSheet({ kind: 'invite', contact: { phone: normalized, name: name || undefined } });
    } catch (e) {
      Alert.alert('Contacts', e instanceof Error ? e.message : 'Could not open the picker.');
    }
  }, [orgId, projectId, canManageTeam]);

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
      return (
        <Pressable
          onPress={() => onRowPress(item)}
          disabled={!tappable}
          style={({ pressed }) => [styles.row, tappable && pressed && { opacity: 0.78 }]}
        >
          <View
            style={[
              styles.avatar,
              isClient ? styles.avatarClient : styles.avatarMember,
            ]}
          >
            <Text
              variant="metaStrong"
              style={{ color: isClient ? color.warning : color.onPrimary }}
            >
              {initial}
            </Text>
          </View>
          <View style={styles.body}>
            <Text variant="rowTitle" color="text" numberOfLines={1}>
              {item.member.displayName}
              {isSelf ? ' (You)' : ''}
            </Text>
            <Text variant="meta" color="textMuted" numberOfLines={1}>
              {roleLabel}
              {phoneDisplay ? ` · ${phoneDisplay}` : ''}
            </Text>
          </View>
          {tappable ? (
            <Ionicons name="ellipsis-vertical" size={16} color={color.textMuted} />
          ) : (
            <View style={styles.memberBadge}>
              <Ionicons
                name={isClient ? 'person-outline' : 'shield-checkmark-outline'}
                size={14}
                color={isClient ? color.warning : color.primary}
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
        style={({ pressed }) => [styles.row, canManageTeam && pressed && { opacity: 0.78 }]}
      >
        <View style={[styles.avatar, styles.avatarPending]}>
          <Text variant="metaStrong" color="textMuted">{initial}</Text>
        </View>
        <View style={styles.body}>
          <Text variant="rowTitle" color="text" numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text variant="meta" color="textMuted" numberOfLines={1}>
            {ROLE_LABELS[item.role as keyof typeof ROLE_LABELS] ?? 'Member'} · Invited
            {phoneDisplay ? ` · ${phoneDisplay}` : ''}
          </Text>
        </View>
        {canManageTeam && (
          <Ionicons name="ellipsis-vertical" size={16} color={color.textMuted} />
        )}
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

  const showRemove =
    sheet.kind === 'edit' && canManageTeam;

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.navBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="bodyStrong" color="text" numberOfLines={1}>
            Team Members
          </Text>
        </View>
        <View style={styles.navBtn} />
      </View>

      {canManageTeam && (
        <Pressable
          onPress={startAdd}
          style={({ pressed }) => [styles.inviteCta, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="person-add-outline" size={16} color={color.primary} />
          <Text variant="metaStrong" color="primary">
            Add team member or client
          </Text>
        </Pressable>
      )}

      {loading && !anyContent ? (
        <View style={styles.empty}>
          <Text variant="meta" color="textMuted">Loading…</Text>
        </View>
      ) : !anyContent ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={28} color={color.textFaint} />
          <Text variant="bodyStrong" color="text" style={{ marginTop: space.xxs }}>
            No team members
          </Text>
          <Text variant="meta" color="textMuted" align="center">
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
              <Text variant="caption" color="textMuted">
                {section.title.toUpperCase()} · {section.data.length}
              </Text>
            </View>
          )}
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
        saveLabel={sheet.kind === 'invite' ? 'Add to project' : 'Save Role'}
      />
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
  inviteCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: color.primarySoft,
    borderWidth: 1,
    borderColor: color.primary,
  },
  listContent: {
    paddingHorizontal: screenInset,
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingTop: space.md,
    paddingBottom: space.xs,
    backgroundColor: color.bgGrouped,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.separator,
    borderRadius: 10,
    marginBottom: space.xs,
    gap: space.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMember: {
    backgroundColor: color.primary,
  },
  avatarClient: {
    backgroundColor: color.warningSoft,
    borderWidth: 1,
    borderColor: color.warning,
  },
  avatarPending: {
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderStyle: 'dashed',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenInset * 2,
    gap: space.xs,
  },
});
