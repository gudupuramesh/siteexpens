/**
 * ProjectRowSheet — ultra-compact glass-style project card.
 *
 * Target: 5–6 cards visible on screen at once.
 * DUE / LATE badges indicate alerts; card border stays neutral.
 */
import { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, fontFamily } from '@/src/theme/tokens';

import { AlertSheet } from './io';
import { Text } from './Text';

export type ProjectRowSheetStatus = 'Active' | 'On Hold' | 'Completed';

export type ProjectRowSheetProps = {
  index?: number;
  name: string;
  subtitle?: string;
  /** Ignored when `variant` is `ledgerOnly` or `reference`. */
  budget: number;
  totalIn?: number;
  totalOut?: number;
  progress?: number;
  status: ProjectRowSheetStatus;
  startDate?: Date | null;
  endDate: Date | null;
  onPress?: () => void;
  onStatusPress?: () => void;
  style?: ViewStyle;
  /** Cover photo URL (`Project.photoUri`). Reference variant shows image or default building icon. */
  photoUri?: string | null;
  /**
   * `ledgerOnly`: Amount in / Amount out / Balance (no BUD).
   * `reference`: dashboard row — Total in | out | Balance | Progress (bar under Progress).
   */
  variant?: 'default' | 'ledgerOnly' | 'reference';
};

function fmtInr(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) {
    const v = n / 1_00_000;
    const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
    return `₹${s.endsWith('.0') ? s.slice(0, -2) : s}L`;
  }
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n}`;
}

function usableProjectPhotoUri(uri: string | null | undefined): string | null {
  if (uri == null || typeof uri !== 'string') return null;
  const t = uri.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith('file://')) return t;
  return null;
}

const thumbStyles = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: color.primarySoft,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    width: '100%',
    height: '100%',
  },
});

function ProjectLeadThumb({ uri }: { uri?: string | null }) {
  const src = usableProjectPhotoUri(uri ?? null);
  return (
    <View style={thumbStyles.wrap}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={thumbStyles.img}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name="business" size={17} color={color.primary} />
      )}
    </View>
  );
}

function fmtDate(d: Date | null): string {
  if (!d) return '';
  return d
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    .replace(/\./g, '');
}

export function ProjectRowSheet({
  name,
  subtitle,
  budget,
  totalIn,
  totalOut,
  progress = 0,
  status,
  endDate,
  onPress,
  onStatusPress,
  style,
  variant = 'default',
  photoUri,
}: ProjectRowSheetProps) {
  const pct = Math.max(0, Math.min(100, progress));

  const haveTotals = totalIn !== undefined && totalOut !== undefined;
  const balance = haveTotals ? (totalIn ?? 0) - (totalOut ?? 0) : 0;
  const isLoss =
    haveTotals &&
    (totalOut ?? 0) > (totalIn ?? 0) &&
    (totalOut ?? 0) > 0 &&
    status !== 'Completed';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isDelayed =
    !!endDate && endDate.getTime() < today.getTime() && status !== 'Completed';
  const daysLate =
    isDelayed && endDate
      ? Math.floor((today.getTime() - endDate.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

  const [dueOpen, setDueOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);

  const lowProgress = pct < 30;

  const dueMessage =
    `${name} has spent more than the client has paid.\n\n` +
    `Received  +${fmtInr(totalIn ?? 0)}\n` +
    `Spent     −${fmtInr(totalOut ?? 0)}\n` +
    `Outstanding  ${fmtInr(Math.abs(balance))}\n\n` +
    `Follow up with the client to collect the pending amount.`;

  const lateMessage = endDate
    ? `${name} was due on ${endDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })} — that's ${daysLate} day${daysLate === 1 ? '' : 's'} ago.\n\n` +
      `Update the target handover if the timeline has shifted, or mark the project Completed if work is actually done.`
    : '';

  const balanceColor = !haveTotals
    ? color.textFaint
    : balance < 0
      ? color.danger
      : color.primary;

  const balanceStrSigned = haveTotals
    ? (balance < 0 ? `−${fmtInr(Math.abs(balance))}` : `+${fmtInr(balance)}`)
    : '—';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        variant === 'reference' && refStyles.cardRef,
        pressed && onPress && styles.cardPressed,
        style,
      ]}
    >
      {variant === 'reference' ? (
        <>
          <View style={refStyles.topRow}>
            <ProjectLeadThumb uri={photoUri} />
            <View style={refStyles.nameBlock}>
              <Text style={refStyles.refName} numberOfLines={1}>{name}</Text>
              {subtitle ? (
                <Text style={refStyles.refSub} numberOfLines={2}>{subtitle}</Text>
              ) : null}
            </View>
            <View style={styles.badges}>
              {isLoss ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); setDueOpen(true); }}
                  style={[styles.badge, styles.badgeDue]}
                  hitSlop={6}
                >
                  <Text style={styles.badgeTextW}>DUE</Text>
                </Pressable>
              ) : null}
              {isDelayed ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); setLateOpen(true); }}
                  style={[styles.badge, styles.badgeLate]}
                  hitSlop={6}
                >
                  <Text style={styles.badgeTextW}>LATE</Text>
                </Pressable>
              ) : null}
              {status === 'Active' ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onStatusPress?.(); }}
                  style={[styles.badge, refStyles.badgeActiveBlue]}
                  hitSlop={6}
                >
                  <Text style={[styles.badgeTextC, { color: color.primary }]}>ACTIVE</Text>
                </Pressable>
              ) : status === 'On Hold' ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onStatusPress?.(); }}
                  style={[styles.badge, styles.badgeHold]}
                  hitSlop={6}
                >
                  <Text style={[styles.badgeTextC, { color: '#64748B' }]}>ON HOLD</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onStatusPress?.(); }}
                  style={[styles.badge, refStyles.badgeDone]}
                  hitSlop={6}
                >
                  <Text style={[styles.badgeTextC, { color: '#0F9D58' }]}>DONE</Text>
                </Pressable>
              )}
            </View>
          </View>
          <View style={refStyles.divider} />
          <View style={refStyles.metricsRow4}>
            <View style={refStyles.metricCell}>
              <Text style={refStyles.metricLabelSm} numberOfLines={2}>
                Total in
              </Text>
              <Text
                style={[refStyles.metricValueSm, { color: haveTotals ? color.success : color.textFaint }]}
                numberOfLines={1}
              >
                {haveTotals ? `+${fmtInr(totalIn ?? 0)}` : '—'}
              </Text>
            </View>
            <View style={refStyles.metricCell}>
              <Text style={refStyles.metricLabelSm} numberOfLines={2}>
                Total out
              </Text>
              <Text
                style={[refStyles.metricValueSm, { color: haveTotals ? color.danger : color.textFaint }]}
                numberOfLines={1}
              >
                {haveTotals ? `−${fmtInr(totalOut ?? 0)}` : '—'}
              </Text>
            </View>
            <View style={refStyles.metricCell}>
              <Text style={refStyles.metricLabelSm} numberOfLines={2}>
                Balance
              </Text>
              <Text
                style={[refStyles.metricValueSm, { color: balanceColor }]}
                numberOfLines={1}
              >
                {balanceStrSigned}
              </Text>
            </View>
            <View style={refStyles.metricCell}>
              <Text style={refStyles.metricLabelSm} numberOfLines={2}>
                Progress
              </Text>
              <Text
                style={[
                  refStyles.progressPctSm,
                  lowProgress && { color: color.warning },
                ]}
                numberOfLines={1}
              >
                {pct}%
              </Text>
            </View>
            {/* Arrow gets its own equal-width cell so the 5 columns
                read as one consistent rhythm (in / out / balance /
                progress / →). The cell uses the same flex:1 weight as
                the others — the chevron centers vertically against
                the value row above (label + value lines). */}
            <View style={[refStyles.metricCell, refStyles.arrowCell]}>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={color.primary}
              />
            </View>
          </View>
        </>
      ) : (
        <>
          {/* Row 1: name + badges */}
          <View style={styles.row1}>
            <ProjectLeadThumb uri={photoUri} />
            <View style={styles.nameCol}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <View style={styles.badges}>
              {isLoss ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); setDueOpen(true); }}
                  style={[styles.badge, styles.badgeDue]}
                  hitSlop={6}
                >
                  <Text style={styles.badgeTextW}>DUE</Text>
                </Pressable>
              ) : null}
              {isDelayed ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); setLateOpen(true); }}
                  style={[styles.badge, styles.badgeLate]}
                  hitSlop={6}
                >
                  <Text style={styles.badgeTextW}>LATE</Text>
                </Pressable>
              ) : null}
              {status === 'Active' ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onStatusPress?.(); }}
                  style={[styles.badge, styles.badgeActive]}
                  hitSlop={6}
                >
                  <View style={styles.dot} />
                  <Text style={[styles.badgeTextC, { color: '#0F9D58' }]}>ACTIVE</Text>
                </Pressable>
              ) : status === 'On Hold' ? (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onStatusPress?.(); }}
                  style={[styles.badge, styles.badgeHold]}
                  hitSlop={6}
                >
                  <Text style={[styles.badgeTextC, { color: color.textMuted }]}>ON HOLD</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); onStatusPress?.(); }}
                  style={[styles.badge, styles.badgeActive]}
                  hitSlop={6}
                >
                  <Text style={[styles.badgeTextC, { color: '#0F9D58' }]}>DONE</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Row 2: financials inline */}
          <View style={styles.row2}>
            {variant === 'ledgerOnly' ? (
              <>
                <FC
                  l="Amount in"
                  labelStyle={styles.fcLLedger}
                  v={haveTotals ? `+${fmtInr(totalIn ?? 0)}` : '—'}
                  c={haveTotals ? '#0F9D58' : color.textFaint}
                />
                <FC
                  l="Amount out"
                  labelStyle={styles.fcLLedger}
                  v={haveTotals ? `−${fmtInr(totalOut ?? 0)}` : '—'}
                  c={haveTotals ? color.danger : color.textFaint}
                />
                <FC
                  l="Balance"
                  labelStyle={styles.fcLLedger}
                  v={haveTotals ? `${balance < 0 ? '−' : '+'}${fmtInr(Math.abs(balance))}` : '—'}
                  c={haveTotals ? (balance < 0 ? color.danger : color.text) : color.textFaint}
                />
              </>
            ) : (
              <>
                <FC l="BUD" v={fmtInr(budget)} />
                <FC l="IN" v={haveTotals ? `+${fmtInr(totalIn ?? 0)}` : '—'} c={haveTotals ? '#0F9D58' : color.textFaint} />
                <FC l="OUT" v={haveTotals ? `−${fmtInr(totalOut ?? 0)}` : '—'} c={haveTotals ? color.danger : color.textFaint} />
                <FC
                  l="BAL"
                  v={haveTotals ? `${balance < 0 ? '−' : '+'}${fmtInr(Math.abs(balance))}` : '—'}
                  c={haveTotals ? (balance < 0 ? color.danger : color.text) : color.textFaint}
                />
              </>
            )}
          </View>

          {/* Row 3: progress bar + pct + date */}
          <View style={styles.row3}>
            <View style={styles.track}>
              <View style={[styles.fill, lowProgress && styles.fillLow, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.pct}>{pct}%</Text>
            {endDate ? (
              <Text style={isDelayed ? [styles.date, { color: color.danger }] : styles.date}>
                {fmtDate(endDate)}
              </Text>
            ) : null}
          </View>
        </>
      )}

      <AlertSheet visible={dueOpen} onClose={() => setDueOpen(false)} tone="danger" icon="cash-outline" title="Payment due" message={dueMessage} />
      <AlertSheet visible={lateOpen} onClose={() => setLateOpen(false)} tone="warning" icon="time" title="Handover delayed" message={lateMessage} />
    </Pressable>
  );
}

function FC({ l, v, c, labelStyle }: { l: string; v: string; c?: string; labelStyle?: TextStyle }) {
  return (
    <View style={styles.fc}>
      <Text style={labelStyle ? [styles.fcL, labelStyle] : styles.fcL} numberOfLines={2}>
        {l}
      </Text>
      <Text style={c ? [styles.fcV, { color: c }] : styles.fcV} numberOfLines={1}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Was `rgba(255,255,255,0.82)` for a "glass" look — but during tab
    // transitions (Projects → Overview), the 18% transparency made each
    // card paint as a ghost-rectangle outline on top of the cross-fading
    // Overview content. Solid white kills the artifact and is visually
    // indistinguishable on the white screen background.
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 7,
  },
  cardPressed: { opacity: 0.85 },

  // Row 1 — name + badges
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  nameCol: { flex: 1, marginRight: 6 },
  name: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    color: color.text,
    lineHeight: 18,
  },
  sub: {
    fontFamily: fontFamily.sans,
    fontSize: 10,
    color: color.textMuted,
    lineHeight: 13,
  },
  badges: { flexDirection: 'row', gap: 4, alignItems: 'center', flexShrink: 0 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeTextW: { fontSize: 8, fontWeight: '800', letterSpacing: 0.4, color: '#fff' },
  badgeTextC: { fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  badgeActive: { backgroundColor: '#E3F5EB' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#0F9D58' },
  badgeLate: { backgroundColor: '#F59E0B' },
  badgeDue: { backgroundColor: '#EF4444' },
  badgeHold: { backgroundColor: '#F1F5F9' },

  // Row 2 — financials
  row2: { flexDirection: 'row', marginBottom: 4 },
  fc: { flex: 1 },
  fcL: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: color.textMuted,
    opacity: 0.65,
    lineHeight: 10,
    marginBottom: 1,
  },
  fcLLedger: {
    fontSize: 7,
    letterSpacing: 0.2,
    lineHeight: 9,
  },
  fcV: {
    fontSize: 12,
    fontWeight: '600',
    color: color.text,
    fontVariant: ['tabular-nums'],
    lineHeight: 16,
  },

  // Row 3 — progress
  row3: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  track: {
    flex: 1,
    height: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 1.5, backgroundColor: color.primary },
  fillLow: { backgroundColor: '#D97706' },
  pct: {
    fontSize: 10,
    fontWeight: '700',
    color: color.textMuted,
    fontVariant: ['tabular-nums'],
    minWidth: 24,
    textAlign: 'right',
  },
  date: { fontSize: 10, color: color.textMuted },
});

/** Dashboard reference layout — four tight columns; Progress + bar right-aligned in last column. */
const refStyles = StyleSheet.create({
  cardRef: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    paddingTop: 0,
  },
  refName: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '700',
    color: color.text,
    lineHeight: 18,
  },
  refSub: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textMuted,
    lineHeight: 14,
    marginTop: 1,
  },
  badgeActiveBlue: {
    backgroundColor: color.primarySoft,
  },
  badgeDone: {
    backgroundColor: '#E3F5EB',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginTop: 8,
    marginBottom: 6,
  },
  metricsRow4: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    width: '100%',
    maxWidth: '100%',
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  // The 5 cells (Total in · Total out · Balance · Progress · →) all
  // share `metricCell` so the row distributes evenly via flex:1. The
  // arrow cell adds vertical centering since it has no label/value
  // pair to align against — without `justifyContent: 'center'` the
  // chevron would hug the top of the cell and look off.
  arrowCell: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  metricLabelSm: {
    fontFamily: fontFamily.sans,
    fontSize: 9,
    fontWeight: '600',
    color: color.textMuted,
    lineHeight: 11,
    marginBottom: 2,
  },
  metricValueSm: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '700',
    color: color.text,
    fontVariant: ['tabular-nums'],
    lineHeight: 14,
  },
  progressPctSm: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    fontWeight: '700',
    color: color.primary,
    fontVariant: ['tabular-nums'],
    lineHeight: 14,
    flexShrink: 0,
  },
});
