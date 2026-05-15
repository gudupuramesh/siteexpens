/**
 * Add Staff — v2 design.
 *
 * Adding a staff member from the Finance hub creates BOTH a staff doc
 * AND the corresponding `parties/{id}` entry with `partyType='staff'`.
 * The two stay in sync via `staff.partyId` so the same person doesn't
 * have to be entered twice.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "New staff" · Save
 *   2. KeyboardAvoidingView + ScrollView
 *      a. "Pick from contacts" CTA card (one-tap auto-fill)
 *      b. FormGroup "Identity" — Name · Phone · Role (sheet)
 *      c. FormGroup "Salary" — Monthly salary · Pay model pill row
 *      d. Footer note
 */
import * as Contacts from 'expo-contacts';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export default function AddStaffScreen() {
  const t = useThemeV2();
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
      // Let layout settle before presenting the native picker.
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
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="New staff"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="body" color="secondary" style={{ textAlign: 'center', paddingHorizontal: 32 }}>
            You don't have permission to add staff. Ask a Super Admin or
            Admin to grant you the Accountant role.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="New staff"
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={busy}
        onCancel={() => router.back()}
        onSave={() => void onSave()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Pick from Contacts CTA */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Pressable
              onPress={pickContact}
              style={({ pressed }) => [
                styles.contactsBtn,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                  borderRadius: t.radii.card,
                  borderColor: t.palette.blue.base + '33',
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: t.palette.blue.base,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="person-add" size={17} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="callout" style={{ color: t.palette.blue.base, fontWeight: '700' }}>
                  Pick from Contacts
                </Text>
                <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                  Auto-fills name + phone in one tap.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={t.palette.blue.base} />
            </Pressable>
            <Text
              variant="caption1"
              color="tertiary"
              style={{ paddingHorizontal: 4, marginTop: 8, fontStyle: 'italic' }}
            >
              Adds a staff member AND a party (type: Staff) — they stay linked.
            </Text>
          </View>

          {/* Identity */}
          <FormGroup header="Identity">
            <InputRow
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Suresh Kumar"
              autoCapitalize="words"
            />
            <InputRow
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 9XXXXXXXXX"
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            <Row
              label="Role"
              value={role.trim() || 'Pick a role'}
              chevron
              onPress={() => setRolePickerOpen(true)}
              divider={false}
            />
          </FormGroup>

          {/* Salary */}
          <FormGroup
            header="Salary"
            footer={
              payUnit === 'month'
                ? 'Full salary if all 22 working days attended; pro-rated otherwise.'
                : 'Daily rate = monthly ÷ 22. Pays only for days present + half days.'
            }
          >
            <InputRow
              label="Monthly salary"
              value={salary}
              onChangeText={setSalary}
              placeholder="₹0"
              keyboardType="decimal-pad"
              autoCapitalize="none"
            />
            <View style={styles.payModelBlock}>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12 }}
              >
                PAY MODEL
              </Text>
              <View style={[styles.pillRow, { paddingHorizontal: 12, paddingVertical: 10 }]}>
                {(['month', 'day'] as PayUnit[]).map((p) => {
                  const sel = payUnit === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPayUnit(p)}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.pillChip,
                        {
                          backgroundColor: sel
                            ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                            : t.colors.fill3,
                          borderRadius: t.radii.pill,
                          borderColor: sel ? t.palette.blue.base + '33' : 'transparent',
                          borderWidth: sel ? 1 : 0,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Text
                        variant="footnote"
                        style={{
                          color: sel ? t.palette.blue.base : t.colors.secondary,
                          fontWeight: sel ? '700' : '500',
                        }}
                      >
                        {p === 'month' ? 'Monthly' : 'Per-day'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </FormGroup>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Role picker — adds a footer "Manage roles" link inside the sheet */}
      <SelectSheet
        open={rolePickerOpen}
        title="Select role"
        options={[
          ...roles.map((r) => ({ key: r.label, label: r.label })),
          { key: '__manage__', label: 'Manage roles in master library →' },
        ]}
        selected={role.trim() || undefined}
        onPick={(k) => {
          if (k === '__manage__') {
            router.push('/(app)/staff-role-library' as never);
            return;
          }
          setRole(k);
        }}
        onClose={() => setRolePickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: 8, paddingBottom: 60 },

  contactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },

  payModelBlock: {
    paddingBottom: 0,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 7,
  },
  pillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
