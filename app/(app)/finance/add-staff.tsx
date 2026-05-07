/**
 * Add Staff — full-screen form. Mirrors the Add Party UX so adding a
 * staff member from the Finance hub also creates the corresponding
 * `parties/{id}` entry with `partyType='staff'`. The two collections
 * stay in sync via `staff.partyId`.
 *
 * Why dual create: a "staff" person is a real party in the studio's
 * roster (they show up in the Party tab inside projects, in transaction
 * party pickers, etc.). Forcing the user to type their name into BOTH
 * the Staff form AND the Party form is the kind of duplicate data
 * entry the user explicitly called out — this single form does both.
 *
 * Role uses a dropdown (button + bottom-sheet picker) instead of a
 * chip rail so the form stays compact even when the org has many
 * custom roles in the master library.
 */
import * as Contacts from 'expo-contacts';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { createParty, InvalidPhoneError } from '@/src/features/parties/parties';
import { createStaff } from '@/src/features/staff/staff';
import { type PayUnit } from '@/src/features/staff/types';
import { useStaffRoles } from '@/src/features/staff/useStaffRoles';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, screenInset, space } from '@/src/theme';

export default function AddStaffScreen() {
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { can } = usePermissions();
  const canWrite = can('finance.write');
  const { data: roles } = useStaffRoles(orgId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [salary, setSalary] = useState('');
  const [payUnit, setPayUnit] = useState<PayUnit>('month');
  const [busy, setBusy] = useState(false);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

  const pickContact = useCallback(async () => {
    Keyboard.dismiss();
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow contacts access to pick a contact.');
        return;
      }
      // Let layout settle before presenting the native picker — avoids
      // a known iOS freeze when CNContactPicker arrives mid-keyboard.
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(resolve, 320);
        });
      });
      const result = await Contacts.presentContactPickerAsync();
      if (!result) return;

      const contactName =
        result.name ??
        [result.firstName, result.lastName].filter(Boolean).join(' ') ??
        '';
      if (contactName) setName(contactName);

      const raw =
        result.phoneNumbers?.find(
          (p) => (p.number ?? p.digits ?? '').replace(/\D/g, '').length >= 10,
        ) ?? result.phoneNumbers?.[0];
      const ph = raw?.number ?? raw?.digits ?? '';
      if (ph) setPhone(ph.replace(/[^\d+]/g, ''));
    } catch (e) {
      Alert.alert(
        'Contacts',
        e instanceof Error ? e.message : 'Could not open the contact picker.',
      );
    }
  }, []);

  const onSave = useCallback(async () => {
    if (!user || !orgId || !canWrite) return;
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for the staff member.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert(
        'Phone required',
        'Staff members are also added as parties — enter a 10-digit phone number.',
      );
      return;
    }
    const salaryNum = Number(salary.replace(/,/g, ''));
    if (!Number.isFinite(salaryNum) || salaryNum <= 0) {
      Alert.alert('Salary required', 'Enter a valid monthly salary.');
      return;
    }
    setBusy(true);
    try {
      // Step 1 — create the party (type='staff'). This also normalises
      // the phone to E.164 and rejects non-Indian mobiles cleanly.
      let partyId: string;
      try {
        partyId = await createParty({
          orgId,
          name: name.trim(),
          phone: phone.trim(),
          partyType: 'staff',
          createdBy: user.uid,
        });
      } catch (err) {
        if (err instanceof InvalidPhoneError) {
          Alert.alert('Invalid phone', err.message);
          setBusy(false);
          return;
        }
        throw err;
      }

      // Step 2 — create the staff doc, linked to the party.
      try {
        await createStaff({
          orgId,
          name: name.trim(),
          phone: phone.trim(),
          partyId,
          role: role.trim() || 'Staff',
          monthlySalary: salaryNum,
          payUnit,
          isOrgMember: false,
          createdBy: user.uid,
        });
      } catch (err) {
        // Staff write failed AFTER party succeeded — surface a clear
        // message so the user knows the party doc landed and isn't
        // confused about why the staff didn't appear. Most cases here
        // are permission-denied (rare for a finance.write user).
        Alert.alert(
          'Staff creation failed',
          'The party was added but the staff record could not be saved. ' +
            ((err as Error).message ?? 'Try again from the Staff tab.'),
        );
        setBusy(false);
        return;
      }

      // Snapshot-propagation buffer (see add-transaction.tsx).
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (e) {
      Alert.alert('Could not add staff', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [user, orgId, canWrite, name, phone, role, salary, payUnit]);

  if (!canWrite) {
    return (
      <Screen bg="grouped" padded>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.deniedHeader}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
            <Ionicons name="arrow-back" size={20} color={color.text} />
          </Pressable>
        </View>
        <Text variant="title" color="text" style={{ marginTop: 24 }}>Add Staff</Text>
        <Text variant="body" color="textMuted" style={{ marginTop: 8 }}>
          You don't have permission to add staff. Ask a Super Admin or Admin to grant you the Accountant role.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="close" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>STUDIO</Text>
          <Text variant="bodyStrong" color="text">Add Staff</Text>
        </View>
        <Pressable
          onPress={onSave}
          disabled={busy}
          hitSlop={12}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          {busy ? (
            <ActivityIndicator color={color.primary} size="small" />
          ) : (
            <Text variant="bodyStrong" color="primary">Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Pick from Contacts CTA */}
        <Pressable
          onPress={pickContact}
          style={({ pressed }) => [
            styles.contactsBtn,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="person-add-outline" size={18} color={color.primary} />
          <Text variant="bodyStrong" color="primary">Pick from Contacts</Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={color.primary}
            style={{ marginLeft: 'auto' }}
          />
        </Pressable>

        {/* Note: party type is hard-coded to "staff" since that's the
            entity this form creates. Other party types (vendors,
            clients, etc.) live in the Add Party flow. */}
        <Text variant="caption" color="textMuted" style={styles.partyTypeHint}>
          Adds a staff member AND a party (type: Staff) — they stay linked.
        </Text>

        {/* Name */}
        <Text style={styles.fieldLabel}>NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Suresh Kumar"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          autoCapitalize="words"
        />

        {/* Phone */}
        <Text style={styles.fieldLabel}>PHONE</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 9XXXXXXXXX"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          keyboardType="phone-pad"
          autoCapitalize="none"
        />

        {/* Role dropdown */}
        <View style={styles.roleHeader}>
          <Text style={styles.fieldLabel}>ROLE / POSITION</Text>
          <Pressable
            onPress={() => router.push('/(app)/staff-role-library' as never)}
            hitSlop={6}
          >
            <Text variant="caption" color="primary">Manage roles</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => setRolePickerOpen(true)}
          style={({ pressed }) => [
            styles.dropdown,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="briefcase-outline" size={16} color={color.text} />
          <Text
            variant="body"
            color={role.trim() ? 'text' : 'textMuted'}
            style={{ flex: 1 }}
            numberOfLines={1}
          >
            {role.trim() || 'Select a role'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={color.textMuted} />
        </Pressable>

        {/* Salary */}
        <Text style={styles.fieldLabel}>MONTHLY SALARY (₹)</Text>
        <TextInput
          value={salary}
          onChangeText={setSalary}
          placeholder="0"
          placeholderTextColor={color.textFaint}
          style={styles.input}
          keyboardType="decimal-pad"
        />

        {/* Pay model */}
        <Text style={styles.fieldLabel}>PAY MODEL</Text>
        <View style={styles.rowChips}>
          {(['month', 'day'] as PayUnit[]).map((p) => {
            const on = payUnit === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPayUnit(p)}
                style={[styles.bigChip, on && styles.bigChipOn]}
              >
                <Text variant="metaStrong" color={on ? 'onPrimary' : 'text'}>
                  {p === 'month' ? 'Monthly' : 'Per-day'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
          {payUnit === 'month'
            ? 'Full salary if all 22 working days attended; pro-rated otherwise.'
            : 'Daily rate = monthly ÷ 22. Pays only for days present + half days.'}
        </Text>

        {/* Save fallback button */}
        <Pressable
          onPress={onSave}
          disabled={busy}
          style={({ pressed }) => [
            styles.saveBtn,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.6 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={color.onPrimary} size="small" />
          ) : (
            <Text variant="bodyStrong" color="onPrimary">Save staff</Text>
          )}
        </Pressable>

        <View style={{ height: space.xl }} />
      </ScrollView>

      {/* Role picker modal — same bottom-sheet pattern used elsewhere */}
      <Modal
        visible={rolePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRolePickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setRolePickerOpen(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text variant="bodyStrong" color="text">Select role</Text>
              <Pressable onPress={() => setRolePickerOpen(false)} hitSlop={12}>
                <Text variant="metaStrong" color="primary">Done</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              {roles.map((r) => {
                const on = role.trim().toLowerCase() === r.label.toLowerCase();
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => {
                      setRole(r.label);
                      setRolePickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.roleRow,
                      pressed && { backgroundColor: color.bgGrouped },
                    ]}
                  >
                    <Text variant="body" color="text" style={{ flex: 1 }}>
                      {r.label}
                    </Text>
                    {on ? (
                      <Ionicons name="checkmark" size={18} color={color.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
              {/* Footer link to library — same access as the inline link
                  above, kept here so the sheet is self-contained. */}
              <Pressable
                onPress={() => {
                  setRolePickerOpen(false);
                  router.push('/(app)/staff-role-library' as never);
                }}
                style={({ pressed }) => [
                  styles.roleRow,
                  styles.roleManageRow,
                  pressed && { backgroundColor: color.bgGrouped },
                ]}
              >
                <Ionicons name="add-circle-outline" size={18} color={color.primary} />
                <Text variant="metaStrong" color="primary">
                  Manage roles in master library
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    gap: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navEyebrow: { letterSpacing: 1.2 },

  deniedHeader: { flexDirection: 'row' },

  body: {
    padding: screenInset,
    paddingBottom: 100,
  },

  contactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
    marginBottom: 6,
  },
  partyTypeHint: {
    fontStyle: 'italic',
    paddingHorizontal: 4,
    paddingTop: 4,
  },

  fieldLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.2,
    marginTop: space.md,
    marginBottom: 6,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    fontSize: 16,
    color: color.text,
  },

  roleHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: space.md,
    marginBottom: 6,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  rowChips: { flexDirection: 'row', gap: 8 },
  bigChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  bigChipOn: { backgroundColor: color.primary, borderColor: color.primary },

  saveBtn: {
    marginTop: space.lg,
    backgroundColor: color.primary,
    paddingVertical: 14,
    borderRadius: radius.sm,
    alignItems: 'center',
  },

  // Role picker modal
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 6,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  roleManageRow: {
    gap: 8,
    backgroundColor: color.primarySoft,
  },
});
