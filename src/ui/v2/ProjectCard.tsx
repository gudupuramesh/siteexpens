/**
 * v2 ProjectCard — list card for the Projects tab.
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ Project name              [● Active] [Late]          │
 *   │ location · subType                                   │
 *   │ ──────────────────────                               │
 *   │ IN        OUT       BALANCE      PROGRESS            │
 *   │ +₹X       −₹X       ±₹X          60%                 │
 *   └──────────────────────────────────────────────────────┘
 *
 * Decisions:
 *   • No cover thumbnail — the card is title-led, not image-led, so
 *     each row reads in roughly the same height (a long list scans
 *     faster without varying-content thumbs).
 *   • Card surface is ALWAYS the neutral surface — past-due no longer
 *     tints the whole card red. Instead, a small uppercase "LATE"
 *     pill sits next to the status pill on the right. Less alarming
 *     than a red wash, still impossible to miss.
 *   • Budget removed (it's set once and rarely shifts).
 *   • Progress bar removed — progress is the 4th cell in the meta row
 *     as a tabular percentage instead.
 */
import { StyleSheet, View } from 'react-native';

import { inrCompact, useThemeV2 } from '@/src/theme/v2';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ProjectCardStatus = 'active' | 'on_hold' | 'completed' | 'archived';

export type ProjectCardData = {
  id: string;
  name: string;
  /** Public Cloudflare R2 URL for the cover photo. Kept on the type
   *  for backward compatibility — the card no longer renders it. */
  photoUri?: string | null;
  /** Short subtitle, e.g. "HSR Layout · 4BHK Villa". */
  subtitle?: string;
  status: ProjectCardStatus;
  /** Project value / budget. Kept on the type for backward compat —
   *  the card no longer renders it. */
  budget?: number;
  /** Total income (in) for the project — when `showFinance` is true. */
  totalIn?: number;
  /** Total expense (out) — when `showFinance` is true. */
  totalOut?: number;
  /** Optional progress 0–100. Shown as the 4th meta cell. */
  progress?: number;
  /** Optional deadline date — used to compute the "LATE" pill. */
  endDate?: Date | null;
};

export type ProjectCardProps = {
  project: ProjectCardData;
  /** When false, hide the IN/OUT/BALANCE row (clients). */
  showFinance?: boolean;
  onPress?: () => void;
};

const STATUS_LABELS: Record<ProjectCardStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

export function ProjectCard({ project, showFinance = true, onPress }: ProjectCardProps) {
  const t = useThemeV2();

  // Status pill colours — 90/10 discipline: only the project state that
  // demands user action keeps colour. Everything else neutralises.
  //   active    → neutral (default state)
  //   on_hold   → orange  (paused — warrants attention)
  //   completed → neutral (the label tells you it's done; no colour needed)
  //   archived  → neutral (informational)
  const statusTone =
    project.status === 'on_hold'
      ? { fg: t.palette.orange.base, bg: t.mode === 'dark' ? t.palette.orange.softDark : t.palette.orange.soft }
      : { fg: t.colors.secondary, bg: t.colors.fill3 };

  // Past-due check (only meaningful for active projects). Surfaces
  // as a small "LATE" pill beside the status pill — the card itself
  // stays the same neutral surface.
  const isPastDue =
    project.status === 'active'
    && project.endDate != null
    && project.endDate.getTime() < Date.now();

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  // Balance = in - out. 90/10 discipline: positive balance reads in the
  // neutral label colour (the "+" sign carries the meaning); negative
  // balance keeps red because it's an actual problem the user should see.
  const balance = (project.totalIn ?? 0) - (project.totalOut ?? 0);
  const balanceColor =
    balance < 0 ? t.palette.red.base : t.colors.label;

  const progress = Math.max(0, Math.min(100, project.progress ?? 0));
  const showProgress = project.progress != null && project.progress > 0;

  return (
    <PressableScale
      onPress={onPress}
      // Haptic intentionally NOT fired here — PressableScale would fire it
      // on press-in, which means a finger that's only brushing the card
      // mid-scroll buzzes the phone. The list owner fires the haptic from
      // its own onPress (only completed taps that survived the gesture
      // recogniser actually trigger it).
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
      {/* Row 1 — title + status pill (+ optional Late pill) */}
      <View style={styles.row1}>
        <View style={styles.titleBlock}>
          <Text
            variant="callout"
            color="label"
            numberOfLines={1}
          >
            {project.name}
          </Text>
          {project.subtitle ? (
            <Text
              variant="caption1"
              color="secondary"
              style={{ marginTop: 2 }}
              numberOfLines={1}
            >
              {project.subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.pillRow}>
          <View style={[styles.pill, { backgroundColor: statusTone.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: statusTone.fg }]} />
            <Text
              variant="caption2"
              style={{
                color: statusTone.fg,
                fontWeight: '700',
                marginLeft: 4,
                letterSpacing: 0.1,
              }}
            >
              {STATUS_LABELS[project.status]}
            </Text>
          </View>
          {isPastDue ? (
            <View
              style={[
                styles.latePill,
                {
                  backgroundColor:
                    t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                },
              ]}
            >
              <Text
                variant="caption2"
                style={{
                  color: t.palette.red.base,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                }}
              >
                LATE
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Divider */}
      <View
        style={[
          styles.divider,
          { backgroundColor: t.colors.separator, marginTop: 8 },
        ]}
      />

      {/* Row 2 — financial meta cells + progress.
          Light colour discipline: IN gets a subtle green (the only
          guaranteed-positive number), Balance turns red when negative
          (an actionable problem), Progress stays blue (interactive
          accent). OUT stays neutral — the "−" prefix already tells
          the eye it's an outflow. */}
      <View style={styles.row2}>
        {showFinance ? (
          <>
            <Meta
              label="In"
              value={`+${inrCompact(project.totalIn ?? 0)}`}
              valueColor={t.palette.green.base}
            />
            <Meta
              label="Out"
              value={`−${inrCompact(project.totalOut ?? 0)}`}
              valueColor={t.colors.label}
            />
            <Meta
              label="Balance"
              value={`${balance >= 0 ? '+' : '−'}${inrCompact(Math.abs(balance))}`}
              valueColor={balanceColor}
            />
          </>
        ) : null}
        {showProgress ? (
          <Meta
            label="Progress"
            value={`${progress}%`}
            valueColor={t.palette.blue.base}
          />
        ) : null}
      </View>
    </PressableScale>
  );
}

function Meta({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const t = useThemeV2();
  return (
    <View style={styles.meta}>
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.6 }}>
        {label.toUpperCase()}
      </Text>
      <Text
        variant="footnote"
        style={{
          color: valueColor ?? t.colors.label,
          marginTop: 2,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}
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
    paddingTop: 9,
    paddingBottom: 9,
  },

  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },

  // Status + late pill cluster on the right
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  // Smaller sibling pill — sits beside the status to flag overdue
  // without changing the surface color.
  latePill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },

  divider: {
    height: 0.5,
  },

  row2: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
});
