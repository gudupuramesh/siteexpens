/**
 * Add Material — v2 design.
 *
 * Layout:
 *   1. SheetHeader: Cancel · "Add material" · Save
 *   2. Category pill row (Request / Received / Used)
 *   3. FormGroup "Material" — Name, Quantity, Unit (SelectSheet)
 *   4. FormGroup "Cost" — Rate per unit · Total (auto)
 *   5. FormGroup "Source" — Supplier · Date (DateTimeSheet)
 *   6. FormGroup "Notes" — multiline
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createMaterial } from '@/src/features/materials/materials';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { formatDate } from '@/src/lib/format';
import { useThemeV2 } from '@/src/theme/v2';

const CAT_OPTIONS = [
  { key: 'request', label: 'Request' },
  { key: 'received', label: 'Received' },
  { key: 'used', label: 'Used' },
] as const;

const UNITS = ['pcs', 'kg', 'bags', 'sqft', 'rft', 'cft', 'litres', 'meters', 'tons', 'sets'];

const schema = z.object({
  name: z.string().trim().min(2, 'Name required'),
  category: z.string().min(1, 'Select category'),
  quantity: z.string().min(1, 'Enter quantity'),
  unit: z.string().min(1, 'Select unit'),
  rate: z.string().min(1, 'Enter rate'),
  supplier: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function AddMaterialScreen() {
  const t = useThemeV2();
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [submitError, setSubmitError] = useState<string>();
  const [date, setDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', category: 'request', quantity: '', unit: '', rate: '', supplier: '', notes: '' },
    mode: 'onChange',
  });

  const selectedCat = watch('category');
  const selectedUnit = watch('unit');
  const qty = watch('quantity');
  const rate = watch('rate');
  const totalCost = (parseFloat(qty) || 0) * (parseFloat(rate) || 0);

  async function onSubmit(data: FormData) {
    if (!user || !orgId || !projectId) return;
    setSubmitError(undefined);
    try {
      await createMaterial({
        orgId,
        projectId,
        name: data.name,
        category: data.category,
        quantity: parseFloat(data.quantity) || 0,
        unit: data.unit,
        rate: parseFloat(data.rate) || 0,
        totalCost,
        supplier: data.supplier ?? '',
        date,
        notes: data.notes ?? '',
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
        title="Add material"
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
          {/* Category pill row */}
          <View style={styles.pillBlock}>
            <Text
              variant="caption2"
              color="tertiary"
              style={{ letterSpacing: 0.5, paddingHorizontal: 32, paddingBottom: 8 }}
            >
              CATEGORY
            </Text>
            <View style={styles.pillRow}>
              {CAT_OPTIONS.map((c) => {
                const active = selectedCat === c.key;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => setValue('category', c.key, { shouldValidate: true })}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.pillChip,
                      {
                        backgroundColor: active
                          ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
                          : t.colors.fill3,
                        borderRadius: 999,
                        borderColor: active ? t.palette.blue.base + '33' : 'transparent',
                        borderWidth: active ? 1 : 0,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      variant="caption2"
                      style={{
                        color: active ? t.palette.blue.base : t.colors.secondary,
                        fontWeight: '700',
                        letterSpacing: 0.4,
                      }}
                    >
                      {c.label.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Material */}
          <FormGroup header="Material">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Cement, Sand, Plywood"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="quantity"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Quantity"
                  value={value}
                  onChangeText={(txt) => onChange(txt.replace(/[^\d.]/g, ''))}
                  onBlur={onBlur}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              )}
            />
            <Row
              label="Unit"
              value={selectedUnit || 'Pick a unit'}
              valueColor={selectedUnit ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setShowUnitPicker(true)}
              divider={false}
            />
          </FormGroup>
          {(errors.name?.message || errors.quantity?.message || errors.unit?.message) ? (
            <FieldNote
              text={errors.name?.message ?? errors.quantity?.message ?? errors.unit?.message ?? ''}
              tone={t.palette.red.base}
            />
          ) : null}

          {/* Cost */}
          <FormGroup
            header="Cost"
            footer={
              totalCost > 0
                ? `Total: ₹${totalCost.toLocaleString('en-IN')}`
                : undefined
            }
          >
            <Controller
              control={control}
              name="rate"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Rate per unit"
                  value={value}
                  onChangeText={(txt) => onChange(txt.replace(/[^\d.]/g, ''))}
                  onBlur={onBlur}
                  placeholder="₹0"
                  keyboardType="decimal-pad"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {errors.rate?.message ? (
            <FieldNote text={errors.rate.message} tone={t.palette.red.base} />
          ) : null}

          {/* Source */}
          <FormGroup header="Source">
            <Controller
              control={control}
              name="supplier"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Supplier"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. ABC Traders"
                  autoCapitalize="words"
                />
              )}
            />
            <Row
              label="Date"
              value={formatDate(date)}
              chevron
              onPress={() => setShowDate(true)}
              divider={false}
            />
          </FormGroup>

          {/* Notes */}
          <FormGroup header="Notes">
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Note"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Additional details"
                  multiline
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {submitError ? (
            <FieldNote text={submitError} tone={t.palette.red.base} />
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <DateTimeSheet
        open={showDate}
        value={date}
        onChange={setDate}
        onClose={() => setShowDate(false)}
        mode="date"
        title="Date"
      />

      <SelectSheet
        open={showUnitPicker}
        title="Unit"
        options={UNITS.map((u) => ({ key: u, label: u }))}
        selected={selectedUnit}
        onPick={(k) => setValue('unit', k, { shouldValidate: true })}
        onClose={() => setShowUnitPicker(false)}
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

const styles = StyleSheet.create({
  scroll: { paddingBottom: 60 },

  pillBlock: { paddingTop: 18 },
  pillRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
  },
  pillChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});
