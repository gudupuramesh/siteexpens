/**
 * Add Party — comprehensive form matching Onsite-style grouped party types,
 * personal info, KYC documents, opening balance, and bank details.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import * as Contacts from 'expo-contacts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createParty, updateParty } from '@/src/features/parties/parties';
import { useParties } from '@/src/features/parties/useParties';
import {
  ALL_PARTY_TYPES,
  PARTY_TYPE_GROUPS,
  type PartyType,
} from '@/src/features/parties/types';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

// ── Schema ──

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

// ── Component ──

export default function AddPartyScreen() {
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { partyId } = useLocalSearchParams<{ partyId?: string }>();
  const isEdit = !!partyId;

  const { data: parties } = useParties(isEdit ? orgId : undefined);
  const existingParty = useMemo(
    () => (isEdit ? parties.find((p) => p.id === partyId) : undefined),
    [isEdit, parties, partyId],
  );

  const [submitError, setSubmitError] = useState<string>();
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showAdditional, setShowAdditional] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [showBank, setShowBank] = useState(false);

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

  const selectedTypeLabel =
    ALL_PARTY_TYPES.find((t) => t.key === selectedType)?.label ?? '';

  // Prefill form when editing an existing party (runs once when the party is
  // first resolved from the realtime list).
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (!isEdit || !existingParty || didPrefillRef.current) return;
    didPrefillRef.current = true;

    const doj = existingParty.dateOfJoining;
    const dojStr = doj ? doj.toDate().toISOString().slice(0, 10) : '';
    const bank = existingParty.bankDetails ?? {};
    const hasBalance = !!(existingParty.openingBalance && existingParty.openingBalance > 0);
    const hasKyc = !!(existingParty.aadharNumber || existingParty.panNumber);
    const hasBank = Object.values(bank).some(Boolean);

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
      openingBalance: hasBalance ? String(existingParty.openingBalance) : '',
      openingBalanceType: existingParty.openingBalanceType ?? 'to_pay',
      accountHolderName: bank.accountHolderName ?? '',
      accountNumber: bank.accountNumber ?? '',
      ifsc: bank.ifsc ?? '',
      bankName: bank.bankName ?? '',
      bankAddress: bank.bankAddress ?? '',
      iban: bank.iban ?? '',
      upiId: bank.upiId ?? '',
    });

    if (hasKyc) setShowAdditional(true);
    if (hasBalance) setShowBalance(true);
    if (hasBank) setShowBank(true);
  }, [isEdit, existingParty, reset]);

  // ── Contact picker ──

  const pickContact = useCallback(async () => {
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
      if (contactName) setValue('name', contactName, { shouldValidate: true });

      const phone =
        result.phoneNumbers?.[0]?.number ??
        result.phoneNumbers?.[0]?.digits ??
        '';
      if (phone) {
        setValue('phone', phone.replace(/[^\d+]/g, ''), { shouldValidate: true });
      }

      const email = result.emails?.[0]?.email;
      if (email) setValue('email', email, { shouldValidate: true });
    }
  }, [setValue]);

  // ── Submit ──

  async function onSubmit(data: FormData) {
    if (!user || !orgId) return;
    setSubmitError(undefined);
    try {
      const balance = data.openingBalance ? parseFloat(data.openingBalance) : undefined;
      const address =
        [data.address, data.city, data.state, data.pincode].filter(Boolean).join(', ') || undefined;
      const bankDetails = {
        accountHolderName: data.accountHolderName || undefined,
        accountNumber: data.accountNumber || undefined,
        ifsc: data.ifsc || undefined,
        bankName: data.bankName || undefined,
        bankAddress: data.bankAddress || undefined,
        iban: data.iban || undefined,
        upiId: data.upiId || undefined,
      };

      if (isEdit && partyId) {
        await updateParty(partyId, {
          name: data.name,
          phone: data.phone,
          partyType: data.partyType as PartyType,
          email: data.email || undefined,
          fatherName: data.fatherName || undefined,
          dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : undefined,
          address,
          aadharNumber: data.aadharNumber || undefined,
          panNumber: data.panNumber || undefined,
          openingBalance: balance,
          openingBalanceType: balance ? (data.openingBalanceType ?? 'to_pay') : undefined,
          bankDetails,
        });
      } else {
        await createParty({
          orgId,
          name: data.name,
          phone: data.phone,
          partyType: data.partyType as PartyType,
          createdBy: user.uid,
          email: data.email || undefined,
          fatherName: data.fatherName || undefined,
          dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : undefined,
          address,
          aadharNumber: data.aadharNumber || undefined,
          panNumber: data.panNumber || undefined,
          openingBalance: balance,
          openingBalanceType: balance ? (data.openingBalanceType ?? 'to_pay') : undefined,
          bankDetails,
        });
      }
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  // ── Render ──

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav */}
      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="close" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>
          {isEdit ? 'Edit Party' : 'Create New Party'}
        </Text>
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
          {/* ── Pick from contacts ── */}
          <Pressable
            onPress={pickContact}
            style={({ pressed }) => [styles.contactBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="person-add" size={20} color={color.primary} />
            <Text variant="bodyStrong" color="primary">Pick from Contacts</Text>
          </Pressable>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text variant="caption" color="textMuted">OR ENTER MANUALLY</Text>
            <View style={styles.orLine} />
          </View>

          {/* ── Party Type selector ── */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            PARTY TYPE *
          </Text>
          <Pressable
            onPress={() => setShowTypePicker(true)}
            style={[
              styles.typeSelector,
              selectedType ? styles.typeSelectorActive : undefined,
            ]}
          >
            {selectedType ? (
              <View style={styles.typeSelectorInner}>
                <Ionicons
                  name={ALL_PARTY_TYPES.find((t) => t.key === selectedType)?.icon as any ?? 'person'}
                  size={18}
                  color={color.primary}
                />
                <Text variant="body" color="text">{selectedTypeLabel}</Text>
              </View>
            ) : (
              <Text variant="body" color="textFaint">Select party type</Text>
            )}
            <Ionicons name="chevron-down" size={18} color={color.textMuted} />
          </Pressable>
          {errors.partyType?.message && (
            <Text variant="caption" color="danger" style={{ marginTop: 4 }}>
              {errors.partyType.message}
            </Text>
          )}

          {/* ── Basic fields ── */}
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Party Name *"
                placeholder="e.g. Ramesh Kumar"
                autoCapitalize="words"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Phone Number *"
                placeholder="e.g. 9876543210"
                keyboardType="phone-pad"
                value={value}
                onChangeText={(t) => onChange(t.replace(/[^\d+]/g, ''))}
                onBlur={onBlur}
                error={errors.phone?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Email"
                placeholder="e.g. ramesh@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="fatherName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Father Name"
                placeholder="e.g. Suresh Kumar"
                autoCapitalize="words"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          <Controller
            control={control}
            name="dateOfJoining"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Date of Joining"
                placeholder="DD/MM/YYYY"
                keyboardType="numeric"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          {/* ── Address ── */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            ADDRESS
          </Text>

          <Controller
            control={control}
            name="address"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Street / Locality"
                placeholder="e.g. 12, MG Road, Near Bus Stand"
                multiline
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          <View style={styles.rowFields}>
            <View style={styles.rowFieldHalf}>
              <Controller
                control={control}
                name="city"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="City"
                    placeholder="e.g. Hyderabad"
                    autoCapitalize="words"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
            </View>
            <View style={styles.rowFieldHalf}>
              <Controller
                control={control}
                name="state"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="State"
                    placeholder="e.g. Telangana"
                    autoCapitalize="words"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
            </View>
          </View>

          <Controller
            control={control}
            name="pincode"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Pincode"
                placeholder="e.g. 500001"
                keyboardType="numeric"
                value={value ?? ''}
                onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, 6))}
                onBlur={onBlur}
              />
            )}
          />

          {/* ── Additional Fields (Aadhar / PAN) ── */}
          <Pressable
            onPress={() => setShowAdditional(!showAdditional)}
            style={styles.expandHeader}
          >
            <View style={styles.expandHeaderLeft}>
              <Ionicons name="document-text-outline" size={18} color={color.primary} />
              <Text variant="bodyStrong" color="text">Additional Fields</Text>
            </View>
            <Ionicons
              name={showAdditional ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={color.textMuted}
            />
          </Pressable>

          {showAdditional && (
            <View style={styles.expandContent}>
              <Controller
                control={control}
                name="aadharNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View>
                    <TextField
                      label="Aadhar Number"
                      placeholder="XXXX XXXX XXXX"
                      keyboardType="numeric"
                      value={value ?? ''}
                      onChangeText={(t) => {
                        // Auto-format with spaces every 4 digits
                        const digits = t.replace(/\D/g, '').slice(0, 12);
                        const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
                        onChange(formatted);
                      }}
                      onBlur={onBlur}
                    />
                    <Pressable style={styles.uploadBtn}>
                      <Ionicons name="cloud-upload-outline" size={16} color={color.primary} />
                      <Text variant="meta" color="primary">Upload Aadhar</Text>
                    </Pressable>
                  </View>
                )}
              />

              <Controller
                control={control}
                name="panNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <View>
                    <TextField
                      label="PAN Number"
                      placeholder="ABCDE1234F"
                      autoCapitalize="characters"
                      value={value ?? ''}
                      onChangeText={(t) => onChange(t.toUpperCase().slice(0, 10))}
                      onBlur={onBlur}
                    />
                    <Pressable style={styles.uploadBtn}>
                      <Ionicons name="cloud-upload-outline" size={16} color={color.primary} />
                      <Text variant="meta" color="primary">Upload PAN</Text>
                    </Pressable>
                  </View>
                )}
              />
            </View>
          )}

          {/* ── Opening Balance ── */}
          <Pressable
            onPress={() => setShowBalance(!showBalance)}
            style={styles.expandHeader}
          >
            <View style={styles.expandHeaderLeft}>
              <Ionicons name="wallet-outline" size={18} color={color.primary} />
              <Text variant="bodyStrong" color="text">Opening Balance</Text>
            </View>
            <Ionicons
              name={showBalance ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={color.textMuted}
            />
          </Pressable>

          {showBalance && (
            <View style={styles.expandContent}>
              <Text variant="meta" color="textMuted" style={{ marginBottom: space.sm }}>
                If this party already has a pending balance before using SiteExpens, enter it here.
              </Text>

              <Controller
                control={control}
                name="openingBalance"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Amount (₹)"
                    placeholder="0"
                    keyboardType="numeric"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              <Text variant="caption" color="textMuted" style={{ marginBottom: space.xs }}>
                WHO OWES WHOM?
              </Text>
              <View style={styles.balanceTypeRow}>
                <Pressable
                  onPress={() => setValue('openingBalanceType', 'to_pay')}
                  style={[
                    styles.balanceChip,
                    balanceType === 'to_pay' && styles.balanceChipPay,
                  ]}
                >
                  <Ionicons
                    name="arrow-up-circle-outline"
                    size={16}
                    color={balanceType === 'to_pay' ? color.danger : color.textMuted}
                  />
                  <Text
                    variant="metaStrong"
                    style={{ color: balanceType === 'to_pay' ? color.danger : color.textMuted }}
                  >
                    You Owe Them
                  </Text>
                  <Text
                    variant="caption"
                    style={{ color: balanceType === 'to_pay' ? color.danger : color.textFaint }}
                  >
                    (To Pay)
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setValue('openingBalanceType', 'to_receive')}
                  style={[
                    styles.balanceChip,
                    balanceType === 'to_receive' && styles.balanceChipReceive,
                  ]}
                >
                  <Ionicons
                    name="arrow-down-circle-outline"
                    size={16}
                    color={balanceType === 'to_receive' ? color.success : color.textMuted}
                  />
                  <Text
                    variant="metaStrong"
                    style={{ color: balanceType === 'to_receive' ? color.success : color.textMuted }}
                  >
                    They Owe You
                  </Text>
                  <Text
                    variant="caption"
                    style={{ color: balanceType === 'to_receive' ? color.success : color.textFaint }}
                  >
                    (To Receive)
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Bank Details ── */}
          <Pressable
            onPress={() => setShowBank(!showBank)}
            style={styles.expandHeader}
          >
            <View style={styles.expandHeaderLeft}>
              <Ionicons name="business-outline" size={18} color={color.primary} />
              <Text variant="bodyStrong" color="text">Bank Details</Text>
            </View>
            <Ionicons
              name={showBank ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={color.textMuted}
            />
          </Pressable>

          {showBank && (
            <View style={styles.expandContent}>
              <Controller
                control={control}
                name="accountHolderName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Account Holder Name"
                    placeholder="As per bank records"
                    autoCapitalize="words"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              <Controller
                control={control}
                name="accountNumber"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Account Number"
                    placeholder="Enter account number"
                    keyboardType="numeric"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              <Controller
                control={control}
                name="ifsc"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="IFSC Code"
                    placeholder="e.g. SBIN0001234"
                    autoCapitalize="characters"
                    value={value ?? ''}
                    onChangeText={(t) => onChange(t.toUpperCase())}
                    onBlur={onBlur}
                  />
                )}
              />

              <Controller
                control={control}
                name="bankName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Bank Name"
                    placeholder="e.g. State Bank of India"
                    autoCapitalize="words"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              <Controller
                control={control}
                name="bankAddress"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Bank Address"
                    placeholder="Branch address"
                    multiline
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />

              <Controller
                control={control}
                name="iban"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="IBAN Number"
                    placeholder="International bank account number"
                    autoCapitalize="characters"
                    value={value ?? ''}
                    onChangeText={(t) => onChange(t.toUpperCase())}
                    onBlur={onBlur}
                  />
                )}
              />

              <Controller
                control={control}
                name="upiId"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="UPI ID"
                    placeholder="e.g. name@upi"
                    autoCapitalize="none"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
            </View>
          )}

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>
              {submitError}
            </Text>
          )}
        </ScrollView>

        {/* Sticky footer */}
        <View style={styles.footer}>
          <Button
            label={isEdit ? 'Save Changes' : 'Save Party'}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isValid || !orgId}
          />
        </View>
      </KeyboardAvoidingView>

      {/* ── Party Type Picker Modal ── */}
      <Modal
        visible={showTypePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTypePicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowTypePicker(false)}>
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
            Select Party Type
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
            {PARTY_TYPE_GROUPS.map((group) => (
              <View key={group.label} style={styles.typeGroup}>
                <Text variant="caption" color="textMuted" style={styles.typeGroupLabel}>
                  {group.label.toUpperCase()}
                </Text>
                {group.types.map((t) => {
                  const active = selectedType === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => {
                        setValue('partyType', t.key, { shouldValidate: true });
                        setShowTypePicker(false);
                      }}
                      style={({ pressed }) => [
                        styles.typeOption,
                        active && styles.typeOptionActive,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View style={[styles.typeIconWrap, active && styles.typeIconWrapActive]}>
                        <Ionicons
                          name={t.icon as any}
                          size={18}
                          color={active ? color.onPrimary : color.textMuted}
                        />
                      </View>
                      <Text
                        variant="body"
                        color={active ? 'primary' : 'text'}
                        style={active ? { fontWeight: '600' } : undefined}
                      >
                        {t.label}
                      </Text>
                      {active && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={color.primary}
                          style={{ marginLeft: 'auto' }}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

// ── Styles ──

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
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { flex: 1, textAlign: 'center' },

  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.xxl,
  },

  // Contact picker
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: color.primarySoft,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    paddingVertical: space.sm,
    borderStyle: 'dashed',
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

  // Section label
  sectionLabel: {
    marginTop: space.sm,
    marginBottom: space.xs,
  },

  // Type selector
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    minHeight: 48,
  },
  typeSelectorActive: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  typeSelectorInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },

  // Row fields (side by side)
  rowFields: {
    flexDirection: 'row',
    gap: space.sm,
  },
  rowFieldHalf: {
    flex: 1,
  },

  // Expandable sections
  expandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.bgGrouped,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    marginTop: space.md,
  },
  expandHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  expandContent: {
    paddingTop: space.xs,
  },

  // Upload button
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    borderStyle: 'dashed',
    marginBottom: space.sm,
  },

  // Balance type
  balanceTypeRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.sm,
  },
  balanceChip: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  balanceChipPay: {
    borderColor: color.danger,
    backgroundColor: color.dangerSoft,
  },
  balanceChipReceive: {
    borderColor: color.success,
    backgroundColor: color.successSoft,
  },

  // Footer
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
    maxHeight: '70%',
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
    marginBottom: space.md,
  },
  modalScroll: {
    paddingHorizontal: screenInset,
  },

  // Type groups
  typeGroup: {
    marginBottom: space.md,
  },
  typeGroupLabel: {
    marginBottom: space.xs,
    letterSpacing: 0.5,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
  },
  typeOptionActive: {
    backgroundColor: color.primarySoft,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.bgGrouped,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconWrapActive: {
    backgroundColor: color.primary,
  },
});
