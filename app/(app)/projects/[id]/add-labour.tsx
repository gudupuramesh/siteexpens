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
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useGuardedRoute } from '@/src/features/org/useGuardedRoute';
import { Controller, useForm } from 'react-hook-form';
import { useCallback, useState } from 'react';
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
import { useParties } from '@/src/features/parties/useParties';
import { consumeNewPartyOutbox } from '@/src/features/parties/newPartyOutbox';
import {
  getPartyTypeLabel,
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

  // After the user picks (or creates) a party in /select-party + /add-party,
  // the resulting party id+name lands in `newPartyOutbox`. Drain it on
  // focus and auto-fill the worker fields. We also try to derive the
  // job-detail "role" placeholder from the party's partyType so the
  // user doesn't have to retype it.
  useFocusEffect(
    useCallback(() => {
      const next = consumeNewPartyOutbox();
      if (!next) return;
      setValue('name', next.name, { shouldValidate: true });
      setValue('partyId', next.id);
      const matched = orgParties.find((p) => p.id === next.id);
      if (matched) {
        const type = (matched.partyType ?? matched.role) as string;
        if (type) {
          setValue('role', getPartyTypeLabel(type as PartyType), {
            shouldValidate: true,
          });
        }
      }
    }, [orgParties, setValue]),
  );

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
              onPress={() => router.push('/(app)/select-party' as never)}
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

