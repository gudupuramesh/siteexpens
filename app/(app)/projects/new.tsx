/**
 * Create Project — simple form (v2 design).
 *
 * Layout (top → bottom):
 *   1. SheetHeader: Cancel · "New project" · Create
 *   2. KeyboardAvoidingView + ScrollView
 *      a. FormGroup "Details"  — Name + Project address
 *      b. FormGroup "Timeline" — Start date + End date
 *      c. FormGroup "Budget"   — Project value
 *
 * That's it. Status defaults to 'active' and progress defaults to 0;
 * everything else (cover photo, client, location, typology, sub-type,
 * team size) is moved to Edit Project — a fresh project starts lean
 * so the user can punch in the essentials and continue.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createProject, PlanLimitError } from '@/src/features/projects/projects';
import { usePaywall } from '@/src/features/billing/usePaywall';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { SubmitProgressOverlay } from '@/src/ui/SubmitProgressOverlay';
import { useThemeV2 } from '@/src/theme/v2';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    siteAddress: z.string().trim().min(3, 'Enter a project address'),
    startDate: z.date(),
    endDate: z.date().nullable(),
    value: z.string().trim().regex(/^\d+$/, 'Enter a number'),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

type FormValues = z.input<typeof schema>;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatPickerDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function NewProjectScreen() {
  // Belt-and-braces route guard. UI hides the projects-list FAB for
  // roles without `project.create`, but a deep link / stale nav
  // stack could still land here — bounce them home.
  useGuardedRoute({ capability: 'project.create' });

  const t = useThemeV2();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? null;
  const { openPaywall } = usePaywall();

  const initialStartDate = useMemo(() => startOfLocalDay(new Date()), []);

  const [submitError, setSubmitError] = useState<string>();
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);
  const [savePhase, setSavePhase] = useState<string>();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      siteAddress: '',
      startDate: initialStartDate,
      endDate: null,
      value: '',
    },
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');

  // If the user moves the start date forward past the existing end date,
  // wipe it so they're forced to re-pick a sensible value.
  useEffect(() => {
    const curEnd = getValues('endDate');
    if (!curEnd) return;
    const minTs = Math.max(
      startOfLocalDay(startDate).getTime(),
      startOfLocalDay(new Date()).getTime(),
    );
    if (startOfLocalDay(curEnd).getTime() < minTs) {
      setValue('endDate', null, { shouldValidate: true });
    }
  }, [startDate, getValues, setValue]);

  async function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    if (!user || !orgId) {
      setSubmitError('You need to be signed in with an organization.');
      return;
    }

    try {
      setSavePhase('Saving project…');
      const id = await createProject({
        uid: user.uid,
        orgId,
        name: values.name.trim(),
        startDate: values.startDate,
        endDate: values.endDate,
        siteAddress: values.siteAddress.trim(),
        value: parseInt(values.value, 10),
        photoUri: null,
        // Sensible defaults — every other field is editable later via
        // Edit Project once the project exists.
        status: 'active',
        progress: 0,
      });
      router.replace(`/(app)/projects/${id}` as never);
    } catch (err) {
      if (err instanceof PlanLimitError) {
        openPaywall({ reason: 'plan_limit_projects' });
        setSavePhase(undefined);
        return;
      }
      setSubmitError((err as Error).message);
    } finally {
      setSavePhase(undefined);
    }
  }

  // Date picker — keep the picked value within bounds (today / startDate).
  const todayStart = startOfLocalDay(new Date());
  const handoverMinimum = new Date(
    Math.max(startOfLocalDay(startDate).getTime(), todayStart.getTime()),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="New project"
        cancelLabel="Cancel"
        saveLabel="Create"
        saveLoading={isSubmitting}
        saveDisabled={!orgId}
        onCancel={() => router.back()}
        onSave={() => void handleSubmit(onSubmit)()}
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
          {/* Details */}
          <FormGroup header="Details">
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Project name"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Sharma Residence"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="siteAddress"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Address"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Plot, street, area, city"
                  autoCapitalize="sentences"
                  multiline
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {(errors.name?.message || errors.siteAddress?.message) ? (
            <FieldError
              text={errors.name?.message ?? errors.siteAddress?.message ?? ''}
            />
          ) : null}

          {/* Timeline */}
          <FormGroup header="Timeline">
            <Row
              label="Start date"
              value={formatPickerDate(startDate)}
              chevron
              onPress={() => setDatePicker('start')}
            />
            <Row
              label="End date"
              value={endDate ? formatPickerDate(endDate) : 'Optional'}
              valueColor={endDate ? undefined : t.colors.tertiary}
              chevron
              onPress={() => setDatePicker('end')}
              divider={false}
            />
          </FormGroup>
          {errors.endDate?.message ? (
            <FieldError text={errors.endDate.message} />
          ) : null}

          {/* Budget */}
          <FormGroup header="Budget">
            <Controller
              control={control}
              name="value"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Project value"
                  value={value}
                  onChangeText={(txt) => onChange(txt.replace(/\D/g, ''))}
                  onBlur={onBlur}
                  placeholder="₹0"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  divider={false}
                />
              )}
            />
          </FormGroup>
          {errors.value?.message ? (
            <FieldError text={errors.value.message} />
          ) : null}

          {submitError ? (
            <FieldError text={submitError} />
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date pickers — bottom sheet with Done button */}
      <DateTimeSheet
        open={datePicker === 'start'}
        value={startDate}
        onChange={(d) => {
          const n = startOfLocalDay(d);
          setValue(
            'startDate',
            new Date(Math.max(n.getTime(), todayStart.getTime())),
            { shouldValidate: true },
          );
        }}
        onClose={() => setDatePicker(null)}
        mode="date"
        title="Start date"
      />
      <DateTimeSheet
        open={datePicker === 'end'}
        value={endDate ?? handoverMinimum}
        onChange={(d) => {
          const n = startOfLocalDay(d);
          setValue(
            'endDate',
            new Date(Math.max(n.getTime(), handoverMinimum.getTime())),
            { shouldValidate: true },
          );
        }}
        onClose={() => setDatePicker(null)}
        mode="date"
        title="End date"
      />

      <SubmitProgressOverlay
        visible={isSubmitting}
        intent="createProject"
        phaseLabel={savePhase}
      />
    </View>
  );
}

function FieldError({ text }: { text: string }) {
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

const styles = StyleSheet.create({
  scroll: { paddingBottom: 60 },
});
