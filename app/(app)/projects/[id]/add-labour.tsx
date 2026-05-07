/**
 * Add Labour to project. Pick from existing org parties, add from phone
 * contacts (with party type selection), or enter manually.
 * Creates an attendance record for today with 'present' status.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as Contacts from 'expo-contacts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from "@/src/features/org/useGuardedRoute";
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useMemo, useState } from 'react';
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
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { createParty } from '@/src/features/parties/parties';
import {
  ALL_PARTY_TYPES,
  PARTY_TYPE_GROUPS,
  getPartyTypeLabel,
  type Party,
  type PartyType,
} from '@/src/features/parties/types';
import { markAttendance } from '@/src/features/attendance/attendance';
import { useProjectLabour } from '@/src/features/attendance/useProjectLabour';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // local YYYY-MM-DD (timezone-safe, matches AttendanceTab)
}

const schema = z.object({
  name: z.string().trim().min(2, 'Name required'),
  partyId: z.string().optional(),
  role: z.string().trim().min(1, 'Enter worker job detail'),
  payRate: z.string().trim().min(1, 'Enter pay amount'),
  payUnit: z.enum(['day', 'hour']),
});

type FormData = z.infer<typeof schema>;

export default function AddLabourScreen() {
  useGuardedRoute({ capability: 'attendance.write' });
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: orgParties } = useParties(orgId || undefined);
  const today = toLocalDateString(new Date());
  const { data: projectLabour } = useProjectLabour(projectId, orgId || undefined);

  const [submitError, setSubmitError] = useState<string>();
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [partySearch, setPartySearch] = useState('');

  // New party from contact
  const [showNewPartyType, setShowNewPartyType] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [creatingParty, setCreatingParty] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', partyId: '', role: '', payRate: '', payUnit: 'day' },
    mode: 'onChange',
  });

  const selectedName = watch('name');
  const selectedRole = watch('role');
  const selectedPayUnit = watch('payUnit');

  // Parties already registered as labour in this project.
  const projectLabourIds = useMemo(
    () => new Set(projectLabour.map((a) => a.labourId)),
    [projectLabour],
  );

  // Party sections: already in project attendance first, then others
  const partySections = useMemo(() => {
    const search = partySearch.toLowerCase();
    const projectParties: Party[] = [];
    const otherParties: Party[] = [];

    for (const p of orgParties) {
      if (search && !p.name.toLowerCase().includes(search)) continue;
      // Skip parties already added as project labour.
      if (projectLabourIds.has(p.id)) continue;

      const type = (p.partyType ?? p.role) as string;
      const isWorker = ['worker', 'staff', 'labour', 'labour_contractor', 'contractor'].includes(type);
      if (isWorker) {
        projectParties.push(p);
      } else {
        otherParties.push(p);
      }
    }

    const sections: { title: string; data: Party[] }[] = [];
    if (projectParties.length > 0) {
      sections.push({ title: 'Workers & Labour', data: projectParties });
    }
    if (otherParties.length > 0) {
      sections.push({ title: 'Other Parties', data: otherParties });
    }
    return sections;
  }, [orgParties, partySearch, projectLabourIds]);

  // ── Handlers ──

  const selectParty = useCallback((party: Party) => {
    const type = (party.partyType ?? party.role) as string;
    setValue('name', party.name, { shouldValidate: true });
    setValue('partyId', party.id);
    setValue('role', getPartyTypeLabel(type as PartyType), { shouldValidate: true });
    setShowPartyPicker(false);
    setPartySearch('');
  }, [setValue]);

  const pickContactAndAdd = useCallback(async () => {
    Keyboard.dismiss();
    setShowPartyPicker(false);
    try {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => setTimeout(resolve, 500));
      });
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow contacts access to pick a contact.');
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

      if (!contactName) {
        Alert.alert(
          'Missing name',
          'That contact has no name or company. Add one in Contacts and try again.',
        );
        return;
      }
      if (phoneDigits.length < 10) {
        Alert.alert('Missing phone', 'That contact needs a phone with at least 10 digits.');
        return;
      }

      setNewPartyName(contactName);
      setNewPartyPhone(phoneDigits);
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => setShowNewPartyType(true), 120);
      });
    } catch (e) {
      Alert.alert(
        'Contacts',
        e instanceof Error ? e.message : 'Could not open the contact picker.',
      );
    }
  }, []);

  const createNewPartyAndSelect = useCallback(async (partyType: PartyType) => {
    if (!user || !orgId || !newPartyName) return;
    setCreatingParty(true);
    try {
      const partyId = await createParty({
        orgId,
        name: newPartyName,
        phone: newPartyPhone,
        partyType,
        createdBy: user.uid,
      });
      setValue('name', newPartyName, { shouldValidate: true });
      setValue('partyId', partyId);
      setValue('role', getPartyTypeLabel(partyType), { shouldValidate: true });
      setShowNewPartyType(false);
      setNewPartyName('');
      setNewPartyPhone('');
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setCreatingParty(false);
    }
  }, [user, orgId, newPartyName, newPartyPhone, setValue]);

  async function onSubmit(data: FormData) {
    if (!user || !orgId || !projectId) return;
    setSubmitError(undefined);
    try {
      await markAttendance({
        orgId,
        projectId,
        labourId: data.partyId || `manual_${Date.now()}`,
        labourName: data.name,
        labourRole: data.role,
        payRate: Number(data.payRate),
        payUnit: data.payUnit,
        date: today,
        status: 'present',
        createdBy: user.uid,
      });
      // Snapshot-propagation buffer (see add-transaction.tsx).
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="close" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>Add Labour</Text>
        <View style={styles.navBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Party selector */}
          <Pressable
            onPress={() => setShowPartyPicker(true)}
            style={styles.partySelector}
          >
            <Ionicons name="people-outline" size={20} color={color.textMuted} />
            <Text
              variant="body"
              color={selectedName ? 'text' : 'textFaint'}
              style={styles.flex}
              numberOfLines={1}
            >
              {selectedName || 'Select Worker / Labour *'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={color.textMuted} />
          </Pressable>

          {/* Role display (auto-set from party, or manual) */}
          {selectedRole ? (
            <View style={styles.roleDisplay}>
              <Text variant="caption" color="textMuted">JOB DETAIL</Text>
              <View style={styles.roleBadge}>
                <Text variant="metaStrong" color="primary">{selectedRole}</Text>
              </View>
            </View>
          ) : null}

          {/* Manual name entry */}
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text variant="caption" color="textMuted">OR ENTER MANUALLY</Text>
            <View style={styles.orLine} />
          </View>

          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Name"
                placeholder="e.g. Suresh Kumar"
                autoCapitalize="words"
                value={value}
                onChangeText={(t) => {
                  setValue('partyId', '');
                  onChange(t);
                }}
                onBlur={onBlur}
                error={errors.name?.message}
                square
                strongBorder
              />
            )}
          />

          {/* Job detail only (not category) */}
          <Controller
            control={control}
            name="role"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Worker job detail"
                placeholder="e.g. POP worker, Paint worker, Ceiling worker"
                autoCapitalize="words"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.role?.message}
                square
                strongBorder
              />
            )}
          />

          <Controller
            control={control}
            name="payRate"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Pay amount"
                placeholder="e.g. 850"
                keyboardType="number-pad"
                value={value}
                onChangeText={(t) => onChange(t.replace(/[^\d]/g, ''))}
                onBlur={onBlur}
                error={errors.payRate?.message}
                square
                strongBorder
              />
            )}
          />

          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>PAY UNIT</Text>
          <View style={styles.unitRow}>
            <Pressable
              onPress={() => setValue('payUnit', 'day', { shouldValidate: true })}
              style={[styles.unitBtn, selectedPayUnit === 'day' && styles.unitBtnActive]}
            >
              <Text variant="caption" style={{ color: selectedPayUnit === 'day' ? color.onPrimary : color.text }}>
                Per day
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setValue('payUnit', 'hour', { shouldValidate: true })}
              style={[styles.unitBtn, selectedPayUnit === 'hour' && styles.unitBtnActive]}
            >
              <Text variant="caption" style={{ color: selectedPayUnit === 'hour' ? color.onPrimary : color.text }}>
                Per hour
              </Text>
            </Pressable>
          </View>

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.xs }}>
              {submitError}
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Add & Mark Present"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isValid || !orgId}
          />
        </View>
      </KeyboardAvoidingView>

      {/* ── Party Picker Modal ── */}
      <Modal
        visible={showPartyPicker}
        animationType="slide"
        transparent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setShowPartyPicker(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => {
              Keyboard.dismiss();
              setShowPartyPicker(false);
            }}
          >
            <View />
          </Pressable>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
              Select Worker
            </Text>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={color.textMuted} />
              <TextInput
                placeholder="Search by name..."
                placeholderTextColor={color.textFaint}
                value={partySearch}
                onChangeText={setPartySearch}
                style={styles.searchInput}
                autoFocus={Platform.OS !== 'ios'}
                returnKeyType="search"
              />
            </View>

            <SectionList
              keyboardShouldPersistTaps="handled"
              sections={partySections}
              keyExtractor={(p) => p.id}
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Text variant="caption" color="textMuted">{title.toUpperCase()}</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const type = (item.partyType ?? item.role) as string;
              const label = getPartyTypeLabel(type as PartyType);
              return (
                <Pressable
                  onPress={() => selectParty(item)}
                  style={({ pressed }) => [styles.partyOption, pressed && { opacity: 0.7 }]}
                >
                  <View style={styles.partyAvatar}>
                    <Text variant="metaStrong" style={{ color: color.primary }}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text variant="body" color="text" numberOfLines={1}>{item.name}</Text>
                    <Text variant="meta" color="textMuted">{label}</Text>
                  </View>
                  {selectedName === item.name && (
                    <Ionicons name="checkmark-circle" size={20} color={color.primary} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text variant="meta" color="textMuted">
                  {partySearch ? 'No matching parties' : 'No parties yet'}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            style={styles.modalList}
          />

          {/* Bottom actions */}
          <View style={styles.partyActions}>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                pickContactAndAdd();
              }}
              style={styles.partyActionBtn}
            >
              <Ionicons name="person-add-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">Add from Contact</Text>
            </Pressable>

            <View style={styles.partyActionDivider} />

            <Pressable
              onPress={() => {
                if (partySearch.trim()) {
                  setValue('name', partySearch.trim(), { shouldValidate: true });
                  setValue('partyId', '');
                }
                setShowPartyPicker(false);
                setPartySearch('');
              }}
              style={styles.partyActionBtn}
            >
              <Ionicons name="create-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">
                {partySearch.trim() ? `Add "${partySearch.trim()}"` : 'Enter manually'}
              </Text>
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── New Party Type Picker Modal ── */}
      <Modal
        visible={showNewPartyType}
        animationType="slide"
        transparent
        presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        onRequestClose={() => setShowNewPartyType(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewPartyType(false)}>
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
            Select Party Type
          </Text>
          <Text variant="meta" color="textMuted" align="center" style={{ marginBottom: space.sm }}>
            Adding: {newPartyName}{newPartyPhone ? ` (${newPartyPhone})` : ''}
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.modalList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {PARTY_TYPE_GROUPS.map((group) => (
              <View key={group.label} style={styles.typeGroup}>
                <Text variant="caption" color="textMuted" style={styles.typeGroupLabel}>
                  {group.label.toUpperCase()}
                </Text>
                {group.types.map((t) => (
                  <Pressable
                    key={t.key}
                    onPress={() => createNewPartyAndSelect(t.key)}
                    disabled={creatingParty}
                    style={({ pressed }) => [
                      styles.typeOption,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={styles.typeIconWrap}>
                      <Ionicons name={t.icon as any} size={18} color={color.textMuted} />
                    </View>
                    <Text variant="body" color="text">{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>

          {creatingParty && (
            <View style={{ alignItems: 'center', paddingVertical: space.sm }}>
              <Text variant="meta" color="textMuted">Creating party...</Text>
            </View>
          )}
        </View>
      </Modal>

    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },
  navTitle: { flex: 1, textAlign: 'center' },
  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.xl,
    backgroundColor: color.bgGrouped,
  },

  // Party selector
  partySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.bgGrouped,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 52,
    marginBottom: space.sm,
  },

  // Role display
  roleDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  roleBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: 8,
    backgroundColor: color.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.primary,
  },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginVertical: space.md,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.separator,
  },

  sectionLabel: { marginTop: space.md, marginBottom: space.xs },
  unitRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.md,
  },
  unitBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },
  unitBtnActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },


  footer: {
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: color.bgGrouped,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
    alignSelf: 'center',
    marginBottom: space.sm,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: space.sm,
    fontSize: 16,
  },
  modalList: {
    paddingHorizontal: screenInset,
    maxHeight: 350,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginHorizontal: screenInset,
    marginBottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: 8,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: color.text,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },

  sectionHeader: {
    paddingVertical: space.xs,
    paddingHorizontal: space.xxs,
    backgroundColor: color.surface,
    borderRadius: 8,
    marginTop: space.xs,
    marginBottom: space.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },

  partyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  partyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: color.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyList: {
    paddingVertical: space.xxl,
    alignItems: 'center',
  },

  partyActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    marginHorizontal: screenInset,
  },
  partyActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.md,
  },
  partyActionDivider: {
    width: 1,
    backgroundColor: color.borderStrong,
    marginVertical: space.xs,
  },

  // Type picker
  typeGroup: { marginBottom: space.md },
  typeGroupLabel: { marginBottom: space.xs, letterSpacing: 0.5 },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    marginBottom: 6,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: color.bgGrouped,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
