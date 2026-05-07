/**
 * Add Material form. Category + name + quantity + unit + rate + supplier + date.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import DateTimePicker from '@react-native-community/datetimepicker';
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
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createMaterial } from '@/src/features/materials/materials';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { formatDate } from '@/src/lib/format';
import { color, radius, screenInset, space } from '@/src/theme';

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
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [submitError, setSubmitError] = useState<string>();
  const [date, setDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);

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
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>Add Material</Text>
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
          {/* Category */}
          <Text variant="caption" color="textMuted" style={styles.label}>CATEGORY</Text>
          <View style={styles.chipRow}>
            {CAT_OPTIONS.map((c) => {
              const active = selectedCat === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setValue('category', c.key, { shouldValidate: true })}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text variant="caption" style={{ color: active ? '#fff' : color.text }}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Name */}
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Material Name"
                placeholder="e.g. Cement, Sand, Plywood"
                autoCapitalize="words"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
              />
            )}
          />

          {/* Quantity + Unit */}
          <View style={styles.rowFields}>
            <View style={styles.halfField}>
              <Controller
                control={control}
                name="quantity"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Quantity"
                    placeholder="0"
                    keyboardType="numeric"
                    value={value}
                    onChangeText={(t) => onChange(t.replace(/[^\d.]/g, ''))}
                    onBlur={onBlur}
                    error={errors.quantity?.message}
                  />
                )}
              />
            </View>
            <View style={styles.halfField}>
              <Text variant="caption" color="textMuted" style={styles.label}>UNIT</Text>
              <View style={styles.chipRow}>
                {UNITS.slice(0, 5).map((u) => {
                  const active = selectedUnit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setValue('unit', u, { shouldValidate: true })}
                      style={[styles.chipSm, active && styles.chipActive]}
                    >
                      <Text variant="caption" style={{ color: active ? '#fff' : color.text }}>{u}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={[styles.chipRow, { marginTop: 4 }]}>
                {UNITS.slice(5).map((u) => {
                  const active = selectedUnit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setValue('unit', u, { shouldValidate: true })}
                      style={[styles.chipSm, active && styles.chipActive]}
                    >
                      <Text variant="caption" style={{ color: active ? '#fff' : color.text }}>{u}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Rate */}
          <Controller
            control={control}
            name="rate"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Rate per unit (₹)"
                placeholder="0"
                keyboardType="numeric"
                leading={<Text variant="meta" color="textMuted">₹</Text>}
                value={value}
                onChangeText={(t) => onChange(t.replace(/[^\d.]/g, ''))}
                onBlur={onBlur}
                error={errors.rate?.message}
              />
            )}
          />

          {/* Total */}
          {totalCost > 0 && (
            <View style={styles.totalRow}>
              <Text variant="meta" color="textMuted">Total Cost</Text>
              <Text variant="bodyStrong" color="text">₹{totalCost.toLocaleString('en-IN')}</Text>
            </View>
          )}

          {/* Supplier */}
          <Controller
            control={control}
            name="supplier"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Supplier (optional)"
                placeholder="e.g. ABC Traders"
                autoCapitalize="words"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          {/* Date */}
          <Text variant="caption" color="textMuted" style={styles.label}>DATE</Text>
          <Pressable onPress={() => setShowDate(true)} style={styles.dateBtn}>
            <Ionicons name="calendar-outline" size={18} color={color.textMuted} />
            <Text variant="body" color="text">{formatDate(date)}</Text>
          </Pressable>
          {showDate && (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowDate(Platform.OS === 'ios');
                if (d) setDate(d);
              }}
            />
          )}

          {/* Notes */}
          <Controller
            control={control}
            name="notes"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Notes (optional)"
                placeholder="Additional details"
                multiline
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.xs }}>
              {submitError}
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Save Material"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isValid || !orgId}
          />
        </View>
      </KeyboardAvoidingView>
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
  label: { marginTop: space.md, marginBottom: space.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipSm: {
    paddingHorizontal: space.xs,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
  },
  chipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  rowFields: {
    flexDirection: 'row',
    gap: space.sm,
  },
  halfField: { flex: 1 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    backgroundColor: color.primarySoft,
    borderRadius: radius.sm,
    marginTop: space.xs,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  footer: {
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
});
