/**
 * Appointment preview — InteriorOS layout.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { deleteAppointment, updateAppointment } from '@/src/features/crm/appointments';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
  getAppointmentStatusLabel,
  getAppointmentTypeLabel,
} from '@/src/features/crm/types';
import { useAppointment } from '@/src/features/crm/useAppointments';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { AlertSheet, Group, PrimaryButton, Row, SecondaryButton, SelectModal } from '@/src/ui/io';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

function fmtDateTime(raw?: Date): string {
  if (!raw) return '—';
  return raw.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function digitsForPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export default function AppointmentDetailScreen() {
  const { apptId } = useLocalSearchParams<{ apptId: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: appt, loading } = useAppointment(apptId);
  const { members } = useOrgMembers(orgId);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  async function performDelete() {
    if (!appt) return;
    try {
      setDeleting(true);
      await deleteAppointment(appt.id);
      router.back();
    } catch (e) {
      console.warn(e);
    } finally {
      setDeleting(false);
    }
  }

  async function setStatus(status: AppointmentStatus) {
    if (!appt) return;
    try {
      await updateAppointment(appt.id, { status });
    } catch (e) {
      console.warn(e);
    }
  }

  function openCall() {
    const phone = appt?.clientPhone;
    if (!phone) return;
    Linking.openURL(`tel:${digitsForPhone(phone)}`);
  }

  function openMap() {
    const query = appt?.location || appt?.clientAddress;
    if (!query) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
  }

  const attendeeNames =
    appt?.attendees?.map((id) => members.find((m) => m.uid === id)?.displayName ?? id) ?? [];

  if (loading && !appt) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body" color="textMuted">
          Loading…
        </Text>
      </Screen>
    );
  }

  if (!appt) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body" color="textMuted">
          Not found
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

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={color.primary} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text variant="caption" color="textMuted">
            CRM
          </Text>
          <Text variant="rowTitle" color="text" numberOfLines={1}>
            Appointment
          </Text>
        </View>
        <Pressable
          onPress={() =>
            router.push(`/(app)/crm/add-appointment?appointmentId=${appt.id}` as never)
          }
          hitSlop={12}
        >
          <Text variant="metaStrong" color="primary">
            Edit
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <Ionicons name="calendar-outline" size={24} color={color.primary} />
            </View>
            <View style={styles.heroMain}>
              <Text variant="title" color="text" numberOfLines={1}>
                {appt.title}
              </Text>
              <Text variant="meta" color="textMuted" numberOfLines={1}>
                {getAppointmentTypeLabel(appt.type)} · {fmtDateTime(appt.scheduledAt?.toDate())}
              </Text>
            </View>
          </View>
          <View style={styles.heroStatusRow}>
            <View style={styles.statusPill}>
              <Text variant="caption" color="primary">
                {getAppointmentStatusLabel(appt.status)}
              </Text>
            </View>
            <Pressable onPress={() => setShowStatusPicker(true)} hitSlop={10}>
              <Text variant="metaStrong" color="primary">
                Change status
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.actions}>
          <SecondaryButton label="Call" icon="call-outline" onPress={openCall} style={styles.actionBtn} />
          <SecondaryButton label="Directions" icon="navigate-outline" onPress={openMap} style={styles.actionBtn} />
        </View>

        <Group header="Details">
          <Row title="Type" meta={getAppointmentTypeLabel(appt.type)} />
          <Row
            title="Status"
            meta={getAppointmentStatusLabel(appt.status)}
            onPress={() => setShowStatusPicker(true)}
            chevron
          />
          <Row title="When" meta={fmtDateTime(appt.scheduledAt?.toDate())} />
          <Row title="Duration" meta={appt.durationMins ? `${appt.durationMins} min` : '—'} />
          <Row title="Meeting location" meta={appt.location ?? '—'} />
          <Row title="Client" meta={appt.clientName ?? '—'} />
          <Row title="Client phone" meta={appt.clientPhone ?? '—'} />
          <Row title="Client address" meta={appt.clientAddress ?? '—'} />
          <Row title="Attendees" meta={attendeeNames.join(', ') || '—'} last />
        </Group>

        {appt.notes ? (
          <Group header="Notes">
            <View style={styles.notePad}>
              <Text variant="body" color="text">
                {appt.notes}
              </Text>
            </View>
          </Group>
        ) : null}

        {appt.outcome ? (
          <Group header="Outcome">
            <View style={styles.notePad}>
              <Text variant="body" color="text">
                {appt.outcome}
              </Text>
            </View>
          </Group>
        ) : null}

        <Group header="Danger zone">
          <Row
            title={deleting ? 'Deleting…' : 'Delete appointment'}
            subtitle="Permanently remove from CRM"
            left={<Ionicons name="trash-outline" size={18} color={color.danger} />}
            onPress={() => setShowDeleteSheet(true)}
            destructive
            last
          />
        </Group>

      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Edit appointment"
          icon="create-outline"
          onPress={() =>
            router.push(`/(app)/crm/add-appointment?appointmentId=${appt.id}` as never)
          }
        />
      </View>

      <SelectModal
        visible={showStatusPicker}
        title="Change status"
        options={APPOINTMENT_STATUSES}
        value={appt.status}
        onClose={() => setShowStatusPicker(false)}
        onPick={(key) => void setStatus(key as AppointmentStatus)}
      />

      <AlertSheet
        visible={showDeleteSheet}
        onClose={() => setShowDeleteSheet(false)}
        tone="danger"
        icon="trash"
        title="Delete appointment?"
        message={`This will permanently remove "${appt.title}". This can't be undone.`}
        actions={[
          { label: 'Cancel', variant: 'default' },
          {
            label: deleting ? 'Deleting…' : 'Delete',
            variant: 'destructive',
            onPress: () => void performDelete(),
          },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  topTitleWrap: { flex: 1, alignItems: 'center' },
  scroll: { paddingTop: space.md, paddingBottom: 96 },

  hero: {
    marginHorizontal: screenInset,
    marginBottom: space.md,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.md,
    gap: space.sm,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
  },
  heroMain: { flex: 1, minWidth: 0 },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.primarySoft,
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: screenInset,
    marginBottom: space.md,
  },
  actionBtn: {
    flex: 1,
  },

  notePad: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: color.surface,
  },
  emptyBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: color.surface,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.xs,
    paddingBottom: space.md,
    backgroundColor: color.bgGrouped,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
  },
});
