/**
 * Add Transaction — Payment In / Payment Out form.
 * Receives `type` from query params. Party picker shows project parties first,
 * then all org parties. Users can add a new party from contacts inline.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
  PARTY_TYPE_GROUPS,
  getPartyTypeLabel,
  type PartyType,
  type Party,
} from '@/src/features/parties/types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { createTransaction } from '@/src/features/transactions/transactions';
import {
  TRANSACTION_CATEGORIES,
  PAYMENT_METHODS,
  type TransactionCategory,
  type PaymentMethod,
} from '@/src/features/transactions/types';
import { formatDate } from '@/src/lib/format';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

// ── Schema ──

const schema = z.object({
  type: z.enum(['payment_in', 'payment_out']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount'),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  partyName: z.string().trim().min(1, 'Select or enter party'),
  partyId: z.string().optional(),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  referenceNumber: z.string().optional(),
  status: z.enum(['paid', 'pending', 'partial']),
  date: z.date(),
});

type FormData = z.infer<typeof schema>;

// ── Component ──

export default function AddTransactionScreen() {
  const params = useLocalSearchParams<{ id: string; type?: string }>();
  const projectId = params.id;
  const initialType = params.type === 'payment_in' ? 'payment_in' : 'payment_out';

  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: allParties } = useParties(orgId || undefined);
  const { data: transactions } = useTransactions(projectId);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPartyPicker, setShowPartyPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMoreDetail, setShowMoreDetail] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [submitError, setSubmitError] = useState<string>();

  // New party from contact flow
  const [showNewPartyType, setShowNewPartyType] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [creatingParty, setCreatingParty] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: initialType,
      amount: '',
      description: '',
      partyName: '',
      partyId: '',
      category: '',
      paymentMethod: '',
      referenceNumber: '',
      status: 'paid',
      date: new Date(),
    },
    mode: 'onChange',
  });

  const selectedType = watch('type');
  const selectedDate = watch('date');
  const selectedPartyName = watch('partyName');
  const selectedCategory = watch('category');
  const selectedPaymentMethod = watch('paymentMethod');

  const isPaymentIn = selectedType === 'payment_in';
  const navTitle = isPaymentIn ? 'Payment In' : 'Payment Out';

  // ── Party sections: project parties first, then rest ──

  const partySections = useMemo(() => {
    // Get unique party names from this project's transactions
    const projectPartyNames = new Set(
      transactions.map((t) => t.partyName).filter(Boolean),
    );

    const projectParties: Party[] = [];
    const otherParties: Party[] = [];

    const search = partySearch.toLowerCase();

    for (const p of allParties) {
      if (search && !p.name.toLowerCase().includes(search)) continue;
      if (projectPartyNames.has(p.name)) {
        projectParties.push(p);
      } else {
        otherParties.push(p);
      }
    }

    const sections: { title: string; data: Party[] }[] = [];
    if (projectParties.length > 0) {
      sections.push({ title: 'Project Parties', data: projectParties });
    }
    if (otherParties.length > 0) {
      sections.push({ title: 'All Parties', data: otherParties });
    }
    return sections;
  }, [allParties, transactions, partySearch]);

  const categoryLabel = TRANSACTION_CATEGORIES.find((c) => c.key === selectedCategory)?.label;

  // ── Handlers ──

  function handleDateChange(_: DateTimePickerEvent, date?: Date) {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) setValue('date', date);
  }

  const selectParty = useCallback((party: Party) => {
    setValue('partyName', party.name, { shouldValidate: true });
    setValue('partyId', party.id);
    setShowPartyPicker(false);
    setPartySearch('');
  }, [setValue]);

  // Pick from phone contacts → show party type picker → create party
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
      setValue('partyName', newPartyName, { shouldValidate: true });
      setValue('partyId', partyId);
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
      await createTransaction({
        projectId,
        orgId,
        type: data.type,
        amount: parseFloat(data.amount),
        description: data.description || '',
        partyId: data.partyId || undefined,
        partyName: data.partyName,
        category: (data.category as TransactionCategory) || undefined,
        paymentMethod: (data.paymentMethod as PaymentMethod) || undefined,
        referenceNumber: data.referenceNumber || undefined,
        status: data.status,
        date: data.date,
        createdBy: user.uid,
      });
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
          <Ionicons name="arrow-back" size={22} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>EXPENSE</Text>
          <Text variant="bodyStrong" color="text" style={styles.navTitle}>
            {navTitle}
          </Text>
        </View>
        <View style={styles.navBtn} />
      </View>

      {/* Amount hero + date */}
      <View style={styles.hero}>
        <Text variant="caption" color="textMuted" style={styles.heroLabel}>
          AMOUNT - INR
        </Text>
        <View style={styles.heroAmountRow}>
          <Text
            variant="title"
            style={{ color: isPaymentIn ? color.success : color.primary }}
          >
            {isPaymentIn ? '+ Rs' : '- Rs'}
          </Text>
          <Controller
            control={control}
            name="amount"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                value={value}
                onChangeText={(t) => onChange(t.replace(/[^\d.]/g, ''))}
                onBlur={onBlur}
                placeholder="0"
                keyboardType="numeric"
                style={styles.heroAmountInput}
                placeholderTextColor={color.textFaint}
              />
            )}
          />
        </View>
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={styles.dateChip}
        >
          <Text variant="metaStrong" color="text">{formatDate(selectedDate)}</Text>
          <Ionicons name="chevron-down" size={14} color={color.textMuted} />
        </Pressable>
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
          {/* To Party */}
          <Pressable
            onPress={() => setShowPartyPicker(true)}
            style={styles.partySelector}
          >
            <Ionicons name="people-outline" size={20} color={color.textMuted} />
            <Text
              variant="body"
              color={selectedPartyName ? 'text' : 'textFaint'}
              style={styles.flex}
              numberOfLines={1}
            >
              {selectedPartyName || `${isPaymentIn ? 'From' : 'To'} Party *`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={color.textMuted} />
          </Pressable>

          {/* Description */}
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Description"
                placeholder="e.g. Cement purchase, Labour payment"
                autoCapitalize="sentences"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                square
                strongBorder
              />
            )}
          />
          {errors.amount?.message ? (
            <Text variant="caption" color="danger" style={{ marginTop: 2 }}>
              {errors.amount.message}
            </Text>
          ) : null}

          {/* Reference Number */}
          <Controller
            control={control}
            name="referenceNumber"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Reference Number"
                placeholder="Bill / Invoice / Cheque number"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                square
                strongBorder
              />
            )}
          />

          {/* Payment Method */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            PAYMENT METHOD
          </Text>
          <View style={styles.methodRow}>
            {PAYMENT_METHODS.map((m) => {
              const active = selectedPaymentMethod === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setValue('paymentMethod', active ? '' : m.key)}
                  style={[styles.methodChip, active && styles.methodChipActive]}
                >
                  <Ionicons
                    name={m.icon as any}
                    size={16}
                    color={active ? color.onPrimary : color.textMuted}
                  />
                  <Text
                    variant="caption"
                    style={{ color: active ? color.onPrimary : color.text, textAlign: 'center' }}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Category / Cost Code */}
          <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
            COST CODE
          </Text>
          <Pressable
            onPress={() => setShowCategoryPicker(true)}
            style={styles.dropdownField}
          >
            <Text variant="body" color={categoryLabel ? 'text' : 'textFaint'}>
              {categoryLabel ?? 'Select category'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={color.textMuted} />
          </Pressable>

          {/* Add More Detail */}
          <Pressable
            onPress={() => setShowMoreDetail(!showMoreDetail)}
            style={styles.moreDetailHeader}
          >
            <Text variant="bodyStrong" color="text">Add More Detail</Text>
            <Ionicons
              name={showMoreDetail ? 'remove' : 'add'}
              size={20}
              color={color.primary}
            />
          </Pressable>

          {showMoreDetail && (
            <View style={styles.moreDetailContent}>
              <Text variant="caption" color="textMuted" style={styles.sectionLabel}>
                PAYMENT STATUS
              </Text>
              <View style={styles.methodRow}>
                {(['paid', 'pending', 'partial'] as const).map((s) => {
                  const active = watch('status') === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setValue('status', s)}
                      style={[styles.statusChip, active && styles.statusChipActive]}
                    >
                      <Text
                        variant="caption"
                        style={{ color: active ? color.onPrimary : color.textMuted }}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {showDatePicker && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleDateChange}
            />
          )}

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.sm }}>
              {submitError}
            </Text>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Pressable style={styles.footerIcon} accessibilityLabel="Take photo">
              <Ionicons name="camera-outline" size={22} color={color.primary} />
            </Pressable>
            <View style={styles.footerDivider} />
            <Pressable style={styles.footerIcon} accessibilityLabel="Upload file">
              <Ionicons name="cloud-upload-outline" size={22} color={color.primary} />
            </Pressable>
          </View>
          <View style={styles.footerSave}>
            <Button
              label="Save"
              onPress={handleSubmit(onSubmit)}
              loading={isSubmitting}
              disabled={!isValid || !orgId}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── Party Picker Modal ── */}
      <Modal
        visible={showPartyPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPartyPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPartyPicker(false)}
        >
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
            Select Party
          </Text>

          {/* Search */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={color.textMuted} />
            <TextInput
              placeholder="Search party name..."
              placeholderTextColor={color.textFaint}
              value={partySearch}
              onChangeText={setPartySearch}
              style={styles.searchInput}
              autoFocus
            />
          </View>

          {/* Sectioned party list */}
          <SectionList
            sections={partySections}
            keyExtractor={(p) => p.id}
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Text variant="caption" color="textMuted">{title.toUpperCase()}</Text>
              </View>
            )}
            renderItem={({ item }) => {
              const typeLabel = item.partyType ? getPartyTypeLabel(item.partyType) : null;
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
                    <View style={styles.partyRowTop}>
                      <Text variant="body" color="text" numberOfLines={1} style={styles.flex}>
                        {item.name}
                      </Text>
                      {typeLabel && (
                        <View style={styles.partyTypeTag}>
                          <Text variant="caption" color="primary">{typeLabel}</Text>
                        </View>
                      )}
                    </View>
                    {item.phone ? (
                      <Text variant="meta" color="textMuted">{item.phone}</Text>
                    ) : null}
                  </View>
                  {selectedPartyName === item.name && (
                    <Ionicons name="checkmark-circle" size={20} color={color.primary} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text variant="meta" color="textMuted">
                  {partySearch ? 'No matching parties' : 'No parties added yet'}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            style={styles.modalList}
          />

          {/* Bottom actions: Add from Contact + Manual entry */}
          <View style={styles.partyActions}>
            <Pressable onPress={pickContactAndAdd} style={styles.partyActionBtn}>
              <Ionicons name="person-add-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">Add from Contact</Text>
            </Pressable>

            <View style={styles.partyActionDivider} />

            <Pressable
              onPress={() => {
                const name = partySearch.trim();
                if (!name) {
                  Alert.alert('Party name required', 'Type the party name in the search box first.');
                  return;
                }
                setNewPartyName(name);
                setNewPartyPhone('');
                setShowPartyPicker(false);
                setPartySearch('');
                setShowNewPartyType(true);
              }}
              style={styles.partyActionBtn}
            >
              <Ionicons name="create-outline" size={18} color={color.primary} />
              <Text variant="metaStrong" color="primary">
                {partySearch.trim()
                  ? `Add "${partySearch.trim()}"`
                  : 'Enter manually'}
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
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowNewPartyType(false)}
        >
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
            <View style={styles.creatingOverlay}>
              <Text variant="meta" color="textMuted">Creating party...</Text>
            </View>
          )}
        </View>
      </Modal>

      {/* ── Category Picker Modal ── */}
      <Modal
        visible={showCategoryPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCategoryPicker(false)}
        >
          <View />
        </Pressable>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text variant="bodyStrong" color="text" style={styles.modalTitle}>
            Cost Code
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalList}>
            {TRANSACTION_CATEGORIES.map((c) => {
              const active = selectedCategory === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => {
                    setValue('category', active ? '' : c.key);
                    setShowCategoryPicker(false);
                  }}
                  style={({ pressed }) => [
                    styles.categoryOption,
                    active && styles.categoryOptionActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="body"
                    color={active ? 'primary' : 'text'}
                    style={active ? { fontWeight: '600' } : undefined}
                  >
                    {c.label}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={20} color={color.primary} />
                  )}
                </Pressable>
              );
            })}
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
    paddingTop: 2,
    paddingBottom: 8,
    backgroundColor: color.bgGrouped,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navEyebrow: { letterSpacing: 1.2 },
  navTitle: { textAlign: 'center' },

  // Hero
  hero: {
    paddingHorizontal: screenInset,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },
  heroLabel: {
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  heroAmountInput: {
    flex: 1,
    fontSize: 34,
    fontWeight: '700',
    color: color.text,
    paddingVertical: 0,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.none,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },

  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: 12,
    paddingBottom: space.xl,
    backgroundColor: color.bgGrouped,
  },

  // Party selector
  partySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.bg,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 50,
    marginBottom: space.sm,
  },

  // Section label
  sectionLabel: {
    marginTop: space.md,
    marginBottom: space.xs,
  },

  // Payment method
  methodRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.sm,
  },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: space.sm,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  methodChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },

  // Status
  statusChip: {
    flex: 1,
    paddingVertical: space.xs,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  statusChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },

  // Dropdown
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.bg,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 48,
    marginBottom: space.sm,
  },

  // More detail
  moreDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    marginTop: space.xs,
  },
  moreDetailContent: {
    paddingBottom: space.sm,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bgGrouped,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    gap: space.sm,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  footerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.none,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerDivider: {
    width: 1,
    height: 24,
    backgroundColor: color.separator,
  },
  footerSave: {
    flex: 1,
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

  // Search
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

  // Section header
  sectionHeader: {
    paddingVertical: space.xs,
    paddingHorizontal: space.xxs,
    backgroundColor: color.bgGrouped,
    borderRadius: radius.xs,
    marginTop: space.xs,
    marginBottom: space.xxs,
  },

  // Party option
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
  partyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  partyTypeTag: {
    paddingHorizontal: space.xs,
    paddingVertical: 1,
    borderRadius: radius.xs,
    backgroundColor: color.primarySoft,
  },
  emptyList: {
    paddingVertical: space.xxl,
    alignItems: 'center',
  },

  // Party actions at bottom
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

  // Category option
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  categoryOptionActive: {
    backgroundColor: color.primarySoft,
    borderRadius: radius.sm,
  },

  // New party type picker
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
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.bgGrouped,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatingOverlay: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
});
