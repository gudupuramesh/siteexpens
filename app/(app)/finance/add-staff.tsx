/**
 * Add Staff — v2 design.
 *
 * Adding a staff member from the Finance hub creates a staff doc
 * linked to a `parties/{id}` entry with `partyType='staff'`.
 *
 * Two paths to populate name + phone:
 *   1. **Pick from saved or contacts** — opens the unified
 *      `/select-party` picker. If the user picks an existing party,
 *      we link the new staff doc to it via `partyId` (no duplicate
 *      party gets created). If they pick a phonebook contact or use
 *      "+ New Party", `/add-party` runs and the new party id flows
 *      back via `newPartyOutbox` — same pattern as transactions.
 *   2. **Type manually** — name + phone fields below. On save we
 *      `createParty` first, then `createStaff` with the new id.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "New staff" · Save
 *   2. ScrollView:
 *      a. "Pick from saved or contacts" link
 *      b. FormGroup "Identity" — Name · Phone · Role (sheet)
 *      c. FormGroup "Salary" — Monthly salary · Pay model pill row
 *      d. Footer note
 */
import { router, Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  Alert,
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
import { useParties } from '@/src/features/parties/useParties';
import { consumeNewPartyOutbox } from '@/src/features/parties/newPartyOutbox';
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
  const { data: parties } = useParties(orgId || undefined);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [salary, setSalary] = useState('');
  const [payUnit, setPayUnit] = useState<PayUnit>('month');
  const [busy, setBusy] = useState(false);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  /** Set when the user picked or created a party via /select-party.
   *  When non-null, `onSave` skips `createParty` and uses this id
   *  directly — avoids creating a duplicate party. */
  const [pickedPartyId, setPickedPartyId] = useState<string | null>(null);

  // Drain newPartyOutbox after returning from /select-party (or
  // /add-party, when the user used "+ New Party"). Fills name + phone
  // from the picked / created party so the form is ready to save.
  useFocusEffect(
    useCallback(() => {
      const next = consumeNewPartyOutbox();
      if (!next) return;
      setName(next.name);
      setPickedPartyId(next.id);
      const party = parties.find((p) => p.id === next.id);
      if (party?.phone) setPhone(party.phone);
    }, [parties]),
  );

  const openSelectParty = useCallback(() => {
    router.push('/(app)/select-party' as never);
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
      // Step 1 — resolve the party id. If the user picked an existing
      // party via /select-party (or used "+ New Party" which created
      // one), use that id directly. Otherwise create a new staff-type
      // party from the typed name + phone.
      let partyId: string;
      if (pickedPartyId) {
        partyId = pickedPartyId;
      } else {
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
  }, [user, orgId, canWrite, name, phone, role, salary, payUnit, pickedPartyId]);

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
          {/* Pick from saved or contacts — opens the unified picker.
              Picking an existing party links the new staff doc to it
              (no duplicate party); picking a phonebook contact (or
              tapping "+ New Party") routes through /add-party which
              hands the new party id back via the outbox. */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <Pressable
              onPress={openSelectParty}
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
                <Ionicons name="people" size={17} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="callout" style={{ color: t.palette.blue.base, fontWeight: '700' }}>
                  Pick from saved or contacts
                </Text>
                <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                  Or just type the name + phone below.
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
