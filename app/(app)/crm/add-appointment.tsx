/**
 * Create or edit a CRM appointment — v2 design.
 *
 * Layout (top → bottom):
 *   1. SheetHeader: Cancel · "New appointment" / "Edit appointment" · Save
 *   2. ScrollView wrapped in KeyboardAvoidingView so the keyboard NEVER
 *      overlaps the focused input.
 *      a. Big editable title (the appointment title — most important field)
 *      b. Type pill row (Site visit / Office / Virtual / Other)
 *      c. Status pill row (Scheduled / Completed / Cancelled / No show)
 *      d. FormGroup "Client" — Name · Phone · Address
 *      e. FormGroup "Schedule" — Scheduled at (DateTimeSheet with Done) · Duration · Location
 *      f. FormGroup "Team" — Attendees (member picker)
 *      g. FormGroup "Notes" — Notes · Outcome (only when status is completed/cancelled/no_show)
 *
 * Date picker uses v2 `<DateTimeSheet>` which has a proper **Done** button
 * in a bottom-sheet header. Type and Status are inline segmented pills so
 * the most-changed fields stay visible.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/src/features/auth/useAuth';
import { createAppointment, updateAppointment } from '@/src/features/crm/appointments';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  type AppointmentStatus,
  type AppointmentType,
} from '@/src/features/crm/types';
import { useAppointment } from '@/src/features/crm/useAppointments';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { OrgMemberPickerModal } from '@/src/ui/OrgMemberPickerModal';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { DateTimeSheet } from '@/src/ui/v2/DateTimeSheet';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

import { z } from 'zod';

const typeKeys = APPOINTMENT_TYPES.map((tt) => tt.key) as [
  AppointmentType,
  ...AppointmentType[],
];
const statusKeys = APPOINTMENT_STATUSES.map((s) => s.key) as [
  AppointmentStatus,
  ...AppointmentStatus[],
];

const schema = z.object({
  clientName: z.string().optional(),
  clientPhone: z.string().optional(),
  clientAddress: z.string().optional(),
  title: z.string().trim().min(1, 'Title required'),
  type: z.enum(typeKeys),
  status: z.enum(statusKeys),
  durationMins: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function fmtDateTime(d: Date | null): string | undefined {
  if (!d) return undefined;
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Tone for the type picker pill (active state) ──
// Type is purely categorical, so the active chip uses the standard "selected"
// blue across all types. Inactive chips render in fill3 (handled at the call
// site).
function typeTone(t: ReturnType<typeof useThemeV2>, _k: AppointmentType) {
  return { fg: t.palette.blue.base, bg: t.palette.blue.soft };
}

// ── Tone for the status picker pill (active state) ──
// Status carries semantic weight, so the active chip earns colour:
//   scheduled → blue   (default / pending — matches the standard active state)
//   completed → green  (success outcome)
//   cancelled → red    (didn't happen)
//   no_show   → red    (problem outcome — yellow isn't in our 4-colour palette)
function statusTone(t: ReturnType<typeof useThemeV2>, k: AppointmentStatus) {
  switch (k) {
    case 'scheduled': return { fg: t.palette.blue.base,  bg: t.palette.blue.soft };
    case 'completed': return { fg: t.palette.green.base, bg: t.palette.green.soft };
    case 'cancelled':
    case 'no_show':   return { fg: t.palette.red.base,   bg: t.palette.red.soft };
  }
}

export default function AddAppointmentScreen() {
  const t = useThemeV2();
  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string }>();
  const isEdit = !!appointmentId;
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: existing, loading: apptLoading } = useAppointment(
    isEdit ? appointmentId : undefined,
  );
  const { members } = useOrgMembers(orgId || undefined);

  // Picker visibility + extra state
  const [scheduledAt, setScheduledAt] = useState<Date>(new Date());
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientName: '',
      clientPhone: '',
      clientAddress: '',
      title: '',
      type: 'site_visit',
      status: 'scheduled',
      durationMins: '',
      location: '',
      notes: '',
      outcome: '',
    },
  });

  // Hydrate when editing
  useEffect(() => {
    if (!existing || !isEdit) return;
    reset({
      clientName: existing.clientName ?? '',
      clientPhone: existing.clientPhone ?? '',
      clientAddress: existing.clientAddress ?? '',
      title: existing.title,
      type: existing.type,
      status: existing.status,
      durationMins:
        existing.durationMins !== undefined ? String(existing.durationMins) : '',
      location: existing.location ?? '',
      notes: existing.notes ?? '',
      outcome: existing.outcome ?? '',
    });
    if (existing.scheduledAt) setScheduledAt(existing.scheduledAt.toDate());
    setAttendeeIds(existing.attendees ?? []);
  }, [existing, isEdit, reset]);

  // Live values
  const watchedType = watch('type');
  const watchedStatus = watch('status');

  // Attendees label for the row
  const attendeeLabel = useMemo(() => {
    if (attendeeIds.length === 0) return undefined;
    const first = members.find((m) => m.uid === attendeeIds[0])?.displayName ?? attendeeIds[0];
    if (attendeeIds.length === 1) return first;
    return `${first} +${attendeeIds.length - 1}`;
  }, [attendeeIds, members]);

  // Outcome only makes sense after the meeting happened
  const showOutcome =
    watchedStatus === 'completed' || watchedStatus === 'cancelled' || watchedStatus === 'no_show';

  const onSave = handleSubmit(async (values) => {
    if (!user || !orgId) {
      setSubmitError('Not signed in');
      return;
    }
    setSubmitError(undefined);
    const dur = values.durationMins?.trim()
      ? parseInt(values.durationMins, 10)
      : undefined;
    if (values.durationMins?.trim() && Number.isNaN(dur)) {
      setSubmitError('Duration must be a number (minutes)');
      return;
    }

    try {
      if (isEdit && appointmentId) {
        await updateAppointment(appointmentId, {
          clientName: values.clientName?.trim() ? values.clientName.trim() : null,
          clientPhone: values.clientPhone?.trim() ? values.clientPhone.trim() : null,
          clientAddress: values.clientAddress?.trim() ? values.clientAddress.trim() : null,
          title: values.title,
          type: values.type,
          status: values.status,
          scheduledAt,
          durationMins: dur !== undefined && !Number.isNaN(dur) ? dur : null,
          location: values.location?.trim() ? values.location.trim() : null,
          notes: values.notes?.trim() ? values.notes.trim() : null,
          outcome: values.outcome?.trim() ? values.outcome.trim() : null,
          leadId: null,
          attendees: attendeeIds.length ? attendeeIds : null,
        });
        router.replace(`/(app)/crm/appointment/${appointmentId}` as never);
      } else {
        const id = await createAppointment({
          orgId,
          title: values.title,
          type: values.type,
          scheduledAt,
          status: values.status,
          createdBy: user.uid,
          clientName: values.clientName?.trim() || undefined,
          clientPhone: values.clientPhone?.trim() || undefined,
          clientAddress: values.clientAddress?.trim() || undefined,
          durationMins: dur !== undefined && !Number.isNaN(dur) ? dur : undefined,
          location: values.location?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
          outcome: values.outcome?.trim() || undefined,
          attendees: attendeeIds.length ? attendeeIds : undefined,
        });
        router.replace(`/(app)/crm/appointment/${id}` as never);
      }
    } catch (e) {
      console.warn(e);
      setSubmitError('Could not save appointment');
    }
  });

  // Loading / not-found shells (edit flow)
  if (isEdit && apptLoading && !existing) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit appointment"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Loading…</Text>
        </View>
      </View>
    );
  }
  if (isEdit && !existing && !apptLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <SheetHeader
          title="Edit appointment"
          onCancel={() => router.back()}
          onSave={() => undefined}
          saveDisabled
        />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Appointment not found</Text>
          <Pressable onPress={() => router.back()} hitSlop={6} style={{ marginTop: 12 }}>
            <Text variant="footnote" style={{ color: t.palette.blue.base, fontWeight: '600' }}>
              Back
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <AmbientBackground />

      {/* Top: Cancel · Title · Save */}
      <SheetHeader
        title={isEdit ? 'Edit appointment' : 'New appointment'}
        cancelLabel="Cancel"
        saveLabel={isEdit ? 'Save' : 'Create'}
        saveLoading={isSubmitting}
        onCancel={() => router.back()}
        onSave={() => void onSave()}
      />

      {/*
        KeyboardAvoidingView + ScrollView keeps the focused input above
        the keyboard. iOS uses 'padding' so the layout shrinks under the
        keyboard; Android relies on app.json's adjustResize.
      */}
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
          {/* Big editable title */}
          <View style={styles.titleBlock}>
            <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.5 }}>
              TITLE
            </Text>
            <Controller
              control={control}
              name="title"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Site visit at ABC"
                  placeholderTextColor={t.colors.tertiary}
                  autoCapitalize="sentences"
                  style={[
                    styles.bigTitle,
                    {
                      color: t.colors.label,
                      ...t.type.title1,
                    },
                  ]}
                  returnKeyType="next"
                />
              )}
            />
            {errors.title?.message ? (
              <Text variant="caption2" style={{ color: t.palette.red.base, marginTop: 4 }}>
                {errors.title.message}
              </Text>
            ) : null}
          </View>

          {/* Type pill row */}
          <View style={styles.pillBlock}>
            <Text
              variant="caption2"
              color="tertiary"
              style={[styles.pillBlockLabel, { letterSpacing: 0.5 }]}
            >
              TYPE
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {APPOINTMENT_TYPES.map((tp) => {
                const sel = watchedType === tp.key;
                const tone = typeTone(t, tp.key);
                return (
                  <Pressable
                    key={tp.key}
                    onPress={() => setValue('type', tp.key, { shouldDirty: true })}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.pillChip,
                      {
                        backgroundColor: sel ? tone.bg : t.colors.fill3,
                        borderRadius: t.radii.pill,
                        borderColor: sel ? tone.fg : 'transparent',
                        borderWidth: sel ? 1 : 0,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View
                      style={[
                        styles.pillDot,
                        { backgroundColor: sel ? tone.fg : t.colors.tertiary },
                      ]}
                    />
                    <Text
                      variant="footnote"
                      style={{
                        color: sel ? tone.fg : t.colors.secondary,
                        fontWeight: sel ? '700' : '500',
                        marginLeft: 5,
                      }}
                    >
                      {tp.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Status pill row */}
          <View style={[styles.pillBlock, { marginTop: 14 }]}>
            <Text
              variant="caption2"
              color="tertiary"
              style={[styles.pillBlockLabel, { letterSpacing: 0.5 }]}
            >
              STATUS
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {APPOINTMENT_STATUSES.map((st) => {
                const sel = watchedStatus === st.key;
                const tone = statusTone(t, st.key);
                return (
                  <Pressable
                    key={st.key}
                    onPress={() => setValue('status', st.key, { shouldDirty: true })}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.pillChip,
                      {
                        backgroundColor: sel ? tone.bg : t.colors.fill3,
                        borderRadius: t.radii.pill,
                        borderColor: sel ? tone.fg : 'transparent',
                        borderWidth: sel ? 1 : 0,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View
                      style={[
                        styles.pillDot,
                        { backgroundColor: sel ? tone.fg : t.colors.tertiary },
                      ]}
                    />
                    <Text
                      variant="footnote"
                      style={{
                        color: sel ? tone.fg : t.colors.secondary,
                        fontWeight: sel ? '700' : '500',
                        marginLeft: 5,
                      }}
                    >
                      {st.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Client */}
          <FormGroup header="Client">
            <Controller
              control={control}
              name="clientName"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Name"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Who you are meeting"
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="clientPhone"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Phone"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="phone-pad"
                  placeholder="+91 9876543210"
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {/* Schedule — DateTimeSheet has the Done button */}
          <FormGroup header="Schedule">
            <Row
              label="Scheduled at"
              value={fmtDateTime(scheduledAt)}
              chevron
              onPress={() => setShowSchedulePicker(true)}
            />
            <Controller
              control={control}
              name="durationMins"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Duration"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  placeholder="Minutes"
                  autoCapitalize="none"
                />
              )}
            />
            <Controller
              control={control}
              name="location"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Location"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Office, site, or map link"
                  autoCapitalize="sentences"
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {/* Team */}
          <FormGroup header="Team">
            <Row
              label="Attendees"
              value={attendeeLabel ?? 'None'}
              chevron
              onPress={() => setShowMemberPicker(true)}
            />
            {attendeeIds.length > 0 ? (
              <Row
                label="Clear attendees"
                valueColor={t.palette.red.base}
                value={`${attendeeIds.length} selected`}
                onPress={() => setAttendeeIds([])}
                divider={false}
              />
            ) : (
              <Row
                label="No attendees added"
                value=""
                divider={false}
              />
            )}
          </FormGroup>

          {/* Notes */}
          <FormGroup header="Notes">
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Notes"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Context and discussion notes"
                  multiline
                  divider={showOutcome}
                />
              )}
            />
            {showOutcome ? (
              <Controller
                control={control}
                name="outcome"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Outcome"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Result after meeting"
                    multiline
                    divider={false}
                  />
                )}
              />
            ) : null}
          </FormGroup>

          {submitError ? (
            <Text
              variant="caption2"
              style={{
                color: t.palette.red.base,
                paddingHorizontal: 32,
                marginTop: 12,
              }}
            >
              {submitError}
            </Text>
          ) : null}

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date picker — bottom sheet with Done button */}
      <DateTimeSheet
        open={showSchedulePicker}
        value={scheduledAt}
        onChange={setScheduledAt}
        onClose={() => setShowSchedulePicker(false)}
        title="Scheduled at"
      />

      {/* Member picker (existing modal — kept) */}
      <OrgMemberPickerModal
        visible={showMemberPicker}
        orgId={orgId}
        onClose={() => setShowMemberPicker(false)}
        onPick={(uid) => {
          if (!uid) return;
          setAttendeeIds((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
          setShowMemberPicker(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingTop: 8,
    paddingBottom: 40,
  },

  // Big editable title
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
  },
  bigTitle: {
    paddingTop: 4,
    paddingBottom: 0,
    margin: 0,
    fontWeight: '700',
  },

  // Type / Status pill rows
  pillBlock: {
    paddingTop: 18,
    paddingBottom: 4,
  },
  pillBlockLabel: {
    paddingHorizontal: 32,
    paddingBottom: 8,
  },
  pillRow: {
    paddingHorizontal: 16,
    gap: 7,
  },
  pillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
