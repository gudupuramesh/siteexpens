/**
 * Add Labour — v2 design.
 *
 * Pick from existing org parties, add from phone contacts (with party
 * type), or enter manually. Creates an attendance record for today
 * with `present` status.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "Add labour" · Save
 *   2. FormGroup "Worker" — Pick worker (sheet) Row · Manual name InputRow
 *   3. FormGroup "Job" — Job detail · Pay rate · Pay unit pill row
 *
 * Worker sheet shows existing parties (workers first, others below) with
 * "From contacts" / "Add manually" actions.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as Contacts from 'expo-contacts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useParties } from '@/src/features/parties/useParties';
import { createParty } from '@/src/features/parties/parties';
import {
  PARTY_TYPE_GROUPS,
  getPartyTypeLabel,
  type Party,
  type PartyType,
} from '@/src/features/parties/types';
import { markAttendance } from '@/src/features/attendance/attendance';
import { useProjectLabour } from '@/src/features/attendance/useProjectLabour';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  const t = useThemeV2();
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
  const selectedPayUnit = watch('payUnit');

  const projectLabourIds = useMemo(
    () => new Set(projectLabour.map((a) => a.labourId)),
    [projectLabour],
  );

  const partySections = useMemo(() => {
    const search = partySearch.toLowerCase();
    const projectParties: Party[] = [];
    const otherParties: Party[] = [];
    for (const p of orgParties) {
      if (search && !p.name.toLowerCase().includes(search)) continue;
      if (projectLabourIds.has(p.id)) continue;
      const type = (p.partyType ?? p.role) as string;
      const isWorker = ['worker', 'staff', 'labour', 'labour_contractor', 'contractor'].includes(type);
      if (isWorker) projectParties.push(p);
      else otherParties.push(p);
    }
    const sections: { title: string; data: Party[] }[] = [];
    if (projectParties.length > 0) sections.push({ title: 'Workers & labour', data: projectParties });
    if (otherParties.length > 0) sections.push({ title: 'Other parties', data: otherParties });
    return sections;
  }, [orgParties, partySearch, projectLabourIds]);

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
        (result.name ?? '').trim()
        || [result.firstName, result.lastName].filter(Boolean).join(' ').trim()
        || (result.company ?? '').trim()
        || '';
      const rawEntry =
        result.phoneNumbers?.find(
          (p) => (p.number ?? p.digits ?? '').replace(/\D/g, '').length >= 10,
        ) ?? result.phoneNumbers?.[0];
      const rawPhone = rawEntry?.number ?? rawEntry?.digits ?? '';
      const phoneDigits = rawPhone.replace(/\D/g, '');
      if (!contactName) {
        Alert.alert('Missing name', 'That contact has no name or company. Add one in Contacts and try again.');
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
      Alert.alert('Contacts', e instanceof Error ? e.message : 'Could not open the contact picker.');
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
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="Add labour"
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={isSubmitting}
        saveDisabled={!isValid || !orgId}
        onCancel={() => router.back()}
        onSave={() => void handleSubmit(onSubmit)()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Worker */}
          <FormGroup header="Worker">
            <Row
              label="Pick worker"
              value={selectedName || 'From parties'}
              valueColor={selectedName ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setShowPartyPicker(true)}
            />
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Or name"
                  value={value}
                  onChangeText={(txt) => {
                    setValue('partyId', '');
                    onChange(txt);
                  }}
                  onBlur={onBlur}
                  placeholder="e.g. Suresh Kumar"
                  autoCapitalize="words"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {errors.name?.message ? (
            <FieldNote text={errors.name.message} tone={t.palette.red.base} />
          ) : null}

          {/* Job */}
          <FormGroup header="Job">
            <Controller
              control={control}
              name="role"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Job detail"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. POP worker, Painter"
                  autoCapitalize="sentences"
                />
              )}
            />
            <Controller
              control={control}
              name="payRate"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Pay rate"
                  value={value}
                  onChangeText={(txt) => onChange(txt.replace(/[^\d]/g, ''))}
                  onBlur={onBlur}
                  placeholder="₹0"
                  keyboardType="number-pad"
                />
              )}
            />
            <View style={styles.payUnitBlock}>
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12 }}
              >
                PAY UNIT
              </Text>
              <View style={styles.payUnitRow}>
                {(['day', 'hour'] as const).map((u) => {
                  const active = selectedPayUnit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setValue('payUnit', u, { shouldValidate: true })}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.payUnitBtn,
                        {
                          backgroundColor: active
                            ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                            : t.colors.fill3,
                          borderRadius: t.radii.pill,
                          borderColor: active ? t.palette.blue.base + '33' : 'transparent',
                          borderWidth: active ? 1 : 0,
                        },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Text
                        variant="footnote"
                        style={{
                          color: active ? t.palette.blue.base : t.colors.secondary,
                          fontWeight: active ? '700' : '500',
                        }}
                      >
                        {u === 'day' ? 'Per day' : 'Per hour'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </FormGroup>
          {(errors.role?.message || errors.payRate?.message) ? (
            <FieldNote
              text={errors.role?.message ?? errors.payRate?.message ?? ''}
              tone={t.palette.red.base}
            />
          ) : null}

          {submitError ? (
            <FieldNote text={submitError} tone={t.palette.red.base} />
          ) : null}

          <Text
            variant="caption1"
            color="tertiary"
            style={{ marginTop: 14, paddingHorizontal: 32, fontStyle: 'italic' }}
          >
            Saving will mark this person Present for today.
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Party picker sheet */}
      <PartyPickerSheet
        open={showPartyPicker}
        partySearch={partySearch}
        setPartySearch={setPartySearch}
        sections={partySections}
        selectedName={selectedName}
        onSelectParty={selectParty}
        onClose={() => setShowPartyPicker(false)}
        onAddFromContact={pickContactAndAdd}
        onAddManual={() => {
          if (partySearch.trim()) {
            setValue('name', partySearch.trim(), { shouldValidate: true });
            setValue('partyId', '');
          }
          setShowPartyPicker(false);
          setPartySearch('');
        }}
      />

      {/* New party type sheet */}
      <NewPartyTypeSheet
        open={showNewPartyType}
        newPartyName={newPartyName}
        newPartyPhone={newPartyPhone}
        creating={creatingParty}
        onClose={() => setShowNewPartyType(false)}
        onPickType={createNewPartyAndSelect}
      />
    </View>
  );
}

function FieldNote({ text, tone }: { text: string; tone: string }) {
  return (
    <Text
      variant="caption2"
      style={{ color: tone, paddingHorizontal: 32, marginTop: 8 }}
    >
      {text}
    </Text>
  );
}

// ── Party picker sheet ────────────────────────────────────────────────

function PartyPickerSheet({
  open,
  partySearch,
  setPartySearch,
  sections,
  selectedName,
  onSelectParty,
  onClose,
  onAddFromContact,
  onAddManual,
}: {
  open: boolean;
  partySearch: string;
  setPartySearch: (v: string) => void;
  sections: { title: string; data: Party[] }[];
  selectedName: string;
  onSelectParty: (p: Party) => void;
  onClose: () => void;
  onAddFromContact: () => void;
  onAddManual: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '85%',
            },
          ]}
        >
          <View style={[sheetStyles.grabber, { backgroundColor: t.colors.tertiary }]} />
          <View
            style={[
              sheetStyles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={onClose} hitSlop={8} style={sheetStyles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>Cancel</Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[sheetStyles.title, { fontWeight: '600' }]}
            >
              Select worker
            </Text>
            <View style={sheetStyles.sideBtn} />
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <View
              style={[
                sheetStyles.searchBar,
                { backgroundColor: t.colors.fill3, borderRadius: t.radii.field },
              ]}
            >
              <Ionicons name="search" size={16} color={t.colors.tertiary} />
              <TextInput
                placeholder="Search by name…"
                placeholderTextColor={t.colors.tertiary}
                value={partySearch}
                onChangeText={setPartySearch}
                style={[
                  sheetStyles.searchInput,
                  { color: t.colors.label, ...t.type.callout },
                ]}
                autoFocus={Platform.OS !== 'ios'}
                returnKeyType="search"
              />
              {partySearch ? (
                <Pressable onPress={() => setPartySearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <SectionList
            keyboardShouldPersistTaps="handled"
            sections={sections}
            keyExtractor={(p) => p.id}
            renderSectionHeader={({ section: { title } }) => (
              <View style={sheetStyles.sectionHeader}>
                <Text variant="caption2" color="secondary" style={{ letterSpacing: 0.5 }}>
                  {title.toUpperCase()}
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const type = (item.partyType ?? item.role) as string;
              const label = getPartyTypeLabel(type as PartyType);
              const selected = selectedName === item.name;
              return (
                <Pressable
                  onPress={() => onSelectParty(item)}
                  style={({ pressed }) => [
                    sheetStyles.partyOption,
                    pressed && { backgroundColor: t.colors.fill3 },
                  ]}
                >
                  <View
                    style={[
                      sheetStyles.partyAvatar,
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
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      variant="callout"
                      color="label"
                     
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                      {label}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={18} color={t.palette.blue.base} />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 40, alignItems: 'center' }}>
                <Text variant="footnote" color="secondary">
                  {partySearch ? 'No matching parties' : 'No parties yet'}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
          />

          {/* Bottom actions */}
          <View
            style={[
              sheetStyles.actions,
              {
                borderTopColor: t.colors.separator,
                borderTopWidth: t.hairline,
              },
            ]}
          >
            <Pressable
              onPress={onAddFromContact}
              hitSlop={6}
              style={({ pressed }) => [
                sheetStyles.actionBtn,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="person-add-outline" size={16} color={t.palette.blue.base} />
              <Text
                variant="footnote"
                style={{ color: t.palette.blue.base, fontWeight: '700', marginLeft: 6 }}
              >
                From contacts
              </Text>
            </Pressable>
            <Pressable
              onPress={onAddManual}
              hitSlop={6}
              style={({ pressed }) => [
                sheetStyles.actionBtn,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="create-outline" size={16} color={t.colors.label} />
              <Text
                variant="footnote"
                color="label"
                style={{ fontWeight: '700', marginLeft: 6 }}
                numberOfLines={1}
              >
                {partySearch.trim() ? `Add "${partySearch.trim()}"` : 'Manual'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── New party type sheet ──────────────────────────────────────────────

function NewPartyTypeSheet({
  open,
  newPartyName,
  newPartyPhone,
  creating,
  onClose,
  onPickType,
}: {
  open: boolean;
  newPartyName: string;
  newPartyPhone: string;
  creating: boolean;
  onClose: () => void;
  onPickType: (k: PartyType) => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
              maxHeight: '85%',
            },
          ]}
        >
          <View style={[sheetStyles.grabber, { backgroundColor: t.colors.tertiary }]} />
          <View
            style={[
              sheetStyles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={onClose} hitSlop={8} style={sheetStyles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>Cancel</Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[sheetStyles.title, { fontWeight: '600' }]}
            >
              Party type
            </Text>
            <View style={sheetStyles.sideBtn} />
          </View>

          <Text
            variant="caption1"
            color="secondary"
            style={{ textAlign: 'center', marginTop: 8, paddingHorizontal: 16 }}
          >
            Adding: {newPartyName}{newPartyPhone ? ` (${newPartyPhone})` : ''}
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {PARTY_TYPE_GROUPS.map((group) => (
              <View key={group.label} style={{ marginTop: 18, paddingHorizontal: 16 }}>
                <Text
                  variant="caption2"
                  color="secondary"
                  style={{ letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 }}
                >
                  {group.label.toUpperCase()}
                </Text>
                <FormGroup>
                  {group.types.map((tt, idx) => (
                    <Row
                      key={tt.key}
                      leading={
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            backgroundColor: t.colors.fill3,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons
                            name={tt.icon as keyof typeof Ionicons.glyphMap}
                            size={14}
                            color={t.colors.label}
                          />
                        </View>
                      }
                      label={tt.label}
                      chevron
                      onPress={() => onPickType(tt.key)}
                      divider={idx < group.types.length - 1}
                    />
                  ))}
                </FormGroup>
              </View>
            ))}
          </ScrollView>

          {creating ? (
            <View style={sheetStyles.creatingOverlay}>
              <Text variant="footnote" color="secondary">Creating party…</Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 60 },

  payUnitBlock: {},
  payUnitRow: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  payUnitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});

const sheetStyles = StyleSheet.create({
  sheet: { paddingTop: 8 },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sideBtn: { minWidth: 70 },
  title: { flex: 1, textAlign: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, paddingVertical: 0, margin: 0 },
  sectionHeader: {
    paddingHorizontal: 32,
    paddingTop: 18,
    paddingBottom: 6,
  },
  partyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  partyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  creatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
