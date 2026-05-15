/**
 * v2 AppointmentCard — list card for the Appointments sub-tab.
 *
 * Layout mirrors the LeadCard so the CRM list reads as a single
 * vocabulary:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [📍]  Site visit at ABC          [● Site visit]      │
 *   │       Aakash Bansal              [● Scheduled]       │
 *   │       [PAST DUE — only when overdue]                 │
 *   │       ──────────────────────                         │
 *   │       WHEN              DURATION    WITH      [📞]  │
 *   │       Today · 8:47 PM   30 min      Sv               │
 *   └──────────────────────────────────────────────────────┘
 *
 * Type icon tile color matches the appointment type (orange site visit,
 * blue office, purple virtual, gray other). Two pills on the right show
 * the type label + status (mirrors LeadCard's priority + stage stack).
 *
 * Past-due appointments (status `scheduled` AND time has passed) get a
 * red wash on the whole card AND a red PAST DUE ribbon (same overdue
 * affordance as LeadCard).
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';
import { haptic } from '@/src/lib/haptics';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type AppointmentCardType = 'site_visit' | 'office_meeting' | 'virtual_call' | 'other';
export type AppointmentCardStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export type AppointmentCardData = {
  id: string;
  title: string;
  type: AppointmentCardType;
  status: AppointmentCardStatus;
  /** When the appointment is scheduled (real Date). */
  scheduledAt: Date | null;
  /** Optional duration in minutes. */
  durationMins?: number;
  /** Optional client/with-name (also used as the row's subtitle). */
  withName?: string;
  /** Optional phone for the inline Call action. */
  phone?: string;
};

export type AppointmentCardProps = {
  appointment: AppointmentCardData;
  onPress?: () => void;
  onCall?: () => void;
};

const TYPE_LABELS: Record<AppointmentCardType, string> = {
  site_visit: 'Site visit',
  office_meeting: 'Office',
  virtual_call: 'Virtual',
  other: 'Other',
};

const STATUS_LABELS: Record<AppointmentCardStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

const TYPE_ICONS: Record<AppointmentCardType, keyof typeof import('@expo/vector-icons').Ionicons.glyphMap> = {
  site_visit: 'location-outline',
  office_meeting: 'briefcase-outline',
  virtual_call: 'videocam-outline',
  other: 'calendar-outline',
};

// Format scheduledAt: "Today · 8:47 PM" / "Tomorrow · 3:30 PM" /
// "Yesterday · 9:00 AM" / "Wed 10 May · 11:00 AM"
function formatScheduledAt(d: Date | null): string {
  if (!d) return '—';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  const time = d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (diffDays === 0) return `Today · ${time}`;
  if (diffDays === 1) return `Tomorrow · ${time}`;
  if (diffDays === -1) return `Yesterday · ${time}`;

  const dayLabel = d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  return `${dayLabel} · ${time}`;
}

function formatDuration(mins?: number): string | undefined {
  if (!mins || mins <= 0) return undefined;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} h`;
  return `${h}h ${m}m`;
}

export function AppointmentCard({ appointment, onPress, onCall }: AppointmentCardProps) {
  const t = useThemeV2();

  // Type tile + pill — neutral. Appointment type (site visit / office /
  // virtual / other) is a categorical label, so per the app-wide colour
  // discipline it renders in fill3 + secondary instead of per-type hues.
  const typeTint = t.colors.secondary;
  const typeBg = t.colors.fill3;

  // Status pill — only outcomes that carry semantic weight stay coloured:
  //   completed → green (success)
  //   cancelled → red    (error / didn't happen)
  //   no_show   → red    (problem outcome)
  //   scheduled → neutral (default state, no urgency on its own; past-due
  //                       is signalled by the separate ribbon below)
  // 90/10 discipline: only "problem" outcomes (cancelled / no_show) keep
  // their colour. "Completed" goes neutral — the label already says
  // "Completed", no need to scream success in green.
  const statusTone =
    appointment.status === 'cancelled' || appointment.status === 'no_show'
      ? { fg: t.palette.red.base, bg: t.palette.red.soft }
      : { fg: t.colors.secondary, bg: t.colors.fill3 };

  // Past-due check (only for status === 'scheduled')
  const isPastDue =
    appointment.status === 'scheduled'
    && appointment.scheduledAt !== null
    && appointment.scheduledAt.getTime() < Date.now();

  // Card surface stays neutral — only the PAST DUE ribbon below carries the
  // red signal. Mirrors LeadCard's overdue affordance: the row reads as
  // ordinary, with one red badge marking the row that needs attention.
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const dateLine = formatScheduledAt(appointment.scheduledAt);
  const duration = formatDuration(appointment.durationMins);

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      pressOpacity={null}
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderRadius: t.radii.group,
          borderColor: cardBorder,
          borderWidth: t.hairline,
        },
      ]}
    >
      {/* Row 1 — type icon + (title + withName) + (type + status pills stacked) */}
      <View style={styles.row1}>
        <View style={[styles.typeTile, { backgroundColor: typeBg }]}>
          <Ionicons name={TYPE_ICONS[appointment.type]} size={18} color={typeTint} />
        </View>

        <View style={styles.titleBlock}>
          <Text
            variant="callout"
            color="label"
            numberOfLines={1}
          >
            {appointment.title || TYPE_LABELS[appointment.type]}
          </Text>
          {appointment.withName ? (
            <Text
              variant="caption1"
              color="secondary"
              style={{ marginTop: 2 }}
              numberOfLines={1}
            >
              {appointment.withName}
            </Text>
          ) : null}
        </View>

        {/* Two stacked pills — Type (top, neutral) + Status (below). */}
        <View style={styles.pills}>
          <View style={[styles.pill, { backgroundColor: typeBg }]}>
            <View style={[styles.pillDot, { backgroundColor: typeTint }]} />
            <Text
              variant="caption2"
              style={{
                color: typeTint,
                fontWeight: '700',
                marginLeft: 4,
                letterSpacing: 0.1,
              }}
            >
              {TYPE_LABELS[appointment.type]}
            </Text>
          </View>

          <View
            style={[
              styles.pill,
              { backgroundColor: statusTone.bg, marginTop: 4 },
            ]}
          >
            <View style={[styles.pillDot, { backgroundColor: statusTone.fg }]} />
            <Text
              variant="caption2"
              style={{
                color: statusTone.fg,
                fontWeight: '600',
                marginLeft: 4,
                letterSpacing: 0.1,
              }}
            >
              {STATUS_LABELS[appointment.status]}
            </Text>
          </View>
        </View>
      </View>

      {/* Optional PAST DUE ribbon — only when a scheduled appointment's
          time has already passed. Mirrors LeadCard's OVERDUE affordance
          (red pill + flash icon) so both card types speak the same visual
          language for "this row needs attention". */}
      {isPastDue ? (
        <View
          style={[
            styles.ribbon,
            { backgroundColor: t.palette.red.base, marginTop: 8 },
          ]}
        >
          <Ionicons name="flash" size={10} color="#FFFFFF" />
          <Text
            variant="caption2"
            style={{
              color: '#FFFFFF',
              fontWeight: '700',
              marginLeft: 4,
              letterSpacing: 0.4,
            }}
          >
            PAST DUE
          </Text>
        </View>
      ) : null}

      {/* Divider */}
      <View
        style={[
          styles.divider,
          { backgroundColor: t.colors.separator, marginTop: 9 },
        ]}
      />

      {/* Row 2 — meta cells + Call action button */}
      <View style={styles.row2}>
        <View style={styles.metaRow}>
          <Meta label="When" value={dateLine} />
          {duration ? <Meta label="Duration" value={duration} /> : null}
          {appointment.withName ? <Meta label="With" value={appointment.withName} /> : null}
        </View>

        {onCall && appointment.phone ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              haptic.lightImpact();
              onCall();
            }}
            hitSlop={4}
            style={({ pressed }) => [
              styles.callBtn,
              { backgroundColor: t.palette.blue.soft },
              pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
            ]}
            accessibilityLabel="Call"
          >
            <Ionicons name="call" size={15} color={t.palette.blue.base} />
          </Pressable>
        ) : null}
      </View>
    </PressableScale>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      <Text
        variant="footnote"
        color="label"
        style={{ marginTop: 2, fontWeight: '600', fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },

  // Row 1 — type tile + (title + withName) + pill stack
  row1: {
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
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  pills: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  // PAST DUE ribbon
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },

  // Divider
  divider: {
    height: 0.5,
  },

  // Row 2 — meta cells + Call action button
  row2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  metaRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 18,
    minWidth: 0,
  },
  meta: {
    minWidth: 0,
  },
  callBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
