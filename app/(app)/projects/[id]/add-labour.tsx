/**
 * Add Labour to project. Pick from existing org parties, add from phone
 * contacts (with party type selection), or enter manually.
 * Creates an attendance record for today with 'present' status.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as Contacts from 'expo-contacts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { useAttendance } from '@/src/features/attendance/useAttendance';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

const schema = z.object({
  name: z.string().trim().min(2, 'Name required'),
  partyId: z.string().optional(),
  role: z.string().min(1, 'Select role'),
});

type FormData = z.infer<typeof schema>;

export default function AddLabourScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: orgParties } = useParties(orgId || undefined);
  const today = new Date().toISOString().split('T')[0];
  const { data: todayAttendance } = useAttendance(projectId, today);

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
    defaultValues: { name: '', partyId: '', role: '' },
    mode: 'onChange',
  });

  const selectedName = watch('name');
  const selectedRole = watch('role');

  // Parties already marked in today's attendance
  const attendancePartyIds = useMemo(
    () => new Set(todayAttendance.map((a) => a.labourId)),
    [todayAttendance],
  );

  // Party sections: already in project attendance first, then others
  const partySections = useMemo(() => {
    const search = partySearch.toLowerCase();
    const projectParties: Party[] = [];
    const otherParties: Party[] = [];

    for (const p of orgParties) {
      if (search && !p.name.toLowerCase().includes(search)) continue;
      // Skip parties already in today's attendance
      if (attendancePartyIds.has(p.id)) continue;

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
  }, [orgParties, partySearch, attendancePartyIds]);

  // ── Handlers ──

  const selectParty = useCallback((party: Party) => {
    const type = (party.partyType ?? party.role) as string;
    setValue('name', party.name, { shouldValidate: true });
    setValue('partyId', party.id);
    setValue('role', type, { shouldValidate: true });
    setShowPartyPicker(false);
    setPartySearch('');
  }, [setValue]);

  const pickContactAndAdd = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow contacts access to pick a contact.');
      return;
    }
    const result = await Contacts.presentContactPickerAsync();
    if (result) {
      const contactName =
        result.name ??
        [result.firstName, result.lastName].filter(Boolean).join(' ') ??
        '';
      const phone =
        result.phoneNumbers?.[0]?.number ??
        result.phoneNumbers?.[0]?.digits ??
        '';
      setNewPartyName(contactName);
      setNewPartyPhone(phone.replace(/[^\d+]/g, ''));
      setShowPartyPicker(false);
      setShowNewPartyType(true);
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
      setValue('role', partyType, { shouldValidate: true });
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
        date: today,
        status: 'present',
        createdBy: user.uid,
      });
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  const roleLabel = selectedRole ? getPartyTypeLabel(selectedRole as PartyType) : '';

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
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
              <Text variant="caption" color="textMuted">ROLE</Text>
              <View style={styles.roleBadge}>
                <Text variant="metaStrong" color="primary">{roleLabel || selectedRole}</Text>
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
              />
            )}
          />

          {/* Role dropdown for manual entry */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>ROLE *</Text>
          <View style={styles.roleGrid}>
            {ALL_PARTY_TYPES.map((r) => {
              const active = selectedRole === r.key;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setValue('role', r.key, { shouldValidate: true })}
                  style={[styles.roleChip, active && styles.roleChipActive]}
                >
                  <Ionicons
                    name={r.icon as any}
                    size={14}
                    color={active ? color.onPrimary : color.textMuted}
                  />
                  <Text
                    variant="caption"
                    style={{ color: active ? color.onPrimary : color.text }}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.role?.message && (
            <Text variant="caption" color="danger" style={{ marginTop: space.xxs }}>
              {errors.role.message}
            </Text>
          )}

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
        onRequestClose={() => setShowPartyPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPartyPicker(false)}>
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
              autoFocus
            />
          </View>

          <SectionList
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
            <Pressable onPress={pickContactAndAdd} style={styles.partyActionBtn}>
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
      </Modal>

      {/* ── New Party Type Picker Modal ── */}
      <Modal
        visible={showNewPartyType}
        animationType="slide"
        transparent
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

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalList}>
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
    paddingBottom: space.xs,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center' },
  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },

  // Party selector
  partySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
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
    borderRadius: radius.pill,
    backgroundColor: color.primarySoft,
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

  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  roleChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },

  footer: {
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    maxHeight: '75%',
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
    borderRadius: radius.sm,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: color.text,
    paddingVertical: Platform.OS === 'ios' ? space.xs : 0,
  },

  sectionHeader: {
    paddingVertical: space.xs,
    paddingHorizontal: space.xxs,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.xs,
    marginTop: space.xs,
    marginBottom: space.xxs,
  },

  partyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  partyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyList: {
    paddingVertical: space.xxl,
    alignItems: 'center',
  },

  partyActions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
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
    backgroundColor: color.separator,
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
    borderRadius: radius.sm,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.bgGrouped,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
