/**
 * Roles & Access — studio membership + per-project access.
 *
 * - Tap the role pill (dropdown) → RolePickerSheet only (role change).
 * - Tap the rest of the card (name / phone / project count / status) →
 *   ProjectAccessSheet only (project list).
 * - Add flow: contact → role → projects (unchanged chain).
 */
import * as Contacts from 'expo-contacts';
import { router, Stack } from 'expo-router';
import { useGuardedRoute } from "@/src/features/org/useGuardedRoute";
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import {
  inviteMember,
  removeMember,
} from '@/src/features/org/invites';
import { setMemberRole } from '@/src/features/org/organizations';
import { PlanLimitError } from '@/src/features/billing/errors';
import { usePaywall } from '@/src/features/billing/usePaywall';
import {
  ASSIGNABLE_ROLES_BY_ADMIN,
  ASSIGNABLE_ROLES_BY_SUPER_ADMIN,
  ROLE_LABELS,
  type AssignableRole,
} from '@/src/features/org/permissions';
import { ProjectAccessSheet } from '@/src/features/org/ProjectAccessSheet';
import { RolePickerSheet } from '@/src/features/org/RolePickerSheet';
import type { RoleKey } from '@/src/features/org/types';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { usePendingInvites } from '@/src/features/org/usePendingInvites';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProjects } from '@/src/features/projects/useProjects';
import type { Project } from '@/src/features/projects/types';
import { db, firestore } from '@/src/lib/firebase';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

type Row =
  | {
      kind: 'member';
      uid: string;
      displayName: string;
      phoneNumber: string;
      role: RoleKey | null;
      isSelf: boolean;
    }
  | {
      kind: 'pending';
      phoneNumber: string;
      displayName: string;
      role: RoleKey;
      projectIds: string[];
    };

type Step =
  | { kind: 'idle' }
  | { kind: 'invite-role'; contact: { phone: string; name?: string } }
  | {
      kind: 'invite-projects';
      contact: { phone: string; name?: string };
      role: AssignableRole;
    }
  | { kind: 'edit-role'; row: Row }
  | { kind: 'edit-projects'; row: Row };

/** Merge org.memberIds with org-scoped memberPublic projections (no peer users/{uid} reads). */
function useOrgMemberDocs(
  orgId: string | undefined,
  memberIds: string[] | undefined,
): {
  data: { uid: string; displayName?: string; phoneNumber?: string }[];
  loading: boolean;
} {
  const [pubByUid, setPubByUid] = useState<
    Record<string, { displayName?: string; phoneNumber?: string }>
  >({});
  const [loading, setLoading] = useState(true);

  const stableMembers = useMemo(() => (memberIds ?? []).join(','), [memberIds]);

  useEffect(() => {
    if (!orgId || !memberIds || memberIds.length === 0) {
      setPubByUid({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = db
      .collection('organizations')
      .doc(orgId)
      .collection('memberPublic')
      .onSnapshot(
        (snap) => {
          const next: Record<string, { displayName?: string; phoneNumber?: string }> = {};
          for (const d of snap.docs) {
            const v = d.data() as Record<string, unknown>;
            next[d.id] = {
              displayName: typeof v.displayName === 'string' ? v.displayName : undefined,
              phoneNumber: typeof v.phoneNumber === 'string' ? v.phoneNumber : undefined,
            };
          }
          setPubByUid(next);
          setLoading(false);
        },
        (err) => {
          console.warn('[team-roles] memberPublic snapshot error:', err);
          setLoading(false);
        },
      );
    return unsub;
  }, [orgId, stableMembers]);

  const data = useMemo(() => {
    const ids = memberIds ?? [];
    return ids.map((uid) => ({
      uid,
      ...pubByUid[uid],
    }));
  }, [memberIds, pubByUid]);

  return { data, loading };
}

/** Sync project docs for a joined member to match `projectIds` for their org-wide `role`. */
async function reconcileProjectAccess(
  uid: string,
  role: RoleKey,
  projectIds: string[],
  projects: Project[],
): Promise<void> {
  if (role === 'superAdmin') return;
  const wantsClient = role === 'client';
  const writes: Promise<unknown>[] = [];
  for (const p of projects) {
    const inMembers = (p.memberIds ?? []).includes(uid);
    const inClients = (p.clientUids ?? []).includes(uid);
    const shouldHave = projectIds.includes(p.id);

    if (wantsClient) {
      if (shouldHave && !inClients) {
        writes.push(
          db.collection('projects').doc(p.id).update({
            clientUids: firestore.FieldValue.arrayUnion(uid),
          }),
        );
      }
      if (!shouldHave && inClients) {
        writes.push(
          db.collection('projects').doc(p.id).update({
            clientUids: firestore.FieldValue.arrayRemove(uid),
          }),
        );
      }
      if (inMembers) {
        writes.push(
          db.collection('projects').doc(p.id).update({
            memberIds: firestore.FieldValue.arrayRemove(uid),
          }),
        );
      }
    } else {
      if (shouldHave && !inMembers) {
        writes.push(
          db.collection('projects').doc(p.id).update({
            memberIds: firestore.FieldValue.arrayUnion(uid),
          }),
        );
      }
      if (!shouldHave && inMembers) {
        writes.push(
          db.collection('projects').doc(p.id).update({
            memberIds: firestore.FieldValue.arrayRemove(uid),
          }),
        );
      }
      if (inClients) {
        writes.push(
          db.collection('projects').doc(p.id).update({
            clientUids: firestore.FieldValue.arrayRemove(uid),
          }),
        );
      }
    }
  }
  await Promise.all(writes);
}

function projectCountLabel(
  row: Row,
  projects: Project[],
  org: { ownerId?: string } | null | undefined,
): string {
  if (row.kind === 'member') {
    if (row.role === 'superAdmin' || row.uid === org?.ownerId) return 'All';
    const r = row.role;
    if (r === 'client') {
      const n = projects.filter((p) => (p.clientUids ?? []).includes(row.uid)).length;
      return String(n);
    }
    if (!r) return '0';
    const n = projects.filter((p) => (p.memberIds ?? []).includes(row.uid)).length;
    return String(n);
  }
  return String(row.projectIds.length);
}

export default function TeamAndRolesScreen() {
  useGuardedRoute({ capability: 'team.manage' });
  const { user } = useAuth();
  const { data: org, loading: orgLoading } = useCurrentOrganization();
  const { isOwner, isAdminish } = usePermissions();
  const { data: projects } = useProjects();
  const orgId = org?.id ?? null;

  // Union of every uid that belongs to this studio in some capacity:
  //   • org.memberIds[]      — regular paid team (admin / manager / etc.)
  //   • Object.keys(roles)   — anyone with an explicit role, INCLUDES clients
  //   • org.ownerId          — superAdmin (always shown, even if missing from memberIds)
  //
  // Without this union we'd only see paid members. Clients live in
  // `org.roles[uid] = 'client'` + per-project `clientUids[]`, NOT in
  // `org.memberIds` (so they don't count toward the maxMembers cap —
  // see invites.ts:244-286 and setMemberRole.ts:183-194). Reading
  // memberIds alone would silently hide them from the Team & Roles
  // screen, which is the bug we're fixing here. The union keeps plan
  // accounting untouched (server still owns memberIds) and just
  // surfaces clients in the UI.
  const allMemberUids = useMemo(() => {
    const ids = new Set<string>();
    for (const uid of org?.memberIds ?? []) ids.add(uid);
    for (const uid of Object.keys(org?.roles ?? {})) ids.add(uid);
    if (org?.ownerId) ids.add(org.ownerId);
    return Array.from(ids);
  }, [org?.memberIds, org?.roles, org?.ownerId]);

  const { data: memberDocs, loading: membersLoading } = useOrgMemberDocs(orgId ?? undefined, allMemberUids);
  const { data: pending, loading: pendingLoading } = usePendingInvites(orgId);
  const { openPaywall } = usePaywall();

  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [searchQuery, setSearchQuery] = useState('');

  // Deferred sheet transition.
  //
  // When the user picks a role on RolePickerSheet (Modal A) and we
  // immediately set step to `'invite-projects'`, both modals try to
  // swap in the same render: A's `visible` flips to false, B's flips
  // to true. iOS will NOT present a new full-screen modal while
  // another is still dismissing — by the time A's slide-down finishes
  // (~250 ms), iOS has discarded B's queued present and B never
  // appears. User sees both sheets close → "nothing happens".
  //
  // Fix: when picking a role, set step to `'idle'` synchronously
  // (close A) and stash the next state here. The effect below
  // schedules a 320 ms timer (covers iOS dismiss + safety margin),
  // then sets step to `'invite-projects'` to open B cleanly.
  const [pendingProjectsStep, setPendingProjectsStep] = useState<
    Extract<Step, { kind: 'invite-projects' }> | null
  >(null);

  useEffect(() => {
    if (!pendingProjectsStep) return;
    const t = setTimeout(() => {
      setStep((s) => {
        // Bail if the user cancelled the flow during the gap.
        if (s.kind !== 'idle') return s;
        return pendingProjectsStep;
      });
      setPendingProjectsStep(null);
    }, 320);
    return () => clearTimeout(t);
  }, [pendingProjectsStep]);

  const assignable: AssignableRole[] = isOwner
    ? ASSIGNABLE_ROLES_BY_SUPER_ADMIN
    : isAdminish
      ? ASSIGNABLE_ROLES_BY_ADMIN
      : [];

  const rows: Row[] = useMemo(() => {
    const memberPhones = new Set(
      memberDocs.map((m) => m.phoneNumber).filter((p): p is string => !!p),
    );
    const memberRows: Row[] = memberDocs.map((m) => {
      const explicit = org?.roles?.[m.uid];
      const role: RoleKey | null =
        explicit ??
        (m.uid === org?.ownerId
          ? 'superAdmin'
          : org?.memberIds?.includes(m.uid)
            ? 'admin'
            : null);
      return {
        kind: 'member',
        uid: m.uid,
        displayName: m.displayName?.trim() || m.phoneNumber || m.uid,
        phoneNumber: m.phoneNumber ?? '',
        role,
        isSelf: m.uid === user?.uid,
      };
    });
    const pendingRows: Row[] = pending
      .filter((p) => !memberPhones.has(p.phoneNumber))
      .map((p) => ({
        kind: 'pending',
        phoneNumber: p.phoneNumber,
        displayName: p.displayName?.trim() || p.phoneNumber,
        role: p.role,
        projectIds: p.projectIds,
      }));
    return [...memberRows, ...pendingRows];
  }, [memberDocs, pending, org, user]);

  const q = searchQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => {
      const name = r.displayName.toLowerCase();
      const phone = r.phoneNumber.toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [rows, q]);

  const openContactPicker = useCallback(async (): Promise<{
    phone: string;
    name?: string;
  } | null> => {
    Keyboard.dismiss();
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow contacts access to invite a member.');
        return null;
      }
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(resolve, 320);
        });
      });
      const result = await Contacts.presentContactPickerAsync();
      if (!result) return null;

      const name =
        result.name ?? [result.firstName, result.lastName].filter(Boolean).join(' ');
      const raw =
        result.phoneNumbers?.find(
          (p) => (p.number ?? p.digits ?? '').replace(/\D/g, '').length >= 10,
        ) ?? result.phoneNumbers?.[0];
      const phone = (raw?.number ?? raw?.digits ?? '').replace(/[^\d+]/g, '');
      if (!phone) {
        Alert.alert('No phone number', 'That contact has no phone number to invite.');
        return null;
      }
      return { phone, name: name || undefined };
    } catch (e) {
      Alert.alert(
        'Contacts',
        e instanceof Error ? e.message : 'Could not open the picker.',
      );
      return null;
    }
  }, []);

  const startInvite = useCallback(async () => {
    if (!orgId || !isAdminish) return;
    const picked = await openContactPicker();
    if (!picked) return;
    setStep({ kind: 'invite-role', contact: picked });
  }, [orgId, isAdminish, openContactPicker]);

  // ── Role sheet: invite picks role → advance to project sheet ──
  //
  // Two-step transition (see comment on `pendingProjectsStep` above):
  //   1. Close the role sheet immediately (step → 'idle')
  //   2. Stash the next sheet state in `pendingProjectsStep`; the
  //      effect opens it after the iOS dismiss animation completes.
  //
  // Without this, picking a role and tapping Continue does nothing
  // visible on iOS — both modals close in the same render cycle.
  const onInviteRoleSave = useCallback((role: AssignableRole) => {
    setStep((s) => {
      if (s.kind !== 'invite-role') return s;
      setPendingProjectsStep({
        kind: 'invite-projects',
        contact: s.contact,
        role,
      });
      return { kind: 'idle' };
    });
  }, []);

  // ── Role sheet: edit saves role only ──
  const onEditRoleSave = useCallback(
    async (newRole: AssignableRole) => {
      if (!orgId || step.kind !== 'edit-role') return;
      const row = step.row;
      try {
        if (row.kind === 'pending') {
          await inviteMember({
            orgId,
            phoneNumber: row.phoneNumber,
            role: newRole,
            projectIds: row.projectIds,
            displayName: row.displayName,
          });
        } else {
          // Server-only role mutation. The callable handles:
          //   - Permission check (caller must be SA / Admin; only
          //     SA can grant Admin).
          //   - Atomic role write to organizations/{id}.roles[uid].
          //   - Project-membership mirror swap when toggling
          //     in/out of `client` (memberIds ↔ clientUids).
          //   - Refreshing the target's auth-token claims.
          // The previous direct-Firestore path was a self-promotion
          // hole — Firestore rules now reject any client write to
          // organizations/*.roles, so this callable is the only way
          // to change a role.
          await setMemberRole({ orgId, uid: row.uid, role: newRole });
        }
        setStep({ kind: 'idle' });
      } catch (e) {
        if (e instanceof PlanLimitError) {
          openPaywall({ reason: 'plan_limit_members' });
          setStep({ kind: 'idle' });
          return;
        }
        Alert.alert('Could not save role', (e as Error).message);
      }
    },
    [orgId, step, projects, openPaywall],
  );

  // ── Project sheet save ──
  const onProjectsSave = useCallback(
    async (projectIds: string[]) => {
      if (!orgId) return;
      try {
        if (step.kind === 'invite-projects') {
          const { contact, role } = step;
          if (role === 'client' && projectIds.length === 0) {
            throw new Error('Pick at least one project for a Client.');
          }
          await inviteMember({
            orgId,
            phoneNumber: contact.phone,
            role,
            projectIds,
            displayName: contact.name,
          });
          setStep({ kind: 'idle' });
          return;
        }
        if (step.kind === 'edit-projects') {
          const row = step.row;
          if (row.kind === 'pending') {
            if (row.role === 'client' && projectIds.length === 0) {
              throw new Error('Pick at least one project for a Client.');
            }
            await inviteMember({
              orgId,
              phoneNumber: row.phoneNumber,
              role: row.role as AssignableRole,
              projectIds,
              displayName: row.displayName,
            });
          } else {
            const uid = row.uid;
            const role = row.role;
            if (!role || role === 'superAdmin') {
              setStep({ kind: 'idle' });
              return;
            }
            await reconcileProjectAccess(uid, role, projectIds, projects);
          }
          setStep({ kind: 'idle' });
        }
      } catch (e) {
        if (e instanceof PlanLimitError) {
          openPaywall({ reason: 'plan_limit_members' });
          setStep({ kind: 'idle' });
          return;
        }
        Alert.alert('Could not save', (e as Error).message);
      }
    },
    [orgId, step, projects, openPaywall],
  );

  const onRemove = useCallback(() => {
    if (!orgId || step.kind !== 'edit-role') return;
    const target = step.row;
    Alert.alert(
      'Remove from studio?',
      'They lose access to this studio immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (target.kind === 'member') {
                await removeMember({ orgId, uid: target.uid });
              } else {
                await removeMember({ orgId, phoneNumber: target.phoneNumber });
              }
              setStep({ kind: 'idle' });
            } catch (e) {
              Alert.alert('Could not remove', (e as Error).message);
            }
          },
        },
      ],
    );
  }, [orgId, step]);

  if (orgLoading) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      </Screen>
    );
  }

  const rolePickerVisible = step.kind === 'invite-role' || step.kind === 'edit-role';
  const projectPickerVisible = step.kind === 'invite-projects' || step.kind === 'edit-projects';

  const roleSheetTitle =
    step.kind === 'invite-role'
      ? step.contact.name ?? step.contact.phone
      : step.kind === 'edit-role'
        ? step.row.displayName
        : '';
  const roleSheetSubtitle =
    step.kind === 'invite-role'
      ? step.contact.phone
      : step.kind === 'edit-role'
        ? step.row.kind === 'member'
          ? step.row.phoneNumber || (step.row.isSelf ? 'You' : '')
          : `${step.row.phoneNumber} · Invited`
        : '';

  const rolePickerCurrent: RoleKey | null =
    step.kind === 'edit-role' &&
    step.row.role &&
    step.row.role !== 'superAdmin' &&
    assignable.includes(step.row.role as AssignableRole)
      ? (step.row.role as AssignableRole)
      : null;

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  const defaultSelectedIds: string[] = (() => {
    if (step.kind === 'invite-projects') {
      const { role } = step;
      if (role === 'admin' || role === 'accountant') return projectOptions.map((p) => p.id);
      return [];
    }
    if (step.kind === 'edit-projects') {
      const row = step.row;
      if (row.kind === 'member') {
        const uid = row.uid;
        const r = row.role;
        if (!r || r === 'superAdmin') return projectOptions.map((p) => p.id);
        const ids: string[] = [];
        for (const p of projects) {
          if (r === 'client') {
            if ((p.clientUids ?? []).includes(uid)) ids.push(p.id);
          } else if ((p.memberIds ?? []).includes(uid)) {
            ids.push(p.id);
          }
        }
        if (ids.length === 0 && r !== 'client') {
          for (const p of projects) {
            if ((p.memberIds ?? []).includes(uid) || (p.clientUids ?? []).includes(uid)) {
              ids.push(p.id);
            }
          }
        }
        return ids;
      }
      return row.projectIds;
    }
    return [];
  })();

  const projectSheetSubtitle =
    step.kind === 'invite-projects'
      ? `${step.contact.name ?? step.contact.phone} · ${ROLE_LABELS[step.role]}`
      : step.kind === 'edit-projects'
        ? `${step.row.displayName} · ${step.row.role ? ROLE_LABELS[step.row.role] : ''}`
        : '';

  const closeRoleSheet = () => {
    setStep((s) => {
      if (s.kind === 'invite-role') return { kind: 'idle' };
      if (s.kind === 'edit-role') return { kind: 'idle' };
      return s;
    });
  };

  const closeProjectSheet = () => {
    setStep((s) => {
      if (s.kind === 'invite-projects') return { kind: 'invite-role', contact: s.contact };
      if (s.kind === 'edit-projects') return { kind: 'idle' };
      return s;
    });
  };

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={color.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text variant="bodyStrong" color="text">
            Roles & Access
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={color.textMuted} style={styles.searchIcon} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search"
          placeholderTextColor={color.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filteredRows}
        keyExtractor={(r) => (r.kind === 'member' ? `m-${r.uid}` : `p-${r.phoneNumber}`)}
        ListHeaderComponent={() => (
          <View style={styles.sectionHeader}>
            <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
              TEAM · {filteredRows.length}
              {q ? ` · ${rows.length} total` : ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={() =>
          membersLoading || pendingLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={color.primary} />
            </View>
          ) : (
            <View style={styles.empty}>
              <Text variant="meta" color="textMuted">
                {q ? 'No matches.' : 'No members yet.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const isMember = item.kind === 'member';
          const isSelf = isMember && item.isSelf;
          const isSuperAdmin = isMember && item.role === 'superAdmin';
          const editable = isAdminish && !isSelf && !isSuperAdmin;

          const initials = (item.displayName ?? '?')
            .replace(/[^A-Za-z0-9]+/g, ' ')
            .trim()
            .split(' ')
            .map((s) => s.charAt(0))
            .join('')
            .slice(0, 2)
            .toUpperCase();

          const countLabel = projectCountLabel(item, projects, org);
          const isClient = isMember && item.role === 'client';
          const statusLabel = isMember ? 'Joined' : 'Invite';

          const openProjects = () => {
            if (!editable) return;
            setStep({ kind: 'edit-projects', row: item });
          };
          const openRole = () => {
            if (!editable) return;
            setStep({ kind: 'edit-role', row: item });
          };

          return (
            <View style={[styles.card, index === 0 && styles.cardFirst]}>
              <View style={styles.cardRow}>
                <Pressable
                  style={styles.cardBody}
                  onPress={openProjects}
                  disabled={!editable}
                >
                  <View
                    style={[
                      styles.avatar,
                      !isMember && styles.avatarPending,
                    ]}
                  >
                    <Text
                      variant="metaStrong"
                      color={isMember ? 'primary' : 'textMuted'}
                    >
                      {initials || '?'}
                    </Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text variant="bodyStrong" color="text" numberOfLines={1}>
                      {item.displayName}
                      {isSelf ? ' (you)' : ''}
                    </Text>
                    <Text variant="caption" color="textMuted" numberOfLines={1}>
                      {isMember ? item.phoneNumber || '—' : item.phoneNumber}
                    </Text>
                    <Text variant="metaStrong" style={styles.projectCount}>
                      Project: {countLabel}
                    </Text>
                  </View>
                  <Pressable
                    onPress={openProjects}
                    disabled={!editable}
                    style={styles.statusCol}
                  >
                    <Text variant="caption" color="textMuted">
                      {statusLabel}
                    </Text>
                  </Pressable>
                </Pressable>
                <Pressable
                  onPress={openRole}
                  disabled={!editable}
                  style={({ pressed }) => [
                    styles.rolePill,
                    isClient && styles.rolePillClient,
                    pressed && editable && { opacity: 0.85 },
                    !editable && { opacity: 0.55 },
                  ]}
                >
                  <Text
                    variant="metaStrong"
                    color={isClient ? 'warning' : 'primary'}
                    numberOfLines={1}
                  >
                    {item.role ? ROLE_LABELS[item.role] : 'No role'}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={isClient ? color.warning : color.primary}
                  />
                </Pressable>
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.cardSep} />}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      />

      {isAdminish ? (
        <View style={styles.footer}>
          <Pressable
            onPress={startInvite}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="add" size={20} color={color.onPrimary} />
            <Text variant="bodyStrong" style={{ color: color.onPrimary }}>
              Add Team Member
            </Text>
          </Pressable>
        </View>
      ) : null}

      <RolePickerSheet
        visible={rolePickerVisible}
        onClose={closeRoleSheet}
        title={roleSheetTitle}
        subtitle={roleSheetSubtitle}
        assignable={assignable}
        current={step.kind === 'invite-role' ? null : rolePickerCurrent}
        onSave={
          step.kind === 'invite-role'
            ? onInviteRoleSave
            : step.kind === 'edit-role'
              ? onEditRoleSave
              : async () => {}
        }
        onRemove={step.kind === 'edit-role' ? onRemove : undefined}
        saveLabel={step.kind === 'invite-role' ? 'Continue' : 'Save'}
      />

      <ProjectAccessSheet
        visible={projectPickerVisible}
        onClose={closeProjectSheet}
        title="Project List"
        subtitle={projectSheetSubtitle}
        projects={projectOptions}
        selectedIds={defaultSelectedIds}
        onSave={onProjectsSave}
        saveLabel={step.kind === 'invite-projects' ? 'Add to team' : 'Save'}
        // Clients can only access specific projects, never the whole studio.
        // Disabling Save until at least one is picked makes the constraint
        // visible up-front instead of failing silently behind the modal.
        minSelected={
          (step.kind === 'invite-projects' && step.role === 'client')
          || (step.kind === 'edit-projects'
            && step.row.kind === 'pending'
            && step.row.role === 'client')
          || (step.kind === 'edit-projects'
            && step.row.kind === 'member'
            && step.row.role === 'client')
            ? 1
            : 0
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: 10,
    backgroundColor: color.bg,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    gap: 10,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: screenInset,
    marginTop: space.sm,
    marginBottom: space.xs,
    paddingHorizontal: space.sm,
    minHeight: 44,
    borderRadius: radius.sm,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: color.text,
    paddingVertical: 8,
  },
  listContent: { paddingBottom: space.xxl + 72 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: radius.sm,
    backgroundColor: color.primary,
  },
  sectionHeader: {
    paddingHorizontal: screenInset,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  sectionLabel: { letterSpacing: 0.6 },
  card: {
    marginHorizontal: screenInset,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    overflow: 'hidden',
  },
  cardFirst: {},
  cardSep: { height: space.xs },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: space.sm,
    paddingRight: space.sm,
    gap: 8,
  },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  statusCol: {
    justifyContent: 'center',
    paddingLeft: 4,
    minWidth: 52,
    alignItems: 'flex-end',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPending: {
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderStyle: 'dashed',
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  projectCount: {
    color: color.primary,
    marginTop: 2,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: color.primarySoft,
    maxWidth: 120,
  },
  rolePillClient: {
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
  },
  empty: { padding: space.lg, alignItems: 'center', justifyContent: 'center' },
});
