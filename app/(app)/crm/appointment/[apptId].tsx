/**
 * Appointment detail / preview — v2 design.
 *
 * Layout (top → bottom):
 *   1. Top bar — ‹ Back · "Appointment" · Edit
 *   2. Hero card — type-tinted icon tile + title, hairline divider,
 *      status pill row with "Change" link
 *   3. Inline past-due banner (only when scheduled but the time has passed)
 *   4. Quick actions — Call · Directions · Status (3 tinted buttons)
 *   5. FormGroup "When" — Date/time · Duration · Meeting location
 *   6. FormGroup "Client" — Name · Phone · Address
 *   7. FormGroup "Team" — Attendees
 *   8. FormGroup "Notes" / "Outcome" (conditional)
 *   9. Destructive "Delete appointment" button at the bottom
 *
 * Status picker uses v2 `<SelectSheet>`. Delete uses native `Alert.alert`
 * (iOS-native destructive confirmation).
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteAppointment, updateAppointment } from '@/src/features/crm/appointments';
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
  type AppointmentType,
  getAppointmentStatusLabel,
  getAppointmentTypeLabel,
} from '@/src/features/crm/types';
import { useAppointment } from '@/src/features/crm/useAppointments';
import { useOrgMembers } from '@/src/features/org/useOrgMembers';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { SelectSheet } from '@/src/ui/v2/SelectSheet';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

// ── Helpers ────────────────────────────────────────────────────────

function fmtDateTime(raw?: Date | null): string {
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

const TYPE_ICONS: Record<AppointmentType, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  site_visit: 'location-outline',
  office_meeting: 'briefcase-outline',
  virtual_call: 'videocam-outline',
  other: 'calendar-outline',
};

// Type tile + label — neutral. Appointment type (site_visit / office_meeting
// / virtual_call / other) is purely categorical, so it inherits the neutral
// tone (fill3 + secondary) per the app-wide colour discipline. Mirrors the
// AppointmentCard list row so list and detail read consistently.
function typeTone(t: ReturnType<typeof useThemeV2>, _k: AppointmentType) {
  return { fg: t.colors.secondary, bg: t.colors.fill3 };
}

// Status pill — only outcomes that carry semantic weight stay coloured:
// 90/10 discipline: only the problem outcomes (cancelled / no_show) keep
// red. Completed and scheduled both go neutral — the label tells the
// reader; past-due gets its own dedicated red banner.
function statusTone(t: ReturnType<typeof useThemeV2>, k: AppointmentStatus) {
  switch (k) {
    case 'cancelled':
    case 'no_show':   return { fg: t.palette.red.base,   bg: t.palette.red.soft };
    case 'completed':
    case 'scheduled': return { fg: t.colors.secondary,  bg: t.colors.fill3 };
  }
}

// ── Screen ──────────────────────────────────────────────────────────

export default function AppointmentDetailScreen() {
  const t = useThemeV2();
  const { apptId } = useLocalSearchParams<{ apptId: string }>();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? undefined;
  const { data: appt, loading } = useAppointment(apptId);
  const { members } = useOrgMembers(orgId);

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusOptions = useMemo(
    () => APPOINTMENT_STATUSES.map((s) => ({ key: s.key, label: s.label })),
    [],
  );

  async function setStatus(status: string) {
    if (!appt) return;
    try {
      await updateAppointment(appt.id, { status: status as AppointmentStatus });
    } catch (e) {
      console.warn(e);
    }
  }

  const onDelete = () => {
    if (!appt) return;
    Alert.alert(
      'Delete appointment?',
      `This will permanently remove "${appt.title}". This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await deleteAppointment(appt.id);
              router.back();
            } catch (e) {
              console.warn(e);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const openCall = () => {
    const phone = appt?.clientPhone;
    if (!phone) return;
    void Linking.openURL(`tel:${digitsForPhone(phone)}`);
  };

  const openMap = () => {
    const query = appt?.location || appt?.clientAddress;
    if (!query) return;
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    );
  };

  const attendeeNames = useMemo(
    () =>
      appt?.attendees?.map(
        (id) => members.find((m) => m.uid === id)?.displayName ?? id,
      ) ?? [],
    [appt?.attendees, members],
  );

  // Loading / not-found shells
  if (loading && !appt) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <TopBar title="Appointment" rightLabel="" onBack={() => router.back()} />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Loading…</Text>
        </View>
      </View>
    );
  }
  if (!appt) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <TopBar title="Appointment" rightLabel="" onBack={() => router.back()} />
        <View style={styles.centered}>
          <Text variant="body" color="secondary">Appointment not found</Text>
        </View>
      </View>
    );
  }

  const stTone = statusTone(t, appt.status);
  const tyTone = typeTone(t, appt.type);
  const typeIcon = TYPE_ICONS[appt.type];

  // Past-due check (only for scheduled)
  const scheduledDate = appt.scheduledAt?.toDate();
  const isPastDue =
    appt.status === 'scheduled'
    && scheduledDate !== undefined
    && scheduledDate.getTime() < Date.now();

  // Phone availability
  const hasPhone = !!appt.clientPhone;
  const hasMapTarget = !!(appt.location || appt.clientAddress);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />

      <AmbientBackground />

      {/* Top bar — ‹ Back · "Appointment" · Edit */}
      <TopBar
        title="Appointment"
        rightLabel="Edit"
        onBack={() => router.back()}
        onRight={() =>
          router.push(`/(app)/crm/add-appointment?appointmentId=${appt.id}` as never)
        }
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card */}
        <View
          style={[
            styles.hero,
            {
              backgroundColor: t.colors.surface,
              borderRadius: t.radii.card,
              borderColor:
                t.mode === 'dark'
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(0,0,0,0.04)',
              borderWidth: t.hairline,
            },
            t.shadows.resting,
          ]}
        >
          {/* Top row — type-tinted icon + title (with type subline) */}
          <View style={styles.heroRow1}>
            <View style={[styles.typeTile, { backgroundColor: tyTone.bg }]}>
              <Ionicons name={typeIcon} size={20} color={tyTone.fg} />
            </View>

            <View style={styles.heroMeta}>
              <Text
                variant="title3"
                color="label"
                style={{ fontWeight: '700' }}
                numberOfLines={1}
              >
                {appt.title}
              </Text>
              <Text
                variant="footnote"
                color="secondary"
                style={{ marginTop: 2 }}
                numberOfLines={1}
              >
                {getAppointmentTypeLabel(appt.type)}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View
            style={[
              styles.heroDivider,
              {
                backgroundColor:
                  t.mode === 'dark'
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(0,0,0,0.06)',
              },
            ]}
          />

          {/* Status pill + Change link */}
          <View style={styles.heroStatusRow}>
            <View style={[styles.statusPill, { backgroundColor: stTone.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: stTone.fg }]} />
              <Text
                variant="footnote"
                style={{
                  color: stTone.fg,
                  fontWeight: '700',
                  marginLeft: 6,
                  letterSpacing: 0.1,
                }}
              >
                {getAppointmentStatusLabel(appt.status)}
              </Text>
            </View>
            <Pressable onPress={() => setShowStatusPicker(true)} hitSlop={8}>
              <Text variant="footnote" style={{ color: t.palette.blue.base, fontWeight: '600' }}>
                Change
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Past-due banner */}
        {isPastDue ? (
          <View
            style={[
              styles.pastDueBanner,
              {
                backgroundColor: t.palette.red.soft,
                borderRadius: t.radii.field,
                borderColor: t.palette.red.base + '40',
                borderWidth: t.hairline,
              },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={t.palette.red.base} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text variant="footnote" style={{ color: t.palette.red.base, fontWeight: '700' }}>
                Past due
              </Text>
              <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
                The scheduled time has passed. Mark it Completed or Cancelled.
              </Text>
            </View>
            <Pressable onPress={() => setShowStatusPicker(true)} hitSlop={6}>
              <Text variant="footnote" style={{ color: t.palette.red.base, fontWeight: '700' }}>
                Update
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Quick actions — Call · Directions · Status */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon="call"
            label="Call"
            tint={t.palette.blue.base}
            tintBg={t.palette.blue.soft}
            disabled={!hasPhone}
            onPress={openCall}
          />
          <ActionButton
            icon="navigate"
            label="Directions"
            tint={t.palette.blue.base}
            tintBg={t.palette.blue.soft}
            disabled={!hasMapTarget}
            onPress={openMap}
          />
          <ActionButton
            icon="flag"
            label="Status"
            tint={t.palette.blue.base}
            tintBg={t.palette.blue.soft}
            onPress={() => setShowStatusPicker(true)}
          />
        </View>

        {/* When */}
        <FormGroup header="When">
          <Row label="Scheduled at" value={fmtDateTime(scheduledDate)} />
          <Row
            label="Duration"
            value={appt.durationMins ? `${appt.durationMins} min` : '—'}
          />
          <Row
            label="Location"
            value={appt.location ?? '—'}
            divider={false}
          />
        </FormGroup>

        {/* Client */}
        <FormGroup header="Client">
          <Row label="Name" value={appt.clientName ?? '—'} />
          <Row label="Phone" value={appt.clientPhone ?? '—'} />
          <Row
            label="Address"
            value={appt.clientAddress ?? '—'}
            divider={false}
          />
        </FormGroup>

        {/* Team */}
        {attendeeNames.length > 0 ? (
          <FormGroup header="Team">
            <Row
              label="Attendees"
              value={attendeeNames.join(', ')}
              divider={false}
            />
          </FormGroup>
        ) : null}

        {/* Notes */}
        {appt.notes ? (
          <FormGroup header="Notes">
            <View style={styles.notePad}>
              <Text variant="body" color="label">
                {appt.notes}
              </Text>
            </View>
          </FormGroup>
        ) : null}

        {/* Outcome */}
        {appt.outcome ? (
          <FormGroup header="Outcome">
            <View style={styles.notePad}>
              <Text variant="body" color="label">
                {appt.outcome}
              </Text>
            </View>
          </FormGroup>
        ) : null}

        {/* Delete — destructive button at the bottom */}
        <View style={styles.dangerWrap}>
          <Pressable
            onPress={onDelete}
            disabled={deleting}
            style={({ pressed }) => [
              styles.dangerBtn,
              {
                backgroundColor:
                  t.mode === 'dark'
                    ? 'rgba(255,69,58,0.12)'
                    : 'rgba(255,59,48,0.08)',
                borderRadius: t.radii.field,
                borderColor:
                  t.mode === 'dark'
                    ? 'rgba(255,69,58,0.3)'
                    : 'rgba(255,59,48,0.25)',
                borderWidth: t.hairline,
              },
              (pressed || deleting) && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="trash-outline" size={16} color={t.palette.red.base} />
            <Text
              variant="body"
              style={{ color: t.palette.red.base, fontWeight: '600', marginLeft: 6 }}
            >
              {deleting ? 'Deleting…' : 'Delete appointment'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Status picker */}
      <SelectSheet
        open={showStatusPicker}
        title="Change status"
        options={statusOptions}
        selected={appt.status}
        onPick={(key) => void setStatus(key)}
        onClose={() => setShowStatusPicker(false)}
      />
    </View>
  );
}

// ── Local helpers ──────────────────────────────────────────────────

function TopBar({
  title,
  rightLabel,
  onBack,
  onRight,
}: {
  title: string;
  rightLabel: string;
  onBack: () => void;
  onRight?: () => void;
}) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        topStyles.bar,
        { paddingTop: insets.top + 6 },
      ]}
    >
      <Pressable onPress={onBack} hitSlop={8} style={topStyles.leftSide}>
        <Ionicons name="chevron-back" size={22} color={t.palette.blue.base} />
        <Text variant="body" style={{ color: t.palette.blue.base, marginLeft: -2 }}>
          Back
        </Text>
      </Pressable>
      <Text variant="headline" color="label" style={topStyles.title} numberOfLines={1}>
        {title}
      </Text>
      <Pressable onPress={onRight} hitSlop={8} style={topStyles.rightSide}>
        {rightLabel ? (
          <Text variant="body" style={{ color: t.palette.blue.base, fontWeight: '600' }}>
            {rightLabel}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  tint,
  tintBg,
  onPress,
  disabled,
}: {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
  tint: string;
  tintBg: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        actStyles.btn,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.card,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
        t.shadows.resting,
        pressed && !disabled && { opacity: 0.85, transform: [{ scale: 0.97 }] },
        disabled && { opacity: 0.45 },
      ]}
    >
      <View style={[actStyles.iconWrap, { backgroundColor: tintBg }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text variant="caption2" color="label" style={{ marginTop: 5, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
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

  // Hero card
  hero: {
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  heroRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  typeTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroMeta: {
    flex: 1,
    minWidth: 0,
  },
  heroDivider: {
    height: 0.5,
    marginVertical: 10,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Past-due banner
  pastDueBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Quick actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 16,
  },

  // Notes / Outcome pads (inside FormGroup)
  notePad: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  // Delete button
  dangerWrap: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  dangerBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
});

const topStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  leftSide: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 36,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 8,
  },
});

const actStyles = StyleSheet.create({
  btn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
