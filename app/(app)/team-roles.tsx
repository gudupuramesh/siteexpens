/**
 * Roles & Access — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Roles & access" · count caption
 *   2. Search bar (fill3 + magnifier)
 *   3. Combined Joined / Pending / You tile (hairline-divided)
 *   4. Sectioned list — Members + Pending Invites groups
 *      Each row: tone-tinted square initial avatar + name + phone + project
 *      count meta + role pill (tap → role sheet) + chevron (tap → projects sheet)
 *   5. Floating "Add team member" pill (Admin / Owner only)
 *
 * Sheets reused from existing flows:
 *   • RolePickerSheet     — kept (used elsewhere; touching it would
 *                           ripple into other consumers)
 *   • ProjectAccessSheet  — kept (same reason)
 *
 * Preserves the two-step modal transition that fixes the iOS bug where
 * dismissing one Modal while presenting another causes the second one
 * to silently never appear (see `pendingProjectsStep`).
 */
import * as Contacts from 'expo-contacts';
import { router, Stack } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/features/auth/useAuth';
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
import { ProjectAccessSheet } from '@/src/features/org/ProjectAccessSheet';
import { RolePickerSheet } from '@/src/features/org/RolePickerSheet';
import type { RoleKey } from '@/src/features/org/types';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { usePendingInvites } from '@/src/features/org/usePendingInvites';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProjects } from '@/src/features/projects/useProjects';
import type { Project } from '@/src/features/projects/types';
import { db, firestore } from '@/src/lib/firebase';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

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

/**
 * Tone for each role's avatar / pill.
 *
 * Color discipline: roles are categorical labels, not actionable status — so
 * they default to a neutral tone (fill3 background + secondary glyph). Only
 * `superAdmin` keeps a coloured pill (red), because the privileged role
 * deserves visual emphasis. The pill is structurally identical; only the
 * fill changes.
 *
 * Returns an object shaped like a palette token (`base` / `soft` / `softDark`)
 * so the consuming JSX doesn't have to branch — `tone.soft`, `tone.base`,
 * etc. just work whether the role is superAdmin or anything else.
 */
function roleTone(
  role: RoleKey | null,
  t: ReturnType<typeof useThemeV2>,
): { base: string; soft: string; softDark: string } {
  if (role === 'superAdmin') return t.palette.red;
  return {
    base: t.colors.secondary,
    soft: t.colors.fill3,
    softDark: t.colors.fill3,
  };
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const t = useThemeV2();
  const refresh = usePullToRefresh();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: org, loading: orgLoading } = useCurrentOrganization();
  const { isOwner, isAdminish } = usePermissions();
  const { data: projects } = useProjects();
  const orgId = org?.id ?? null;

  const allMemberUids = useMemo(() => {
    const ids = new Set<string>();
    for (const uid of org?.memberIds ?? []) ids.add(uid);
    for (const uid of Object.keys(org?.roles ?? {})) ids.add(uid);
    if (org?.ownerId) ids.add(org.ownerId);
    return Array.from(ids);
  }, [org?.memberIds, org?.roles, org?.ownerId]);

  const { data: memberDocs, loading: membersLoading } = useOrgMemberDocs(
    orgId ?? undefined,
    allMemberUids,
  );
  const { data: pending, loading: pendingLoading } = usePendingInvites(orgId);
  const { openPaywall } = usePaywall();

  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [searchQuery, setSearchQuery] = useState('');

  // See original implementation comment — iOS modal-swap workaround.
  const [pendingProjectsStep, setPendingProjectsStep] = useState<
    Extract<Step, { kind: 'invite-projects' }> | null
  >(null);

  useEffect(() => {
    if (!pendingProjectsStep) return;
    const tt = setTimeout(() => {
      setStep((s) => {
        if (s.kind !== 'idle') return s;
        return pendingProjectsStep;
      });
      setPendingProjectsStep(null);
    }, 320);
    return () => clearTimeout(tt);
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

  const sections = useMemo(() => {
    const members: Row[] = [];
    const pendingItems: Row[] = [];
    for (const r of filteredRows) {
      if (r.kind === 'member') members.push(r);
      else pendingItems.push(r);
    }
    return { members, pendingItems };
  }, [filteredRows]);

  const counts = useMemo(() => {
    let joined = 0;
    let pendingCount = 0;
    let owner = 0;
    for (const r of rows) {
      if (r.kind === 'member') {
        joined++;
        if (r.isSelf) owner++;
      } else {
        pendingCount++;
      }
    }
    return { joined, pending: pendingCount, owner };
  }, [rows]);

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
    [orgId, step, openPaywall],
  );

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
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <View style={styles.loading}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
    );
  }

  const rolePickerVisible = step.kind === 'invite-role' || step.kind === 'edit-role';
  const projectPickerVisible =
    step.kind === 'invite-projects' || step.kind === 'edit-projects';

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

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const isLoading = membersLoading || pendingLoading;

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
            Roles & access
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            {counts.joined} JOINED · {counts.pending} PENDING
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...refresh.props} />}
      >
        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: t.colors.fill3, borderRadius: t.radii.field },
            ]}
          >
            <Ionicons name="search" size={16} color={t.colors.tertiary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search name or phone"
              placeholderTextColor={t.colors.tertiary}
              style={[
                styles.searchInput,
                { color: t.colors.label, ...t.type.callout },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Combined summary */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.card,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            <SummaryCol
              label="JOINED"
              value={String(counts.joined)}
              color={t.palette.green.base}
            />
            <View style={[styles.summaryDivider, { backgroundColor: t.colors.separator }]} />
            <SummaryCol
              label="PENDING"
              value={String(counts.pending)}
              color={t.palette.orange.base}
            />
            <View style={[styles.summaryDivider, { backgroundColor: t.colors.separator }]} />
            <SummaryCol
              label="PROJECTS"
              value={String(projects.length)}
              color={t.palette.blue.base}
            />
          </View>
        </View>

        {/* Lists */}
        {isLoading && rows.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <ActivityIndicator color={t.palette.blue.base} />
          </View>
        ) : filteredRows.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                  borderRadius: t.radii.tile,
                },
              ]}
            >
              <Ionicons name="people-outline" size={28} color={t.palette.blue.base} />
            </View>
            <Text
              variant="headline"
              color="label"
              style={{ marginTop: 12, fontWeight: '600' }}
            >
              {q ? 'No matches' : 'No team members yet'}
            </Text>
            {!q && isAdminish ? (
              <Text
                variant="footnote"
                color="secondary"
                style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}
              >
                Add admins, managers, accountants, site engineers, and clients.
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            {sections.members.length > 0 ? (
              <TeamSection
                header="Members"
                count={sections.members.length}
              >
                {sections.members.map((row, idx) => (
                  <MemberRow
                    key={`m-${row.kind === 'member' ? row.uid : row.phoneNumber}`}
                    row={row}
                    org={org}
                    projects={projects}
                    isAdminish={isAdminish}
                    divider={idx < sections.members.length - 1}
                    onOpenRole={() => setStep({ kind: 'edit-role', row })}
                    onOpenProjects={() => setStep({ kind: 'edit-projects', row })}
                  />
                ))}
              </TeamSection>
            ) : null}
            {sections.pendingItems.length > 0 ? (
              <TeamSection
                header="Pending invites"
                count={sections.pendingItems.length}
              >
                {sections.pendingItems.map((row, idx) => (
                  <MemberRow
                    key={`p-${row.kind === 'pending' ? row.phoneNumber : row.kind}`}
                    row={row}
                    org={org}
                    projects={projects}
                    isAdminish={isAdminish}
                    divider={idx < sections.pendingItems.length - 1}
                    onOpenRole={() => setStep({ kind: 'edit-role', row })}
                    onOpenProjects={() => setStep({ kind: 'edit-projects', row })}
                  />
                ))}
              </TeamSection>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Floating add button */}
      {isAdminish ? (
        <View
          style={[
            styles.floatingBar,
            { bottom: 24 + insets.bottom },
          ]}
        >
          <Pressable
            onPress={startInvite}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: t.palette.blue.base, borderRadius: 999 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text
              variant="callout"
              style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}
            >
              Add team member
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
        title="Project access"
        subtitle={projectSheetSubtitle}
        projects={projectOptions}
        selectedIds={defaultSelectedIds}
        onSave={onProjectsSave}
        saveLabel={step.kind === 'invite-projects' ? 'Add to team' : 'Save'}
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
    </View>
  );
}

function TeamSection({
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

function MemberRow({
  row,
  org,
  projects,
  isAdminish,
  divider,
  onOpenRole,
  onOpenProjects,
}: {
  row: Row;
  org: { ownerId?: string } | null | undefined;
  projects: Project[];
  isAdminish: boolean;
  divider: boolean;
  onOpenRole: () => void;
  onOpenProjects: () => void;
}) {
  const t = useThemeV2();
  const isMember = row.kind === 'member';
  const isSelf = isMember && row.isSelf;
  const isSuperAdmin = isMember && row.role === 'superAdmin';
  const editable = isAdminish && !isSelf && !isSuperAdmin;

  const tone = roleTone(row.role, t);
  const initials = (row.displayName ?? '?')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((s) => s.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const countLabel = projectCountLabel(row, projects, org);
  const roleLabel = row.role ? ROLE_LABELS[row.role] : 'No role';
  const phone = row.kind === 'member' ? row.phoneNumber || '—' : row.phoneNumber;

  return (
    <Pressable
      onPress={editable ? onOpenProjects : undefined}
      style={({ pressed }) => [
        styles.memberRow,
        pressed && editable && { backgroundColor: t.colors.fill3 },
      ]}
    >
      {/* Avatar */}
      <View
        style={[
          styles.avatar,
          {
            backgroundColor:
              row.kind === 'pending'
                ? t.colors.fill3
                : t.mode === 'dark'
                  ? tone.softDark
                  : tone.soft,
            borderRadius: t.radii.tile,
            borderColor: row.kind === 'pending' ? tone.base + '33' : 'transparent',
            borderWidth: row.kind === 'pending' ? 1 : 0,
            borderStyle: row.kind === 'pending' ? 'dashed' : 'solid',
          },
        ]}
      >
        <Text
          variant="headline"
          style={{
            color: row.kind === 'pending' ? t.colors.tertiary : tone.base,
            fontWeight: '700',
          }}
        >
          {initials || '?'}
        </Text>
      </View>

      {/* Body */}
      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            variant="body"
            color="label"
            style={{ flex: 1 }}
            numberOfLines={1}
          >
            {row.displayName}
            {isSelf ? ' (you)' : ''}
          </Text>
          {row.kind === 'pending' ? (
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                  borderRadius: 999,
                  marginLeft: 8,
                },
              ]}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: t.palette.orange.base,
                  marginRight: 4,
                }}
              />
              <Text
                variant="caption2"
                style={{
                  color: t.palette.orange.base,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                }}
              >
                INVITE
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          variant="caption1"
          color="secondary"
          numberOfLines={1}
          style={{ marginTop: 2 }}
        >
          {phone}
          {countLabel ? `  ·  ${countLabel === 'All' ? 'All projects' : `${countLabel} project${countLabel === '1' ? '' : 's'}`}` : ''}
        </Text>
      </View>

      {/* Role pill */}
      <Pressable
        onPress={editable ? onOpenRole : undefined}
        disabled={!editable}
        hitSlop={6}
        style={({ pressed }) => [
          styles.rolePill,
          {
            backgroundColor:
              t.mode === 'dark' ? tone.softDark : tone.soft,
            borderRadius: 999,
            marginLeft: 8,
          },
          pressed && editable && { opacity: 0.85 },
          !editable && { opacity: 0.7 },
        ]}
      >
        <Text
          variant="caption2"
          style={{
            color: tone.base,
            fontWeight: '700',
            letterSpacing: 0.3,
          }}
          numberOfLines={1}
        >
          {roleLabel.toUpperCase()}
        </Text>
        {editable ? (
          <Ionicons
            name="chevron-down"
            size={11}
            color={tone.base}
            style={{ marginLeft: 3 }}
          />
        ) : null}
      </Pressable>

      {divider ? (
        <View
          style={[
            styles.rowDivider,
            { backgroundColor: t.colors.separator, left: 64 },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

function SummaryCol({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.summaryCol}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text
        variant="title3"
        style={{ color, marginTop: 4, fontWeight: '700' }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, paddingVertical: 0, margin: 0 },

  // Summary
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 10,
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

  // Member row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 64,
    position: 'relative',
  },
  avatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 130,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  // Empty
  emptyIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Floating add button
  floatingBar: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
