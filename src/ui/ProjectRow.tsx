/**
 * ProjectRow — pixel-perfect port of the InteriorOS prototype project card.
 *
 * Layout per `interior os/src/screens-projects.jsx`:
 *   ┌──────────────────────────────────────────────┐
 *   │ [thumb]  Name                  ●Status pill │
 *   │          Client · Location                  │
 *   │          TYPE — UPPERCASE MONO              │
 *   │                                             │
 *   │ ████████████████░░░░░░░░░░░░          68%   │
 *   │ ₹28.7L / ₹42L              30 JUL 2026      │
 *   └──────────────────────────────────────────────┘
 *
 * Hairline border, no border-radius, sits flush on the canvas.
 */
import { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { color, fontFamily, space } from '@/src/theme/tokens';

import { AlertSheet } from './io';
import { Text } from './Text';

export type ProjectRowPhoto = string | null | undefined;

export type ProjectRowStatus = 'Active' | 'On Hold' | 'Completed';

export type ProjectRowProps = {
  name: string;
  /** Client name. Optional — when missing only `location` is shown. */
  client?: string;
  /** Location / city / address one-liner. */
  location?: string;
  /** Type label, e.g. "Residential — 4BHK Villa". Optional. */
  type?: string;
  budget: number;
  /** Spent so far. Optional — when 0 only the budget is shown. */
  spent?: number;
  /** Total payment-in (received). Optional. When provided we show the
   *  in/out/balance trio instead of the budget-only line. */
  totalIn?: number;
  /** Total payment-out (spent). When provided used in the trio. */
  totalOut?: number;
  /** Progress 0–100. Optional — defaults to 0. */
  progress?: number;
  status: ProjectRowStatus;
  /** Project start date — shown in the bottom meta row. */
  startDate?: Date | null;
  endDate: Date | null;
  /** Optional cover photo URI. When missing the architectural hatch
   *  pattern shows behind the initials. */
  photoUri?: ProjectRowPhoto;
  onPress?: () => void;
  style?: ViewStyle;
};

const STATUS_TONE: Record<
  ProjectRowStatus,
  { fg: string; bg: string }
> = {
  Active:    { fg: color.success,   bg: color.successSoft },
  Completed: { fg: color.textMuted, bg: color.surface },
  'On Hold': { fg: color.warning,   bg: color.warningSoft },
};

function formatInrCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) {
    // Match prototype: "₹28.7L", "₹42L" (drop trailing .0)
    const v = n / 1_00_000;
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    return `₹${s.endsWith('.0') ? s.slice(0, -2) : s}L`;
  }
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n}`;
}

function formatEndDate(d: Date | null): string {
  if (!d) return '';
  // "30 Jul 2026" — match prototype's absDate output verbatim
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ProjectRow({
  name,
  client,
  location,
  type,
  budget,
  spent = 0,
  totalIn,
  totalOut,
  progress = 0,
  status,
  startDate,
  endDate,
  photoUri,
  onPress,
  style,
}: ProjectRowProps) {
  const initials = name.slice(0, 2).toUpperCase();
  const tone = STATUS_TONE[status] ?? STATUS_TONE.Active;
  const pct = Math.max(0, Math.min(100, progress));
  const subLine = [location, client].filter(Boolean).join(' · ');

  // Loss state — owner has spent more than received from the client (and
  // there's a meaningful amount of activity). Triggers a red card stripe
  // + tinted background so it stands out in the list.
  const haveTotals = totalIn !== undefined && totalOut !== undefined;
  const balance = haveTotals ? (totalIn ?? 0) - (totalOut ?? 0) : 0;
  const isLoss =
    haveTotals &&
    (totalOut ?? 0) > (totalIn ?? 0) &&
    (totalOut ?? 0) > 0 &&
    status !== 'Completed';

  // Delay state — handover date is in the past and project isn't done.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isDelayed =
    !!endDate && endDate.getTime() < today.getTime() && status !== 'Completed';
  const daysLate = isDelayed && endDate
    ? Math.floor((today.getTime() - endDate.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const [dueOpen, setDueOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);

  const dueMessage =
    `${name} has spent more than the client has paid.\n\n` +
    `Received  +${formatInrCompact(totalIn ?? 0)}\n` +
    `Spent     −${formatInrCompact(totalOut ?? 0)}\n` +
    `Outstanding  ${formatInrCompact(Math.abs(balance))}\n\n` +
    `Follow up with the client to collect the pending amount.`;

  const lateMessage = endDate
    ? `${name} was due on ${endDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })} — that's ${daysLate} day${daysLate === 1 ? '' : 's'} ago.\n\n` +
      `Update the target handover if the timeline has shifted, or mark the project Completed if work is actually done.`
    : '';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        isLoss && styles.cardLoss,
        pressed && onPress && styles.cardPressed,
        style,
      ]}
    >
      {/* Top row: thumb + (name+pill / client·location / type) */}
      <View style={styles.topRow}>
        <View style={styles.thumb}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.thumbImg} />
          ) : (
            <>
              {/* Architectural hatch (45° stripes) — copied from the
                  prototype's Thumb primitive */}
              <Svg
                style={StyleSheet.absoluteFill}
                width="100%"
                height="100%"
                opacity={0.6}
              >
                <Defs>
                  <Pattern
                    id="thumbHatch"
                    width={6}
                    height={6}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <Line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="6"
                      stroke={color.borderStrong}
                      strokeWidth="1"
                    />
                  </Pattern>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#thumbHatch)" />
              </Svg>
              <Text style={styles.thumbText}>{initials}</Text>
            </>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {/* Alert chips — taps open a short explainer dialog and stop
                propagation so the card doesn't navigate. */}
            {isLoss ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setDueOpen(true);
                }}
                style={styles.alertChip}
                hitSlop={6}
              >
                <Ionicons name="alert-circle" size={11} color="#fff" />
                <Text style={styles.alertChipText}>DUE</Text>
              </Pressable>
            ) : null}
            {isDelayed ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setLateOpen(true);
                }}
                style={[styles.alertChip, styles.alertChipWarning]}
                hitSlop={6}
              >
                <Ionicons name="time" size={11} color="#fff" />
                <Text style={styles.alertChipText}>LATE</Text>
              </Pressable>
            ) : null}
            <View style={[styles.pill, { backgroundColor: tone.bg }]}>
              <Text style={[styles.pillText, { color: tone.fg }]}>
                {status}
              </Text>
            </View>
          </View>
          {subLine ? (
            <Text style={styles.sub} numberOfLines={1}>
              {subLine}
            </Text>
          ) : null}
          {type ? (
            <Text style={styles.typeMeta} numberOfLines={1}>
              {type.toUpperCase()}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Progress bar + percent */}
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${pct}%` },
            ]}
          />
        </View>
        <Text style={styles.pctText}>{pct}%</Text>
      </View>

      {/* Single bottom row — money trio (left) + dates with delay flag (right).
          Compact so the card height matches the pre-totals layout. */}
      <View style={styles.metaRow}>
        {haveTotals ? (
          <View style={styles.moneyRow}>
            <Text style={styles.moneyIn} numberOfLines={1}>
              +{formatInrCompact(totalIn ?? 0)}
            </Text>
            <Text style={styles.moneyDivider}>/</Text>
            <Text style={styles.moneyOut} numberOfLines={1}>
              −{formatInrCompact(totalOut ?? 0)}
            </Text>
            <Text style={styles.moneyDivider}>/</Text>
            <Text
              style={[
                styles.moneyBalance,
                { color: balance < 0 ? color.danger : color.text },
              ]}
              numberOfLines={1}
            >
              {balance < 0 ? '−' : ''}{formatInrCompact(Math.abs(balance))}
            </Text>
          </View>
        ) : (
          <Text style={styles.budget} numberOfLines={1}>
            {spent > 0 ? (
              <>
                {formatInrCompact(spent)}
                <Text style={styles.budgetMuted}> / {formatInrCompact(budget)}</Text>
              </>
            ) : (
              formatInrCompact(budget)
            )}
          </Text>
        )}
        {endDate ? (
          <Text
            style={
              isDelayed
                ? [styles.endDate, { color: color.danger, fontWeight: '700' as const }]
                : styles.endDate
            }
            numberOfLines={1}
          >
            {formatEndDate(endDate)}
          </Text>
        ) : null}
      </View>

      <AlertSheet
        visible={dueOpen}
        onClose={() => setDueOpen(false)}
        tone="danger"
        icon="cash-outline"
        title="Payment due"
        message={dueMessage}
      />
      <AlertSheet
        visible={lateOpen}
        onClose={() => setLateOpen(false)}
        tone="warning"
        icon="time"
        title="Handover delayed"
        message={lateMessage}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 7,
  },
  cardLoss: {
    backgroundColor: color.dangerSoft,
    borderColor: color.danger,
  },
  cardPressed: {
    opacity: 0.82,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  // Thumb — surface with hatched 45° stripes (architectural drawing
  // reference) and the project's initials overlaid.
  thumb: {
    width: 40,
    height: 40,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImg: {
    width: 40,
    height: 40,
  },
  thumbText: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    color: color.textMuted,
    // Sit above the hatch SVG
    position: 'relative',
    zIndex: 1,
  },

  body: {
    flex: 1,
    minWidth: 0,
  },

  // Title + alert chips + status pill
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },

  // Alert chips (Due, Late, …)
  alertChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: color.danger,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  alertChipWarning: {
    backgroundColor: color.warning,
  },
  alertChipText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.6,
  },
  name: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.2,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  pillText: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },

  // Sub line
  sub: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 14,
    color: color.textMuted,
    marginTop: 1,
  },

  // Type uppercase mono meta
  typeMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    lineHeight: 12,
    color: color.textFaint,
    marginTop: 0,
    letterSpacing: 1,
  },

  // Progress
  progressRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    backgroundColor: color.border,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: color.primary,
  },
  pctText: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textFaint,
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },

  budget: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    color: color.text,
    fontVariant: ['tabular-nums'],
  },
  budgetMuted: {
    color: color.textFaint,
  },
  endDate: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textFaint,
    fontVariant: ['tabular-nums'],
  },

  // Single meta row: money trio (left) + end date (right)
  metaRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },

  // In / Out / Balance money trio
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  moneyIn: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.success,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  moneyOut: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.danger,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  moneyBalance: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  moneyDivider: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textFaint,
    paddingHorizontal: 3,
  },
});
