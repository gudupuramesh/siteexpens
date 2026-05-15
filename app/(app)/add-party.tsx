/**
 * Add / Edit Party — v2 design.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "New party" / "Edit party" · Save
 *   2. FormGroup "Type" — opens TypePickerSheet (sectioned General/Vendor)
 *   3. FormGroup "Identity" — Name + Phone + Email + Father + Joined date
 *   4. FormGroup "Address" — Street + City + State + Pincode
 *   5. FormGroup "Compliance (optional)" — Aadhar + PAN
 *   6. FormGroup "Opening balance" — Amount + To-pay/To-receive pill row
 *   7. FormGroup "Bank (optional)" — Holder + Bank + Account + IFSC + Branch + UPI + IBAN
 *
 * Manual entry only — there is no native iOS contact picker on this
 * form. Phonebook contacts are surfaced inline by `/select-party`
 * (the unified party picker), which is the canonical way to bring a
 * contact into the system. This screen accepts optional `prefillName`
 * / `prefillPhone` query params for the case where `/select-party`
 * routed here after the user tapped a contact.
 *
 * Preserves all existing schema validation, Firestore writes
 * (createParty/updateParty), and the defensive `safeDate` +
 * `dropUndefined` helpers (Firestore rejects `undefined` values).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import {
  createParty,
  updateParty,
  DuplicatePhoneError,
  InvalidPhoneError,
} from '@/src/features/parties/parties';
import { setNewPartyOutbox } from '@/src/features/parties/newPartyOutbox';
import { useParties } from '@/src/features/parties/useParties';
import {
  ALL_PARTY_TYPES,
  PARTY_TYPE_GROUPS,
  getPartyTypeLabel,
  type PartyType,
} from '@/src/features/parties/types';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const schema = z.object({
  name: z.string().trim().min(2, 'Name required').max(100),
  phone: z.string().trim().min(10, 'Enter valid phone').max(15),
  partyType: z.string().min(1, 'Select party type'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  fatherName: z.string().optional(),
  dateOfJoining: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  aadharNumber: z.string().optional(),
  panNumber: z.string().optional(),
  openingBalance: z.string().optional(),
  openingBalanceType: z.enum(['to_pay', 'to_receive']).optional(),
  // Bank details
  accountHolderName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifsc: z.string().optional(),
  bankName: z.string().optional(),
  bankAddress: z.string().optional(),
  iban: z.string().optional(),
  upiId: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function safeDate(input: string | undefined | null): Date | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function dropUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in o) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

export default function AddPartyScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const {
    partyId,
    prefillName,
    prefillPhone,
    returnSelection,
  } = useLocalSearchParams<{
    partyId?: string;
    prefillName?: string;
    prefillPhone?: string;
    /** When '1', after a successful create (or duplicate match) the
     * new/existing party is stashed in `newPartyOutbox` and the screen
     * pops back so the originating screen (e.g. add-transaction) can
     * auto-select it on focus. */
    returnSelection?: string;
  }>();
  const isEdit = !!partyId;
  const shouldReturnSelection = returnSelection === '1';

  const { data: parties } = useParties(isEdit ? orgId : undefined);
  const existingParty = useMemo(
    () => (isEdit ? parties.find((p) => p.id === partyId) : undefined),
    [isEdit, parties, partyId],
  );

  const [submitError, setSubmitError] = useState<string>();
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showDojPicker, setShowDojPicker] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      partyType: '',
      email: '',
      fatherName: '',
      dateOfJoining: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      aadharNumber: '',
      panNumber: '',
      openingBalance: '',
      openingBalanceType: 'to_pay',
      accountHolderName: '',
      accountNumber: '',
      ifsc: '',
      bankName: '',
      bankAddress: '',
      iban: '',
      upiId: '',
    },
    mode: 'onChange',
  });

  const selectedType = watch('partyType');
  const balanceType = watch('openingBalanceType');
  const dojValue = watch('dateOfJoining');

  const selectedTypeMeta = ALL_PARTY_TYPES.find((tt) => tt.key === selectedType);
  const selectedTypeLabel = selectedTypeMeta?.label ?? '';

  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (!isEdit || !existingParty || didPrefillRef.current) return;
    didPrefillRef.current = true;

    const doj = existingParty.dateOfJoining;
    const dojStr = doj ? doj.toDate().toISOString().slice(0, 10) : '';
    const bank = existingParty.bankDetails ?? {};

    reset({
      name: existingParty.name,
      phone: existingParty.phone,
      partyType: (existingParty.partyType ?? existingParty.role ?? '') as string,
      email: existingParty.email ?? '',
      fatherName: existingParty.fatherName ?? '',
      dateOfJoining: dojStr,
      address: existingParty.address ?? '',
      city: '',
      state: '',
      pincode: '',
      aadharNumber: existingParty.aadharNumber ?? '',
      panNumber: existingParty.panNumber ?? '',
      openingBalance:
        existingParty.openingBalance && existingParty.openingBalance > 0
          ? String(existingParty.openingBalance)
          : '',
      openingBalanceType: existingParty.openingBalanceType ?? 'to_pay',
      accountHolderName: bank.accountHolderName ?? '',
      accountNumber: bank.accountNumber ?? '',
      ifsc: bank.ifsc ?? '',
      bankName: bank.bankName ?? '',
      bankAddress: bank.bankAddress ?? '',
      iban: bank.iban ?? '',
      upiId: bank.upiId ?? '',
    });
  }, [isEdit, existingParty, reset]);

  // Prefill from query params when launched inline from another screen
  // (e.g. tapping "Add 'X'" or "From contacts" inside the Add Transaction
  // party picker). Skipped in edit mode — the existing-party prefill
  // effect above wins. Runs once on mount.
  const didPrefillFromParamsRef = useRef(false);
  useEffect(() => {
    if (isEdit) return;
    if (didPrefillFromParamsRef.current) return;
    if (!prefillName && !prefillPhone) return;
    didPrefillFromParamsRef.current = true;
    if (prefillName) setValue('name', prefillName, { shouldValidate: true });
    if (prefillPhone) setValue('phone', prefillPhone, { shouldValidate: true });
  }, [isEdit, prefillName, prefillPhone, setValue]);

  async function onSubmit(data: FormData) {
    if (!user || !orgId) return;
    setSubmitError(undefined);
    try {
      const balance = data.openingBalance ? parseFloat(data.openingBalance) : undefined;
      const address =
        [data.address, data.city, data.state, data.pincode].filter(Boolean).join(', ') || undefined;

      const bankDetailsRaw = {
        accountHolderName: data.accountHolderName || undefined,
        accountNumber: data.accountNumber || undefined,
        ifsc: data.ifsc || undefined,
        bankName: data.bankName || undefined,
        bankAddress: data.bankAddress || undefined,
        iban: data.iban || undefined,
        upiId: data.upiId || undefined,
      };
      const bankDetailsClean = dropUndefined(bankDetailsRaw);
      const bankDetails =
        Object.keys(bankDetailsClean).length > 0 ? bankDetailsClean : undefined;

      const payload = dropUndefined({
        name: data.name,
        phone: data.phone,
        partyType: data.partyType as PartyType,
        email: data.email || undefined,
        fatherName: data.fatherName || undefined,
        dateOfJoining: safeDate(data.dateOfJoining),
        address,
        aadharNumber: data.aadharNumber || undefined,
        panNumber: data.panNumber || undefined,
        openingBalance: balance,
        openingBalanceType: balance ? (data.openingBalanceType ?? 'to_pay') : undefined,
        bankDetails,
      });

      if (isEdit && partyId) {
        await updateParty(partyId, payload);
      } else {
        const newId = await createParty({
          orgId,
          createdBy: user.uid,
          ...payload,
          name: data.name,
          phone: data.phone,
          partyType: data.partyType as PartyType,
        });
        // Inline-from-transaction caller wants the new party id back.
        if (shouldReturnSelection) {
          setNewPartyOutbox({ id: newId, name: data.name });
        }
      }
      // Snapshot-propagation buffer (see add-transaction.tsx).
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (err) {
      // Duplicate phone — same person already exists in this org.
      // If we were launched inline from another screen, hand the
      // existing party back via the outbox so the caller can select
      // it without forcing the user to re-do the work. Otherwise
      // surface a friendly alert and stay on the form so the user
      // can correct the phone or cancel.
      if (err instanceof DuplicatePhoneError) {
        if (shouldReturnSelection) {
          setNewPartyOutbox({
            id: err.existing.id,
            name: err.existing.name,
          });
          await new Promise((r) => setTimeout(r, 200));
          router.back();
          return;
        }
        Alert.alert(
          'Already saved',
          `${err.existing.name} is already a ${getPartyTypeLabel(err.existing.partyType)}. Open them from the Parties tab to change details.`,
        );
        return;
      }
      if (err instanceof InvalidPhoneError) {
        setSubmitError(err.message);
        return;
      }
      setSubmitError((err as Error).message);
    }
  }

  // DoJ display helpers
  const dojDate = dojValue ? new Date(`${dojValue}T00:00:00`) : null;
  const dojLabel = dojDate
    ? dojDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Pick date';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title={isEdit ? 'Edit party' : 'New party'}
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={isSubmitting}
        saveDisabled={!isValid || !orgId}
        onCancel={() => router.back()}
        onSave={() => void handleSubmit(onSubmit)()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Type */}
          <FormGroup header="Type">
            <Row
              label="Party type"
              value={selectedTypeLabel || 'Select'}
              valueColor={selectedTypeLabel ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setShowTypePicker(true)}
              divider={false}
            />
          </FormGroup>
          {errors.partyType?.message ? (
            <FieldNote text={errors.partyType.message} />
          ) : null}

          {/* Identity */}
          <FormGroup header="Identity">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Ramesh Kumar"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Phone"
                  value={value}
                  onChangeText={(tx) => onChange(tx.replace(/[^\d+]/g, ''))}
                  onBlur={onBlur}
                  placeholder="9876543210"
                  keyboardType="phone-pad"
                />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Email"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Optional"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              )}
            />
            <Controller
              control={control}
              name="fatherName"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Father"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Optional"
                  autoCapitalize="words"
                />
              )}
            />
            <Row
              label="Joined"
              value={dojLabel}
              valueColor={dojDate ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setShowDojPicker(true)}
              divider={false}
            />
          </FormGroup>
          {errors.name?.message ? <FieldNote text={errors.name.message} /> : null}
          {errors.phone?.message ? <FieldNote text={errors.phone.message} /> : null}
          {errors.email?.message ? <FieldNote text={errors.email.message} /> : null}

          {/* Address */}
          <FormGroup header="Address">
            <Controller
              control={control}
              name="address"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Street"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Optional"
                  autoCapitalize="sentences"
                />
              )}
            />
            <Controller
              control={control}
              name="city"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="City"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder=""
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="state"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="State"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder=""
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="pincode"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="PIN"
                  value={value ?? ''}
                  onChangeText={(tx) => onChange(tx.replace(/\D/g, '').slice(0, 6))}
                  onBlur={onBlur}
                  placeholder=""
                  keyboardType="number-pad"
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {/* Compliance */}
          <FormGroup header="Compliance (optional)">
            <Controller
              control={control}
              name="aadharNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Aadhar"
                  value={value ?? ''}
                  onChangeText={(tx) => {
                    const digits = tx.replace(/\D/g, '').slice(0, 12);
                    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
                    onChange(formatted);
                  }}
                  onBlur={onBlur}
                  placeholder="XXXX XXXX XXXX"
                  keyboardType="numeric"
                />
              )}
            />
            <Controller
              control={control}
              name="panNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="PAN"
                  value={value ?? ''}
                  onChangeText={(tx) => onChange(tx.toUpperCase().slice(0, 10))}
                  onBlur={onBlur}
                  placeholder="ABCDE1234F"
                  autoCapitalize="characters"
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {/* Opening balance */}
          <FormGroup
            header="Opening balance"
            footer="If this party already has a pending balance before using Interior OS, enter it here."
          >
            <Controller
              control={control}
              name="openingBalance"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Amount"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="0"
                  keyboardType="numeric"
                />
              )}
            />
            <View style={styles.balanceRow}>
              <BalancePill
                active={balanceType === 'to_pay'}
                tone={t.palette.red}
                label="You owe them"
                sub="To pay"
                onPress={() => setValue('openingBalanceType', 'to_pay')}
              />
              <BalancePill
                active={balanceType === 'to_receive'}
                tone={t.palette.green}
                label="They owe you"
                sub="To receive"
                onPress={() => setValue('openingBalanceType', 'to_receive')}
              />
            </View>
          </FormGroup>

          {/* Bank */}
          <FormGroup header="Bank (optional)">
            <Controller
              control={control}
              name="accountHolderName"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Holder"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="As per bank records"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="bankName"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Bank"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. HDFC Bank"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="accountNumber"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Account"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Account number"
                  keyboardType="numeric"
                />
              )}
            />
            <Controller
              control={control}
              name="ifsc"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="IFSC"
                  value={value ?? ''}
                  onChangeText={(tx) => onChange(tx.toUpperCase())}
                  onBlur={onBlur}
                  placeholder="HDFC0000123"
                  autoCapitalize="characters"
                />
              )}
            />
            <Controller
              control={control}
              name="bankAddress"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Branch"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Branch address"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="upiId"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="UPI"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="name@bank"
                  autoCapitalize="none"
                />
              )}
            />
            <Controller
              control={control}
              name="iban"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="IBAN"
                  value={value ?? ''}
                  onChangeText={(tx) => onChange(tx.toUpperCase())}
                  onBlur={onBlur}
                  placeholder="International A/c"
                  autoCapitalize="characters"
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {submitError ? <FieldNote text={submitError} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Type picker sheet */}
      <TypePickerSheet
        visible={showTypePicker}
        selected={selectedType as PartyType | ''}
        onPick={(k) => {
          setValue('partyType', k, { shouldValidate: true });
          setShowTypePicker(false);
        }}
        onClose={() => setShowTypePicker(false)}
      />

      {/* DoJ date picker */}
      <DateTimeSheet
        open={showDojPicker}
        value={dojDate ?? new Date()}
        mode="date"
        title="Date of joining"
        onChange={(d) => {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          setValue('dateOfJoining', `${yyyy}-${mm}-${dd}`, { shouldValidate: true });
        }}
        onClose={() => setShowDojPicker(false)}
      />
    </View>
  );
}

function FieldNote({ text }: { text: string }) {
  const t = useThemeV2();
  return (
    <Text
      variant="caption2"
      style={{
        color: t.palette.red.base,
        paddingHorizontal: 32,
        marginTop: 8,
      }}
    >
      {text}
    </Text>
  );
}

function BalancePill({
  active,
  tone,
  label,
  sub,
  onPress,
}: {
  active: boolean;
  tone: { base: string; soft: string; softDark: string };
  label: string;
  sub: string;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.balancePill,
        {
          backgroundColor: active
            ? t.mode === 'dark'
              ? tone.softDark
              : tone.soft
            : t.colors.fill3,
          borderRadius: t.radii.field,
          borderColor: active ? tone.base + '33' : 'transparent',
          borderWidth: 1,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={active ? tone.base : t.colors.tertiary}
      />
      <View style={{ marginLeft: 8 }}>
        <Text
          variant="footnote"
          style={{
            color: active ? tone.base : t.colors.label,
            fontWeight: active ? '700' : '500',
          }}
        >
          {label}
        </Text>
        <Text
          variant="caption2"
          style={{
            color: active ? tone.base : t.colors.tertiary,
            marginTop: 1,
          }}
        >
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Type Picker Sheet ──

function TypePickerSheet({
  visible,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  selected: PartyType | '';
  onPick: (k: PartyType) => void;
  onClose: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
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
          <View
            style={[sheetStyles.grabber, { backgroundColor: t.colors.tertiary }]}
          />
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
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[sheetStyles.title, { fontWeight: '600' }]}
            >
              Select party type
            </Text>
            <View style={sheetStyles.sideBtn} />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {PARTY_TYPE_GROUPS.map((group) => (
              <View key={group.label} style={{ marginTop: 16 }}>
                <Text
                  variant="caption2"
                  color="secondary"
                  style={{
                    paddingHorizontal: 32,
                    paddingBottom: 6,
                    letterSpacing: 0.4,
                  }}
                >
                  {group.label.toUpperCase()}
                </Text>
                {group.types.map((tt, idx) => {
                  const sel = selected === tt.key;
                  const last = idx === group.types.length - 1;
                  return (
                    <Pressable
                      key={tt.key}
                      onPress={() => onPick(tt.key)}
                      style={({ pressed }) => [
                        sheetStyles.optionRow,
                        pressed && { backgroundColor: t.colors.fill3 },
                      ]}
                    >
                      <View
                        style={[
                          sheetStyles.iconTile,
                          {
                            backgroundColor: sel
                              ? t.mode === 'dark'
                                ? t.palette.blue.softDark
                                : t.palette.blue.soft
                              : t.colors.fill3,
                            borderRadius: t.radii.tile,
                          },
                        ]}
                      >
                        <Ionicons
                          name={tt.icon as keyof typeof Ionicons.glyphMap}
                          size={16}
                          color={sel ? t.palette.blue.base : t.colors.secondary}
                        />
                      </View>
                      <Text
                        variant="body"
                        color="label"
                        style={{
                          flex: 1,
                          marginLeft: 12,
                          fontWeight: sel ? '600' : '400',
                        }}
                      >
                        {tt.label}
                      </Text>
                      {sel ? (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={t.palette.blue.base}
                        />
                      ) : null}
                      {!last ? (
                        <View
                          style={[
                            sheetStyles.divider,
                            { backgroundColor: t.colors.separator, left: 60 },
                          ]}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Balance pill row
  balanceRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 8,
  },
  balancePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
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

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    position: 'relative',
  },
  iconTile: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },
});
