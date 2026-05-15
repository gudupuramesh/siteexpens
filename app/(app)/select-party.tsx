/**
 * Select Party — unified full-screen picker.
 *
 * Replaces the old fragmented flow (bottom-sheet + native iOS contact
 * picker + dual buttons) with a single scrollable list that shows:
 *
 *   1. Existing org parties (with role badge on the right)
 *   2. "Select from Phonebook" — device contacts inline, deduped
 *      against existing parties, only those with a name + valid IN
 *      phone number
 *
 * Tap on an existing party  → returns it via `newPartyOutbox` + back.
 * Tap on a phone contact    → opens `/add-party` prefilled with the
 *                              contact's name + phone.
 * Tap on "+ New Party"      → opens `/add-party` blank.
 *
 * The `/add-party` form handles role + extra fields + duplicate-phone
 * detection (`DuplicatePhoneError` → outbox returns the existing party
 * id) and pops back when done. The originating screen drains the
 * outbox via its own `useFocusEffect`.
 *
 * Designed for V2 extensibility:
 *   - `mode: 'party' | 'team' | 'both'` query param will add a third
 *     section for org team members + alternate routing for OTP invites.
 *   - `lockedTypes: 'worker,staff'` will filter Section 1 (e.g. for
 *     `add-labour` which only wants worker-type parties).
 *   These are NOT wired in V1 — the picker accepts the params if
 *   present but treats anything other than `mode='party'` as the
 *   default party-only mode.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { setNewTeamMemberOutbox } from '@/src/features/org/newTeamMemberOutbox';
import { setNewPartyOutbox } from '@/src/features/parties/newPartyOutbox';
import {
  getPartyTypeLabel,
  type Party,
  type PartyType,
} from '@/src/features/parties/types';
import { useParties } from '@/src/features/parties/useParties';
import { normalizeIndianPhoneE164 } from '@/src/lib/phone';
import type { ProjectMember } from '@/src/features/projects/useProjectMembers';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { SearchBar } from '@/src/ui/v2/SearchBar';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

// ── Types ───────────────────────────────────────────────────────────

type ContactRow = {
  id: string;
  name: string;
  phoneE164: string;
};

type Mode = 'party' | 'team' | 'both';

// Module-level cache for the current app session — once we've fetched
// the device contacts, re-opening this screen is instant. The cache
// only holds normalized rows (name + E.164 phone), not raw Contacts
// objects, so memory stays small even on phones with 1000+ contacts.
let contactsCache: ContactRow[] | null = null;

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeContact(c: Contacts.ExistingContact): ContactRow | null {
  const name =
    (c.name ?? '').trim() ||
    [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
    (c.company ?? '').trim();
  if (!name) return null;

  const candidates = c.phoneNumbers?.map((p) => p.number ?? p.digits ?? '') ?? [];
  for (const raw of candidates) {
    const phoneE164 = normalizeIndianPhoneE164(raw);
    if (phoneE164) {
      return { id: c.id, name, phoneE164 };
    }
  }
  return null;
}

function matchesQuery(text: string, q: string): boolean {
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

// ── Component ───────────────────────────────────────────────────────

export default function SelectPartyScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();

  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: parties } = useParties(orgId);
  const { members } = useOrgMembers(orgId);

  const params = useLocalSearchParams<{
    mode?: string;
    lockedTypes?: string;
  }>();
  // Two operating modes:
  //   • 'party' (default) — picks/creates parties (vendor / client /
  //     worker etc.). Section 1 = saved parties, Section 2 = phonebook.
  //   • 'team' — picks/invites org team members. Section 1 = org members,
  //     Section 2 = phonebook (deduped against members by phone).
  const mode: Mode = params.mode === 'team' ? 'team' : 'party';
  const lockedTypes = useMemo<Set<PartyType> | null>(() => {
    if (!params.lockedTypes) return null;
    return new Set(params.lockedTypes.split(',').map((s) => s.trim()) as PartyType[]);
  }, [params.lockedTypes]);

  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>(contactsCache ?? []);
  const [contactsLoading, setContactsLoading] = useState(contactsCache === null);
  const [permission, setPermission] = useState<
    'undetermined' | 'granted' | 'denied'
  >('undetermined');

  // ── Load device contacts once per session ────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (contactsCache !== null) {
      // Already cached — assume permission still granted; if not we'll
      // surface that on the next request.
      setContacts(contactsCache);
      setContactsLoading(false);
      setPermission('granted');
      return;
    }
    (async () => {
      try {
        const current = await Contacts.getPermissionsAsync();
        let status = current.status;
        if (status === 'undetermined') {
          const requested = await Contacts.requestPermissionsAsync();
          status = requested.status;
        }
        if (cancelled) return;

        if (status !== 'granted') {
          setPermission('denied');
          setContactsLoading(false);
          return;
        }
        setPermission('granted');

        const result = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Name,
            Contacts.Fields.FirstName,
            Contacts.Fields.LastName,
            Contacts.Fields.Company,
            Contacts.Fields.PhoneNumbers,
          ],
          sort: Contacts.SortTypes.FirstName,
          pageSize: 500,
        });
        if (cancelled) return;

        const rows: ContactRow[] = [];
        for (const c of result.data) {
          const row = normalizeContact(c);
          if (row) rows.push(row);
        }
        contactsCache = rows;
        setContacts(rows);
        setContactsLoading(false);
      } catch (err) {
        if (cancelled) return;
        // Treat any failure as denied — show the banner so the user
        // can retry via Settings.
        setPermission('denied');
        setContactsLoading(false);
        // Don't alert — the inline banner is enough.
        // eslint-disable-next-line no-console
        console.warn('[select-party] contacts fetch failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Sections ─────────────────────────────────────────────────────

  const q = query.trim().toLowerCase();

  const filteredParties = useMemo<Party[]>(() => {
    let list = parties.slice();
    if (lockedTypes) {
      list = list.filter((p) => lockedTypes.has(p.partyType));
    }
    if (q) {
      list = list.filter(
        (p) =>
          matchesQuery(p.name, q) ||
          matchesQuery(p.phone ?? '', q) ||
          matchesQuery(getPartyTypeLabel(p.partyType), q),
      );
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [parties, lockedTypes, q]);

  const filteredMembers = useMemo<ProjectMember[]>(() => {
    if (mode !== 'team') return [];
    let list = members.slice();
    if (q) {
      list = list.filter(
        (m) =>
          matchesQuery(m.displayName, q) ||
          matchesQuery(m.phoneNumber ?? '', q),
      );
    }
    list.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return list;
  }, [members, mode, q]);

  const filteredContacts = useMemo<ContactRow[]>(() => {
    if (permission !== 'granted') return [];
    // Dedupe against the active section by phone — if the contact is
    // already a party (or org member, in team mode), don't show it
    // again in the phonebook.
    const usedPhones = new Set<string>(
      mode === 'team'
        ? members.map((m) => m.phoneNumber ?? '').filter(Boolean)
        : parties.map((p) => p.phone),
    );
    return contacts.filter((c) => {
      if (usedPhones.has(c.phoneE164)) return false;
      if (!q) return true;
      return matchesQuery(c.name, q) || matchesQuery(c.phoneE164, q);
    });
  }, [contacts, parties, members, mode, permission, q]);

  // ── Handlers (party mode) ───────────────────────────────────────

  const pickExistingParty = useCallback((p: Party) => {
    setNewPartyOutbox({ id: p.id, name: p.name });
    router.back();
  }, []);

  const pickContactAsParty = useCallback((c: ContactRow) => {
    router.push({
      pathname: '/(app)/add-party',
      params: {
        prefillName: c.name,
        prefillPhone: c.phoneE164,
        returnSelection: '1',
      },
    });
  }, []);

  const pressNewParty = useCallback(() => {
    router.push({
      pathname: '/(app)/add-party',
      params: { returnSelection: '1' },
    });
  }, []);

  // ── Handlers (team mode) ────────────────────────────────────────
  // Team mode doesn't create parties — it hands the picked person
  // (existing member, phonebook contact, or "manual" sentinel) back
  // to the caller via newTeamMemberOutbox. The caller (members.tsx /
  // team-roles.tsx) opens its own role-picker + invite flow.

  const pickExistingMember = useCallback((m: ProjectMember) => {
    setNewTeamMemberOutbox({
      kind: 'existing',
      uid: m.uid,
      displayName: m.displayName,
      phoneNumber: m.phoneNumber ?? '',
    });
    router.back();
  }, []);

  const pickContactAsMember = useCallback((c: ContactRow) => {
    setNewTeamMemberOutbox({
      kind: 'contact',
      displayName: c.name,
      phoneE164: c.phoneE164,
    });
    router.back();
  }, []);

  const pressNewMember = useCallback(() => {
    setNewTeamMemberOutbox({ kind: 'manual' });
    router.back();
  }, []);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      Alert.alert(
        'Could not open Settings',
        'Open the iOS Settings app, find Interior OS under Privacy → Contacts, and enable access.',
      );
    });
  }, []);

  // ── Render ──────────────────────────────────────────────────────

  type SectionItem =
    | { kind: 'party'; party: Party }
    | { kind: 'member'; member: ProjectMember }
    | { kind: 'contact'; contact: ContactRow }
    | { kind: 'banner-permission' }
    | { kind: 'banner-loading' }
    | { kind: 'empty-parties' }
    | { kind: 'empty-members' }
    | { kind: 'empty-contacts' };

  // Section 1 differs by mode: parties (party mode) or org members (team mode).
  const primarySectionData: SectionItem[] =
    mode === 'team'
      ? filteredMembers.length
        ? filteredMembers.map((m) => ({ kind: 'member' as const, member: m }))
        : [{ kind: 'empty-members' as const }]
      : filteredParties.length
        ? filteredParties.map((p) => ({ kind: 'party' as const, party: p }))
        : [{ kind: 'empty-parties' as const }];

  const contactSectionData: SectionItem[] = (() => {
    if (contactsLoading) return [{ kind: 'banner-loading' as const }];
    if (permission === 'denied') return [{ kind: 'banner-permission' as const }];
    if (filteredContacts.length === 0) return [{ kind: 'empty-contacts' as const }];
    return filteredContacts.map((c) => ({ kind: 'contact' as const, contact: c }));
  })();

  const sections = [
    {
      title: mode === 'team' ? 'Team members' : 'Parties',
      data: primarySectionData,
    },
    { title: 'Select from Phonebook', data: contactSectionData },
  ];

  // Mode-aware copy for the header + add button.
  const screenTitle = mode === 'team' ? 'Select team member' : 'Select party';
  const newBtnLabel = mode === 'team' ? 'New Member' : 'New Party';
  const newBtnA11y =
    mode === 'team' ? 'Add a new team member' : 'Add a new party';
  const onPressNew = mode === 'team' ? pressNewMember : pressNewParty;

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Top header — back / title / + New Party */}
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
            styles.headerSideBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={t.colors.label} />
        </Pressable>

        <Text
          variant="headline"
          color="label"
          style={{ flex: 1, textAlign: 'center', fontWeight: '700' }}
          numberOfLines={1}
        >
          {screenTitle}
        </Text>

        <Pressable
          onPress={onPressNew}
          hitSlop={6}
          style={({ pressed }) => [
            styles.newPartyBtn,
            {
              backgroundColor:
                t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
              borderRadius: t.radii.pill,
            },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel={newBtnA11y}
        >
          <Ionicons name="add" size={14} color={t.palette.blue.base} />
          <Text
            variant="caption1"
            style={{ color: t.palette.blue.base, fontWeight: '700', marginLeft: 4 }}
          >
            {newBtnLabel}
          </Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or phone"
        />
      </View>

      {/* Sections */}
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => {
          if (item.kind === 'party') return `p-${item.party.id}`;
          if (item.kind === 'member') return `m-${item.member.uid}`;
          if (item.kind === 'contact') return `c-${item.contact.id}-${index}`;
          return `${item.kind}-${index}`;
        }}
        renderSectionHeader={({ section }) => (
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: t.colors.bg },
            ]}
          >
            <Text
              variant="caption2"
              color="secondary"
              style={{ letterSpacing: 0.6 }}
            >
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          if (item.kind === 'party') {
            return (
              <PartyOptionRow
                party={item.party}
                onPress={() => pickExistingParty(item.party)}
              />
            );
          }
          if (item.kind === 'member') {
            return (
              <MemberOptionRow
                member={item.member}
                onPress={() => pickExistingMember(item.member)}
              />
            );
          }
          if (item.kind === 'contact') {
            return (
              <ContactOptionRow
                contact={item.contact}
                onPress={() =>
                  mode === 'team'
                    ? pickContactAsMember(item.contact)
                    : pickContactAsParty(item.contact)
                }
              />
            );
          }
          if (item.kind === 'banner-loading') {
            return (
              <View style={styles.statusBlock}>
                <ActivityIndicator size="small" color={t.colors.tertiary} />
                <Text
                  variant="footnote"
                  color="secondary"
                  style={{ marginTop: 8 }}
                >
                  Loading contacts…
                </Text>
              </View>
            );
          }
          if (item.kind === 'banner-permission') {
            return (
              <View
                style={[
                  styles.permBanner,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft,
                    borderRadius: t.radii.field,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={16}
                  color={t.palette.orange.base}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text
                    variant="footnote"
                    style={{ color: t.palette.orange.base, fontWeight: '700' }}
                  >
                    Contacts access off
                  </Text>
                  <Text
                    variant="caption1"
                    color="secondary"
                    style={{ marginTop: 2 }}
                  >
                    Enable Contacts in Settings to pick from your phonebook here.
                  </Text>
                </View>
                <Pressable onPress={openSettings} hitSlop={8}>
                  <Text
                    variant="footnote"
                    style={{
                      color: t.palette.orange.base,
                      fontWeight: '700',
                      marginLeft: 8,
                    }}
                  >
                    Settings
                  </Text>
                </Pressable>
              </View>
            );
          }
          if (item.kind === 'empty-parties') {
            return (
              <Text
                variant="footnote"
                color="secondary"
                style={styles.emptyCaption}
              >
                {q ? 'No matching parties' : 'No parties yet'}
              </Text>
            );
          }
          if (item.kind === 'empty-members') {
            return (
              <Text
                variant="footnote"
                color="secondary"
                style={styles.emptyCaption}
              >
                {q ? 'No matching team members' : 'No team members yet'}
              </Text>
            );
          }
          // empty-contacts
          return (
            <Text
              variant="footnote"
              color="secondary"
              style={styles.emptyCaption}
            >
              {q
                ? 'No matching contacts'
                : mode === 'team'
                  ? 'All matching contacts are already team members'
                  : 'All matching contacts are already saved as parties'}
            </Text>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ── Row components ──────────────────────────────────────────────────

function PartyOptionRow({
  party,
  onPress,
}: {
  party: Party;
  onPress: () => void;
}) {
  const t = useThemeV2();
  const initial = party.name.charAt(0).toUpperCase() || '?';
  const typeLabel = getPartyTypeLabel(party.partyType);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.field,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor:
              t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
          },
        ]}
      >
        <Text
          variant="footnote"
          style={{ color: t.palette.blue.base, fontWeight: '700' }}
        >
          {initial}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text
          variant="callout"
          color="label"
          style={{ fontWeight: '600' }}
          numberOfLines={1}
        >
          {party.name}
        </Text>
        {party.phone ? (
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {party.phone}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.rolePill,
          {
            backgroundColor: t.colors.fill3,
            borderRadius: 999,
          },
        ]}
      >
        <Text
          variant="caption2"
          color="secondary"
          style={{ fontWeight: '700', letterSpacing: 0.3 }}
          numberOfLines={1}
        >
          {typeLabel.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

function MemberOptionRow({
  member,
  onPress,
}: {
  member: ProjectMember;
  onPress: () => void;
}) {
  const t = useThemeV2();
  const initial = member.displayName.charAt(0).toUpperCase() || '?';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.field,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor:
              t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft,
          },
        ]}
      >
        <Text
          variant="footnote"
          style={{ color: t.palette.green.base, fontWeight: '700' }}
        >
          {initial}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text
          variant="callout"
          color="label"
          style={{ fontWeight: '600' }}
          numberOfLines={1}
        >
          {member.displayName}
        </Text>
        {member.phoneNumber ? (
          <Text variant="caption1" color="secondary" numberOfLines={1}>
            {member.phoneNumber}
          </Text>
        ) : null}
      </View>
      {/* Neutral "JOINED" pill — distinguishes them from
          phonebook contacts which carry an Add icon on the right. */}
      <View
        style={[
          styles.rolePill,
          {
            backgroundColor: t.colors.fill3,
            borderRadius: 999,
          },
        ]}
      >
        <Text
          variant="caption2"
          color="secondary"
          style={{ fontWeight: '700', letterSpacing: 0.3 }}
          numberOfLines={1}
        >
          JOINED
        </Text>
      </View>
    </Pressable>
  );
}

function ContactOptionRow({
  contact,
  onPress,
}: {
  contact: ContactRow;
  onPress: () => void;
}) {
  const t = useThemeV2();
  const initial = contact.name.charAt(0).toUpperCase() || '?';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.field,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.avatar,
          { backgroundColor: t.colors.fill3 },
        ]}
      >
        <Text
          variant="footnote"
          style={{ color: t.colors.secondary, fontWeight: '700' }}
        >
          {initial}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text
          variant="callout"
          color="label"
          style={{ fontWeight: '600' }}
          numberOfLines={1}
        >
          {contact.name}
        </Text>
        <Text variant="caption1" color="secondary" numberOfLines={1}>
          {contact.phoneE164}
        </Text>
      </View>
      <Ionicons
        name="add-circle-outline"
        size={20}
        color={t.palette.blue.base}
      />
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  headerSideBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPartyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },

  // Sections
  sectionHeader: {
    paddingHorizontal: 32,
    paddingTop: 14,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },

  // Inline status / banner
  statusBlock: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyCaption: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
});
