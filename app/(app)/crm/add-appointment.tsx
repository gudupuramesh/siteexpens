/**
 * Create / edit appointment — InteriorOS layout.
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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

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
import {
  Group,
  InputRow,
  PickerRow,
  PrimaryButton,
  SelectModal,
} from '@/src/ui/io';
import { OrgMemberPickerModal } from '@/src/ui/OrgMemberPickerModal';
import { PlatformDateTimePicker } from '@/src/ui/PlatformDateTimePicker';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, screenInset, space } from '@/src/theme';

const typeKeys = APPOINTMENT_TYPES.map((t) => t.key) as [AppointmentType, ...AppointmentType[]];
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

function fmtDateTime(d: Date): string {
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function AddAppointmentScreen() {
  const { appointmentId } = useLocalSearchParams<{
    appointmentId?: string;
  }>();
  const isEdit = !!appointmentId;
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const { data: existing, loading: apptLoading } = useAppointment(
    isEdit ? appointmentId : undefined,
  );
  const { members } = useOrgMembers(orgId || undefined);

  const [scheduledAt, setScheduledAt] = useState<Date>(new Date());
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
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

  const typeOptions = useMemo(
    () => APPOINTMENT_TYPES.map((t) => ({ key: t.key, label: t.label })),
    [],
  );
  const statusOptions = useMemo(
    () => APPOINTMENT_STATUSES.map((s) => ({ key: s.key, label: s.label })),
    [],
  );

  const attendeeLabels = useMemo(() => {
    return attendeeIds
      .map((id) => members.find((m) => m.uid === id)?.displayName ?? id)
      .join(', ');
  }, [attendeeIds, members]);

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

  if (isEdit && apptLoading && !existing) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body" color="textMuted">
          Loading…
        </Text>
      </Screen>
    );
  }

  if (isEdit && !existing && !apptLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body" color="textMuted">
          Appointment not found
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: space.md }}>
          <Text variant="metaStrong" color="primary">
            Back
          </Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={22} color={color.textMuted} />
          </Pressable>
          <Text variant="rowTitle" color="text">
            {isEdit ? 'Edit appointment' : 'New appointment'}
          </Text>
          <Pressable
            onPress={onSave}
            disabled={isSubmitting}
            hitSlop={8}
            style={({ pressed }) => [
              styles.saveBtn,
              isSubmitting && { opacity: 0.5 },
              pressed && !isSubmitting && { opacity: 0.85 },
            ]}
          >
            <Text variant="metaStrong" style={{ color: color.onPrimary }}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Group header="Appointment">
            <Controller
              control={control}
              name="title"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Title"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Site visit discussion"
                />
              )}
            />
            <Controller
              control={control}
              name="type"
              render={({ field: { value } }) => (
                <PickerRow
                  label="Type"
                  value={typeOptions.find((x) => x.key === value)?.label}
                  placeholder="Select"
                  onPress={() => setShowTypePicker(true)}
                />
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field: { value } }) => (
                <PickerRow
                  label="Status"
                  value={statusOptions.find((x) => x.key === value)?.label}
                  placeholder="Select"
                  onPress={() => setShowStatusPicker(true)}
                  last
                />
              )}
            />
          </Group>
          {errors.title?.message ? (
            <Text variant="caption" color="danger" style={styles.fieldError}>
              {errors.title.message}
            </Text>
          ) : null}

          <Group header="Client">
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
                />
              )}
            />
            <Controller
              control={control}
              name="clientPhone"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Phone"
                  keyboardType="phone-pad"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="+91 …"
                />
              )}
            />
            <Controller
              control={control}
              name="clientAddress"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Address"
                  multiline
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Client / site address"
                  last
                />
              )}
            />
          </Group>

          <Group header="Schedule">
            <PickerRow
              label="Scheduled at"
              value={fmtDateTime(scheduledAt)}
              onPress={() => setShowSchedulePicker(true)}
            />
            <Controller
              control={control}
              name="durationMins"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Duration"
                  keyboardType="number-pad"
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Minutes"
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
                  last
                />
              )}
            />
          </Group>
          <PlatformDateTimePicker
            open={showSchedulePicker}
            value={scheduledAt}
            onChange={setScheduledAt}
            onClose={() => setShowSchedulePicker(false)}
          />
          {Platform.OS === 'ios' && showSchedulePicker ? (
            <Pressable onPress={() => setShowSchedulePicker(false)} style={styles.doneIos}>
              <Text variant="metaStrong" color="primary">
                Done
              </Text>
            </Pressable>
          ) : null}

          <Group header="Team">
            <PickerRow
              label="Attendees"
              value={attendeeIds.length ? attendeeLabels : undefined}
              placeholder="Add team members"
              onPress={() => setShowMemberPicker(true)}
            />
            <PickerRow
              label="Clear attendees"
              value={attendeeIds.length ? `${attendeeIds.length} selected` : 'None'}
              onPress={() => setAttendeeIds([])}
              last
            />
          </Group>

          <Group header="Notes">
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Notes"
                  multiline
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Context and discussion notes"
                />
              )}
            />
            <Controller
              control={control}
              name="outcome"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Outcome"
                  multiline
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Result after meeting"
                  last
                />
              )}
            />
          </Group>

          {submitError ? (
            <Text variant="caption" color="danger" style={styles.fieldError}>
              {submitError}
            </Text>
          ) : null}

          <PrimaryButton
            label={isEdit ? 'Save' : 'Create'}
            onPress={onSave}
            loading={isSubmitting}
            disabled={isSubmitting}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <Controller
        control={control}
        name="type"
        render={({ field: { value, onChange } }) => (
          <SelectModal
            visible={showTypePicker}
            title="Select type"
            options={typeOptions}
            value={value}
            onClose={() => setShowTypePicker(false)}
            onPick={(key) => onChange(key as AppointmentType)}
          />
        )}
      />

      <Controller
        control={control}
        name="status"
        render={({ field: { value, onChange } }) => (
          <SelectModal
            visible={showStatusPicker}
            title="Select status"
            options={statusOptions}
            value={value}
            onClose={() => setShowStatusPicker(false)}
            onPick={(key) => onChange(key as AppointmentStatus)}
          />
        )}
      />

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: color.primary,
  },
  scroll: {
    paddingTop: space.md,
    paddingHorizontal: 0,
    paddingBottom: space.xl * 2,
  },
  fieldError: {
    paddingHorizontal: screenInset,
    marginTop: -16,
    marginBottom: 16,
  },
  doneIos: { alignSelf: 'flex-end', paddingVertical: space.xs },
});
