/**
 * PartyPickerModal — pick a party already associated with this project, or
 * add a brand-new party from the device contacts (prompts for party type,
 * writes to org parties collection, then auto-selects).
 *
 * Scope:
 *  - List: parties referenced by transactions/attendance/tasks on this project
 *  - Add-from-contacts: uses expo-contacts picker, then role sheet (all 9 types)
 */
import { Fragment, useMemo, useState } from 'react';
import * as Contacts from 'expo-contacts';
import {
  Alert,
  FlatList,
  InteractionManager,
  Keyboard,
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

import { useAuth } from '@/src/features/auth/useAuth';
import { createParty } from '@/src/features/parties/parties';
import {
  PARTY_TYPE_GROUPS,
  getPartyTypeLabel,
  type PartyType,
} from '@/src/features/parties/types';
import { useProjectParties } from '@/src/features/parties/useProjectParties';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

type Props = {
  visible: boolean;
  orgId: string;
  projectId: string;
  onPick: (partyId: string, partyName: string) => void;
  onClose: () => void;
  allowUnassign?: boolean;
};

type PendingContact = {
  name: string;
  phone: string;
  email?: string;
};

export function PartyPickerModal({
  visible,
  orgId,
  projectId,
  onPick,
  onClose,
  allowUnassign,
}: Props) {
  const { user } = useAuth();
  const { parties, loading } = useProjectParties(orgId, projectId);

  const [search, setSearch] = useState('');
  const [pendingContact, setPendingContact] = useState<PendingContact | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        getPartyTypeLabel(p.partyType).toLowerCase().includes(q),
    );
  }, [parties, search]);

  const pickFromContacts = async () => {
    Keyboard.dismiss();
    // Close our sheet first so iOS has a valid key window / presenter for
    // CNContactPickerViewController (see add-transaction fix).
    onClose();
    try {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => setTimeout(resolve, 500));
      });
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow contacts access to add a new party.');
        return;
      }
      const result = await Contacts.presentContactPickerAsync();
      if (!result) return;

      const contactName =
        (result.name ?? '').trim() ||
        [result.firstName, result.lastName].filter(Boolean).join(' ').trim() ||
        (result.company ?? '').trim() ||
        '';
      const rawEntry =
        result.phoneNumbers?.find(
          (p) => (p.number ?? p.digits ?? '').replace(/\D/g, '').length >= 10,
        ) ?? result.phoneNumbers?.[0];
      const rawPhone = rawEntry?.number ?? rawEntry?.digits ?? '';
      const phoneDigits = rawPhone.replace(/\D/g, '');
      const email = result.emails?.[0]?.email;

      if (!contactName) {
        Alert.alert(
          'Missing name',
          'That contact has no name or company. Add one in Contacts and try again.',
        );
        return;
      }
      if (phoneDigits.length < 10) {
        Alert.alert('Missing phone', 'That contact does not have a valid phone number.');
        return;
      }

      setPendingContact({ name: contactName, phone: phoneDigits, email });
    } catch (e) {
      Alert.alert(
        'Contacts',
        e instanceof Error ? e.message : 'Could not open the contact picker.',
      );
    }
  };

  const createFromContact = async (partyType: PartyType) => {
    if (!pendingContact || !user || !orgId) return;
    setCreating(true);
    try {
      const id = await createParty({
        orgId,
        name: pendingContact.name,
        phone: pendingContact.phone,
        email: pendingContact.email,
        partyType,
        createdBy: user.uid,
      });
      const name = pendingContact.name;
      setPendingContact(null);
      setSearch('');
      onPick(id, name);
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Fragment>
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        >
          <View />
        </Pressable>

        <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text variant="bodyStrong" color="text" style={styles.title}>
          Assign to Party
        </Text>

        <View style={styles.search}>
          <Ionicons name="search" size={18} color={color.textMuted} />
          <TextInput
            placeholder="Search parties..."
            placeholderTextColor={color.textFaint}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            autoFocus={Platform.OS !== 'ios'}
            returnKeyType="search"
          />
        </View>

        {allowUnassign && (
          <Pressable
            onPress={() => {
              onPick('', '');
              setSearch('');
            }}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.avatar, { backgroundColor: color.bgGrouped }]}>
              <Ionicons name="person-remove-outline" size={18} color={color.textMuted} />
            </View>
            <Text variant="body" color="textMuted" style={styles.flex}>
              Unassigned
            </Text>
          </Pressable>
        )}

        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onPick(item.id, item.name);
                setSearch('');
              }}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.avatar}>
                <Text variant="metaStrong" style={{ color: color.onPrimary }}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text variant="body" color="text" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {getPartyTypeLabel(item.partyType)}
                  {item.phone ? ` · ${item.phone}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={color.textFaint} />
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="meta" color="textMuted">
                {loading
                  ? 'Loading…'
                  : search
                  ? 'No matches'
                  : 'No parties on this project yet'}
              </Text>
            </View>
          }
        />

        {/* Add from contacts footer */}
        <Pressable
          onPress={pickFromContacts}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="person-add" size={18} color={color.primary} />
          <Text variant="bodyStrong" color="primary">
            Add from Contacts
          </Text>
        </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Sibling modal so closing the party sheet does not unmount the role sheet. */}
    <Modal
      visible={!!pendingContact}
      animationType="slide"
      transparent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={() => setPendingContact(null)}
    >
      <Pressable style={styles.overlay} onPress={() => !creating && setPendingContact(null)}>
        <View />
      </Pressable>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text variant="bodyStrong" color="text" style={styles.title}>
          Assign Role
        </Text>
        {pendingContact && (
          <Text variant="caption" color="textMuted" style={styles.subtitle}>
            {pendingContact.name} · {pendingContact.phone}
          </Text>
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.roleScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {PARTY_TYPE_GROUPS.map((group) => (
            <View key={group.label} style={styles.roleGroup}>
              <Text variant="caption" color="textMuted" style={styles.roleGroupLabel}>
                {group.label.toUpperCase()}
              </Text>
              {group.types.map((t) => (
                <Pressable
                  key={t.key}
                  disabled={creating}
                  onPress={() => createFromContact(t.key)}
                  style={({ pressed }) => [
                    styles.roleOption,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.roleIconWrap}>
                    <Ionicons
                      name={t.icon as never}
                      size={18}
                      color={color.textMuted}
                    />
                  </View>
                  <Text variant="body" color="text" style={styles.flex}>
                    {t.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: space.sm,
  },
  title: { textAlign: 'center', marginBottom: space.xs },
  subtitle: { textAlign: 'center', marginBottom: space.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: screenInset,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: color.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  list: { paddingHorizontal: screenInset, maxHeight: 360 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: screenInset,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { paddingVertical: space.xl, alignItems: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginHorizontal: screenInset,
    marginTop: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  roleScroll: { paddingHorizontal: screenInset, maxHeight: 480 },
  roleGroup: { marginBottom: space.md },
  roleGroupLabel: { marginBottom: space.xs, letterSpacing: 0.5 },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  roleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.bgGrouped,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
