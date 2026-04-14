/**
 * Add Task form. Title, description, status, dates, quantity, unit, assignee.
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
import { createTask } from '@/src/features/tasks/tasks';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { formatDate } from '@/src/lib/format';
import { color, radius, screenInset, space } from '@/src/theme';

const STATUS_OPTIONS = [
  { key: 'not_started', label: 'Not Started' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
] as const;

const schema = z.object({
  title: z.string().trim().min(2, 'Title required'),
  description: z.string().optional(),
  status: z.string().min(1, 'Select status'),
  quantity: z.string().optional(),
  unit: z.string().optional(),
  assignedTo: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function AddTaskScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [submitError, setSubmitError] = useState<string>();
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '', status: 'not_started', quantity: '', unit: '', assignedTo: '' },
    mode: 'onChange',
  });

  const selectedStatus = watch('status');

  async function onSubmit(data: FormData) {
    if (!user || !orgId || !projectId) return;
    setSubmitError(undefined);
    try {
      await createTask({
        orgId,
        projectId,
        title: data.title,
        description: data.description ?? '',
        status: data.status as any,
        startDate,
        endDate,
        quantity: parseFloat(data.quantity ?? '0') || 0,
        completedQuantity: 0,
        unit: data.unit ?? '',
        assignedTo: data.assignedTo ?? '',
        createdBy: user.uid,
      });
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
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>Add Task</Text>
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
          <Controller
            control={control}
            name="title"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Task Title"
                placeholder="e.g. Install kitchen cabinets"
                autoCapitalize="sentences"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.title?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Description (optional)"
                placeholder="Details about the task"
                multiline
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          {/* Status */}
          <Text variant="caption" color="textMuted" style={styles.label}>STATUS</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((s) => {
              const active = selectedStatus === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setValue('status', s.key, { shouldValidate: true })}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text variant="caption" style={{ color: active ? '#fff' : color.text }}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Dates */}
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text variant="caption" color="textMuted" style={styles.label}>START DATE</Text>
              <Pressable onPress={() => setShowStartDate(true)} style={styles.dateBtn}>
                <Text variant="body" color="text">{formatDate(startDate)}</Text>
              </Pressable>
              {showStartDate && (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => { setShowStartDate(Platform.OS === 'ios'); if (d) setStartDate(d); }}
                />
              )}
            </View>
            <View style={styles.dateField}>
              <Text variant="caption" color="textMuted" style={styles.label}>END DATE</Text>
              <Pressable onPress={() => setShowEndDate(true)} style={styles.dateBtn}>
                <Text variant="body" color="text">{endDate ? formatDate(endDate) : 'Not set'}</Text>
              </Pressable>
              {showEndDate && (
                <DateTimePicker
                  value={endDate ?? new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => { setShowEndDate(Platform.OS === 'ios'); if (d) setEndDate(d); }}
                />
              )}
            </View>
          </View>

          {/* Quantity + Unit */}
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Controller
                control={control}
                name="quantity"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Quantity (optional)"
                    placeholder="e.g. 100"
                    keyboardType="numeric"
                    value={value ?? ''}
                    onChangeText={(t) => onChange(t.replace(/[^\d.]/g, ''))}
                    onBlur={onBlur}
                  />
                )}
              />
            </View>
            <View style={styles.dateField}>
              <Controller
                control={control}
                name="unit"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Unit (optional)"
                    placeholder="e.g. sqft, pcs"
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
            name="assignedTo"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Assigned To (optional)"
                placeholder="e.g. Manoj Carpenter"
                autoCapitalize="words"
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
            label="Create Task"
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
  chipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  dateRow: { flexDirection: 'row', gap: space.sm },
  dateField: { flex: 1 },
  dateBtn: {
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
  },
  footer: {
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
});
