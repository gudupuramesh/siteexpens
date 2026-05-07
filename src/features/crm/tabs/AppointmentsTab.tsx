/**
 * Appointments tab.
 *
 *   1. Top: compact date pager — `< Mon, 4 May  · 3 appts >` with
 *      a "Today" jump-back chip when off today, and a calendar
 *      icon for picking any date. Same vocabulary as the project
 *      Site tab (chevron-step + tap-label-to-pick) so the two
 *      date-driven views feel like one app, not two. Replaced the
 *      earlier 14-day chip strip — at a phone width only ~6 chips
 *      were visible at once and the tab fought the user when they
 *      wanted to jump weeks.
 *   2. Timeline: each appointment is rendered as
 *
 *        TIME      ●─────  ┌─ kind-color border-left card ─┐
 *        gutter    │        │ Title                  Pill │
 *                  │        │ With X                       │
 *                  │        │ ─────────────────────────────│
 *                  │        │ pin · location   Confirmed/Tentative │
 *                  │        │ [Call]  [Directions]         │
 *                           └──────────────────────────────┘
 *
 *   FAB at bottom-right.
 */
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import {
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
  getAppointmentTypeLabel,
  getAppointmentStatusLabel,
} from '@/src/features/crm/types';
import { updateAppointment } from '@/src/features/crm/appointments';
import { useAppointments } from '@/src/features/crm/useAppointments';
import { SelectModal } from '@/src/ui/io';
import { Spinner } from '@/src/ui/Spinner';
import { TutorialEmptyState } from '@/src/ui/TutorialEmptyState';
import { color, fontFamily } from '@/src/theme/tokens';

const GUTTER = 16;

// ── Helpers ─────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}
function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return startOfDay(d);
}
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtTime(d: Date): string {
  return d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
}
/** Compact form for the pager label — "Mon, 4 May". Long enough
 *  to be unambiguous, short enough to leave room for the count. */
function fmtPagerDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// Per-kind tone palette — mirrors prototype `kindMeta`.
const KIND_TONE: Record<AppointmentType, { dot: string; pillBg: string; pillFg: string }> = {
  site_visit:     { dot: color.success, pillBg: color.successSoft, pillFg: color.success },
  office_meeting: { dot: color.primary, pillBg: color.primarySoft, pillFg: color.primary },
  virtual_call:   { dot: color.warning, pillBg: color.warningSoft, pillFg: color.warning },
  other:          { dot: color.textFaint, pillBg: color.surfaceAlt, pillFg: color.textMuted },
};

function dialPhone(phone?: string) {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
}
function openDirections(loc?: string) {
  if (!loc) return;
  Linking.openURL(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`,
  ).catch(() => {});
}

// ── Component ───────────────────────────────────────────────────────

type Props = { orgId: string | undefined };

export function AppointmentsTab({ orgId }: Props) {
  const insets = useSafeAreaInsets();
  const today = useMemo(() => startOfDay(new Date()), []);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [showCalendar, setShowCalendar] = useState(false);
  // iOS: the inline calendar picker doesn't auto-commit. We hold
  // the user's tap in `pendingDate` and only apply it when they
  // hit Done — that's why the iOS sheet has its own Cancel/Done
  // buttons. On Android the native dialog handles commit/cancel
  // itself, so this stays in sync but isn't user-visible there.
  const [pendingDate, setPendingDate] = useState<Date>(today);
  const [statusTargetId, setStatusTargetId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const { data: appointments, loading } = useAppointments(orgId);

  const goPrev = useCallback(() => {
    setSelectedDate((d) => addDays(d, -1));
  }, []);
  const goNext = useCallback(() => {
    setSelectedDate((d) => addDays(d, 1));
  }, []);
  const goToday = useCallback(() => {
    setSelectedDate(today);
  }, [today]);

  const isOnToday = isSameDay(selectedDate, today);

  const dayItems = useMemo(() => {
    return appointments
      .filter((a) => {
        const dt = a.scheduledAt?.toDate();
        return dt ? isSameDay(dt, selectedDate) : false;
      })
      .sort((a, b) => {
        const at = a.scheduledAt?.toMillis() ?? 0;
        const bt = b.scheduledAt?.toMillis() ?? 0;
        return at - bt;
      });
  }, [appointments, selectedDate]);

  const onCalendarChange = useCallback(
    (e: DateTimePickerEvent, picked?: Date) => {
      // Android: the native dialog fires once on dismiss/set with
      // the final selection — apply immediately.
      if (Platform.OS === 'android') {
        if (e.type === 'dismissed') {
          setShowCalendar(false);
          return;
        }
        if (!picked) return;
        setSelectedDate(startOfDay(picked));
        setShowCalendar(false);
        return;
      }
      // iOS: every tap inside the inline calendar fires onChange.
      // Don't commit yet — the user confirms via the Done button
      // in our wrapping sheet.
      if (picked) setPendingDate(startOfDay(picked));
    },
    [],
  );

  const openCalendar = useCallback(() => {
    setPendingDate(selectedDate);
    setShowCalendar(true);
  }, [selectedDate]);
  const cancelCalendar = useCallback(() => {
    setShowCalendar(false);
  }, []);
  const confirmCalendar = useCallback(() => {
    setSelectedDate(pendingDate);
    setShowCalendar(false);
  }, [pendingDate]);

  async function changeStatus(next: AppointmentStatus) {
    if (!statusTargetId) return;
    try {
      setStatusUpdatingId(statusTargetId);
      await updateAppointment(statusTargetId, { status: next });
      setStatusTargetId(null);
    } catch (e) {
      console.warn(e);
    } finally {
      setStatusUpdatingId(null);
    }
  }

  return (
    <View style={styles.flex}>
      {/* ── Date pager — compact `< Mon, 4 May · 3 appts >` bar.
          Three affordances for moving the date, in order of speed:
            • chevrons step ±1 day,
            • TODAY chip (only off today) snaps back,
            • calendar icon (always visible on the right) opens the
              native picker for any date weeks/months away.
          The centre label is also tappable as a redundant entry to
          the calendar picker — discoverable in usability tests. */}
      <View style={styles.pagerBar}>
        <Pressable
          onPress={goPrev}
          hitSlop={12}
          style={({ pressed }) => [styles.pagerNav, pressed && { opacity: 0.5 }]}
          accessibilityLabel="Previous day"
        >
          <Ionicons name="chevron-back" size={20} color={color.text} />
        </Pressable>

        <Pressable
          onPress={openCalendar}
          style={({ pressed }) => [styles.pagerLabel, pressed && { opacity: 0.7 }]}
          hitSlop={6}
          accessibilityLabel="Pick date"
        >
          <RNText style={styles.pagerDate} numberOfLines={1}>
            {isOnToday ? 'Today' : fmtPagerDate(selectedDate)}
          </RNText>
          <RNText style={styles.pagerSub} numberOfLines={1}>
            {isOnToday ? fmtPagerDate(selectedDate) + ' · ' : ''}
            {dayItems.length === 0
              ? 'No appointments'
              : `${dayItems.length} appt${dayItems.length === 1 ? '' : 's'}`}
          </RNText>
        </Pressable>

        <Pressable
          onPress={goNext}
          hitSlop={12}
          style={({ pressed }) => [styles.pagerNav, pressed && { opacity: 0.5 }]}
          accessibilityLabel="Next day"
        >
          <Ionicons name="chevron-forward" size={20} color={color.text} />
        </Pressable>

        {!isOnToday ? (
          <Pressable
            onPress={goToday}
            hitSlop={6}
            style={({ pressed }) => [
              styles.todayChip,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Jump to today"
          >
            <RNText style={styles.todayChipText}>TODAY</RNText>
          </Pressable>
        ) : null}

        {/* Calendar picker entry — always visible so users have a
            stable one-tap path to any date, regardless of which
            day they're currently on. */}
        <Pressable
          onPress={openCalendar}
          hitSlop={8}
          style={({ pressed }) => [
            styles.pagerNav,
            pressed && { opacity: 0.5 },
          ]}
          accessibilityLabel="Open calendar"
        >
          <Ionicons name="calendar-outline" size={18} color={color.text} />
        </Pressable>
      </View>

      {/* ── Body */}
      {loading && appointments.length === 0 ? (
        <View style={styles.empty}>
          <Spinner size={28} />
        </View>
      ) : dayItems.length === 0 ? (
        <TutorialEmptyState
          pageKey="crm_appointments"
          fallback={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={28} color={color.textFaint} />
              <RNText style={styles.emptyTitle}>Free day.</RNText>
              <RNText style={styles.emptySub}>
                Use it to catch up with site teams or review BOQs.
              </RNText>
            </View>
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.timelineContent}
          showsVerticalScrollIndicator={false}
        >
          {dayItems.map((a, i) => (
            <ApptRow
              key={a.id}
              item={a}
              isLast={i === dayItems.length - 1}
              onOpenStatusPicker={setStatusTargetId}
            />
          ))}
        </ScrollView>
      )}

      {/* FAB */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/(app)/crm/add-appointment' as never);
        }}
        style={({ pressed }) => [
          styles.fab,
          { bottom: 24 + insets.bottom },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add appointment"
      >
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>

      {/* Calendar picker — different shape per platform.
          • iOS: bottom sheet with a Cancel/Done header. The inline
            calendar grid sits below; we hold the user's pick in
            `pendingDate` and only commit on Done. iOS's bare
            `<DateTimePicker display="default">` renders as an
            uncommitted inline grid with no Done button — that's
            why we wrap it.
          • Android: render the native `<DateTimePicker>` directly;
            the OS already provides a calendar dialog with OK/Cancel,
            so wrapping it would just duplicate chrome. */}
      {showCalendar && Platform.OS === 'ios' ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={cancelCalendar}
        >
          <View style={styles.sheetBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={cancelCalendar} />
            <View style={[styles.sheetContainer, { paddingBottom: 16 + insets.bottom }]}>
              <View style={styles.sheetHeader}>
                <Pressable onPress={cancelCalendar} hitSlop={10}>
                  <RNText style={styles.sheetCancel}>Cancel</RNText>
                </Pressable>
                <RNText style={styles.sheetTitle}>Pick date</RNText>
                <Pressable onPress={confirmCalendar} hitSlop={10}>
                  <RNText style={styles.sheetDone}>Done</RNText>
                </Pressable>
              </View>
              <DateTimePicker
                mode="date"
                value={pendingDate}
                display="inline"
                onChange={onCalendarChange}
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      ) : showCalendar ? (
        <DateTimePicker
          mode="date"
          value={selectedDate}
          display="default"
          onChange={onCalendarChange}
        />
      ) : null}

      <SelectModal
        visible={!!statusTargetId}
        title="Update status"
        options={APPOINTMENT_STATUSES}
        value={appointments.find((a) => a.id === statusTargetId)?.status}
        onClose={() => {
          if (!statusUpdatingId) setStatusTargetId(null);
        }}
        onPick={(key) => void changeStatus(key as AppointmentStatus)}
      />
    </View>
  );
}

// ── Appointment card (single row, project-card style) ──────────────

function ApptRow({
  item,
  isLast: _isLast,
  onOpenStatusPicker,
}: {
  item: Appointment;
  isLast: boolean;
  onOpenStatusPicker: (id: string) => void;
}) {
  const startDate = item.scheduledAt?.toDate();
  const tone = KIND_TONE[item.type] ?? KIND_TONE.other;
  const isScheduled = item.status === 'scheduled';
  const isCompleted = item.status === 'completed';
  const isCancelled = item.status === 'cancelled';
  const isNoShow = item.status === 'no_show';
  const tentative = isScheduled;
  const contactName = item.clientName ?? '';
  const contactPhone = item.clientPhone;
  const kindLabel = getAppointmentTypeLabel(item.type);
  const statusLabel = getAppointmentStatusLabel(item.status);

  // Split time into "10:30" + "AM" so the time block can stack them.
  const timeStr = startDate ? fmtTime(startDate) : '—';
  const tMatch = timeStr.match(/^(\d{1,2}:\d{2})\s*(am|pm)?/i);
  const timeMain = tMatch?.[1] ?? timeStr;
  const timePeriod = tMatch?.[2]?.toUpperCase() ?? '';
  const durationStr = item.durationMins ? `${item.durationMins}M` : '';

  // Status-driven visual variants
  const cardVariantStyle =
    isCompleted ? styles.cardCompleted :
    isCancelled ? styles.cardCancelled :
    isNoShow    ? styles.cardNoShow :
    null;

  // Time block bg — kind color when active; muted/warning when terminal
  const timeBlockBg =
    isCancelled ? color.textFaint :
    isNoShow    ? color.warning :
    isCompleted ? color.success :
    tone.dot;

  // Title — strikethrough for cancelled
  const titleVariantStyle = isCancelled ? styles.titleCancelled : null;

  // Status pill colors
  const pillFg =
    isCompleted ? color.success :
    isCancelled ? color.danger :
    isNoShow    ? color.warning :
    color.warning; // scheduled
  const pillBg =
    isCompleted ? color.successSoft :
    isCancelled ? color.dangerSoft :
    isNoShow    ? color.warningSoft :
    color.warningSoft;

  return (
    <Pressable
      onPress={() => router.push(`/(app)/crm/appointment/${item.id}` as never)}
      style={({ pressed }) => [
        styles.card,
        cardVariantStyle,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.cardRow}>
        {/* Highlighted time block (left) — kind-tinted bg */}
        <View style={[styles.timeBlock, { backgroundColor: timeBlockBg }]}>
          <RNText style={styles.timeMain} numberOfLines={1}>{timeMain}</RNText>
          {timePeriod ? (
            <RNText style={styles.timePeriod}>{timePeriod}</RNText>
          ) : null}
          {durationStr ? (
            <RNText style={styles.timeDuration}>{durationStr}</RNText>
          ) : null}
        </View>

        {/* Body */}
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <RNText
              style={titleVariantStyle ? [styles.cardTitle, titleVariantStyle] : styles.cardTitle}
              numberOfLines={1}
            >
              {item.title}
            </RNText>
            <View style={[styles.kindPill, { backgroundColor: tone.pillBg }]}>
              <RNText style={[styles.kindPillText, { color: tone.pillFg }]}>
                {kindLabel}
              </RNText>
            </View>
          </View>

          {contactName ? (
            <RNText style={styles.cardSub} numberOfLines={1}>
              With <RNText style={styles.cardSubStrong}>{contactName}</RNText>
            </RNText>
          ) : null}

          {item.location ? (
            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={11} color={color.textFaint} />
              <RNText style={styles.locText} numberOfLines={1}>
                {item.location}
              </RNText>
            </View>
          ) : null}

          {item.notes ? (
            <RNText style={styles.notesPreview} numberOfLines={1}>
              {item.notes}
            </RNText>
          ) : null}

          {/* Footer — status pill (tappable) + actions */}
          <View style={styles.cardFooter}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onOpenStatusPicker(item.id);
              }}
              style={[
                styles.statusPill,
                { backgroundColor: pillBg, borderColor: pillFg },
              ]}
          >
            <View style={[styles.statusDot, { backgroundColor: pillFg }]} />
            <RNText style={[styles.statusPillText, { color: pillFg }]}>
              {statusLabel}
            </RNText>
            <Ionicons name="chevron-down" size={11} color={pillFg} />
          </Pressable>

          <View style={styles.footerActions}>
            <Pressable
              onPress={(e) => { e.stopPropagation(); dialPhone(contactPhone); }}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              hitSlop={6}
            >
              <Ionicons name="call-outline" size={14} color={color.text} />
            </Pressable>
            <Pressable
              onPress={(e) => { e.stopPropagation(); openDirections(item.location); }}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              hitSlop={6}
            >
              <Ionicons name="navigate-outline" size={14} color={color.text} />
            </Pressable>
          </View>
        </View>
        </View>
      </View>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bgGrouped },

  // Date pager — single horizontal bar replacing the old 14-day strip.
  pagerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: GUTTER,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: color.bgGrouped,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    gap: 6,
  },
  pagerNav: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    borderRadius: 8,
  },
  pagerLabel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    minWidth: 0,
  },
  pagerDate: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.2,
  },
  pagerSub: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textMuted,
    marginTop: 1,
  },
  todayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: color.primarySoft,
    borderRadius: 8,
  },
  todayChipText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: 0.8,
  },

  // iOS calendar sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
  },
  sheetCancel: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '500',
    color: color.textMuted,
  },
  sheetTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.1,
  },
  sheetDone: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '700',
    color: color.primary,
  },

  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.1,
    marginTop: 4,
  },
  emptySub: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    color: color.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Timeline
  timelineContent: {
    paddingHorizontal: GUTTER,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 6,
  },

  // ── Card (project-row style: hairline border, sharp corners, soft shadow)
  card: {
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  // Status variants
  cardCompleted: {
    backgroundColor: color.successSoft,
    borderColor: color.success,
  },
  cardCancelled: {
    backgroundColor: color.surfaceAlt,
    borderColor: color.borderStrong,
    opacity: 0.7,
  },
  cardNoShow: {
    backgroundColor: color.warningSoft,
    borderColor: color.warning,
  },
  titleCancelled: {
    textDecorationLine: 'line-through',
    color: color.textMuted,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },

  // Highlighted time block (left, kind-tinted)
  timeBlock: {
    width: 54,
    paddingHorizontal: 3,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeMain: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  timePeriod: {
    fontFamily: fontFamily.mono,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.5,
  },
  timeDuration: {
    fontFamily: fontFamily.mono,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  // Card body (right)
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  // Title — matches project + lead card title (sans 14/600, lh 18, ls -0.2)
  cardTitle: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },
  // Sub line — matches project + lead card sub (sans 12, ink2)
  cardSub: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 14,
    color: color.textMuted,
    marginTop: 2,
  },
  cardSubStrong: {
    color: color.text,
    fontWeight: '500',
  },
  locRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Location / notes use 11px ink2 — matches lead card noteText
  locText: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 11,
    lineHeight: 14,
    color: color.textMuted,
  },
  notesPreview: {
    marginTop: 2,
    fontFamily: fontFamily.sans,
    fontSize: 11,
    lineHeight: 14,
    color: color.textMuted,
    fontStyle: 'italic',
  },
  kindPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  // Pill text — matches project + lead pill (sans 10/600, ls 0.1)
  kindPillText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // Footer (status + icon actions)
  cardFooter: {
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  // Status pill — matches project + lead status pill (sans 10/600, ls 0.1)
  statusPillText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: GUTTER,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.20,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
