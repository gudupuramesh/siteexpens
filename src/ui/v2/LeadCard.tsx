/**
 * v2 LeadCard — CRM lead card (matches `screen-leads.jsx > LeadCard`).
 *
 * Two-row layout split by a hairline:
 *
 *   Row 1: Avatar (initial in tinted square) · Name + sub · [Priority pill] [Stage pill]
 *   Row 2 (optional): Overdue ribbon (red, when followUp is overdue)
 *   Divider
 *   Row 3: Budget · Source · Created meta + [Call] [WhatsApp] action buttons
 *
 * Overdue cards get a faint red wash on the whole card.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';
import { haptic } from '@/src/lib/haptics';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type LeadCardPriority = 'low' | 'medium' | 'high';
export type LeadCardStage =
  | 'new'
  | 'contacted'
  | 'site_visit'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

export type LeadCardData = {
  id: string;
  /** Single-letter avatar, derived from the lead's name. */
  initial: string;
  /**
   * @deprecated Avatar tint is no longer rendered — the card uses the
   * neutral theme tokens (`fill3` / `secondary`) per the app-wide color
   * discipline (only blue/red/orange/green carry meaning). The field is
   * kept on the type for backwards compatibility with existing callers,
   * but its value is ignored.
   */
  tint?: string;
  name: string;
  /** Short subtitle, e.g. "3 BHK · Hyderabad". */
  sub?: string;
  priority: LeadCardPriority;
  stage: LeadCardStage;
  budget?: number;
  source?: string;
  /** Pre-formatted relative date, e.g. "Yesterday". */
  ageLabel?: string;
  /** Pre-formatted follow-up label when overdue, e.g. "4 days ago". */
  overdueLabel?: string;
};

export type LeadCardProps = {
  lead: LeadCardData;
  onPress?: () => void;
  onCall?: () => void;
  onWhatsApp?: () => void;
};

const PRIORITY_LABELS: Record<LeadCardPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'Hot',
};

const STAGE_LABELS: Record<LeadCardStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  site_visit: 'Site visit',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

function inrCompact(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount) || amount <= 0) return '—';
  if (amount >= 1_00_00_000) return `₹${(amount / 1_00_00_000).toFixed(2)}Cr`;
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(0)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function LeadCard({ lead, onPress, onCall, onWhatsApp }: LeadCardProps) {
  const t = useThemeV2();

  // Priority colors — 90/10 discipline: only "Hot" earns colour (red, an
  // explicit alarm). Medium and Low both go neutral; the label still tells
  // the user the priority.
  const prioTone =
    lead.priority === 'high'
      ? { fg: t.palette.red.base, bg: t.palette.red.soft }
      : { fg: t.colors.secondary, bg: t.colors.fill2 };

  // Stage pill is neutralized — the stage label is descriptive, not actionable.
  // Color discipline: only blue/red/orange/green carry meaning; categorical
  // labels go neutral (fill3 + secondary). Priority pill above stays colored
  // because priority is actionable (high → red, medium → orange, low → neutral).
  const stageBg = t.colors.fill3;
  const stageFg = t.colors.secondary;

  const overdue = !!lead.overdueLabel;

  // Card surface stays neutral even when overdue — only the OVERDUE ribbon
  // below carries the red colour. Tinting the entire card was visual
  // overkill and made the list read as a "danger zone" instead of an
  // ordinary list with one urgency marker per affected row.
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

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
      {/* Row 1 — avatar + name + priority/stage pills */}
      <View style={styles.row1}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: t.colors.fill3,
              borderColor: 'transparent',
              borderWidth: 0,
            },
          ]}
        >
          <Text style={{ color: t.colors.secondary, fontSize: 17, fontWeight: '700' }}>
            {lead.initial.toUpperCase()}
          </Text>
        </View>

        <View style={styles.nameBlock}>
          <Text variant="callout" color="label" numberOfLines={1}>
            {lead.name}
          </Text>
          {lead.sub ? (
            <Text
              variant="caption1"
              color="secondary"
              style={{ marginTop: 2 }}
              numberOfLines={1}
            >
              {lead.sub}
            </Text>
          ) : null}
        </View>

        <View style={styles.pills}>
          {/* Priority pill */}
          <View
            style={[
              styles.pill,
              { backgroundColor: prioTone.bg },
            ]}
          >
            <View style={[styles.pillDot, { backgroundColor: prioTone.fg }]} />
            <Text
              variant="caption2"
              style={{
                color: prioTone.fg,
                fontWeight: '700',
                marginLeft: 4,
                letterSpacing: 0.1,
              }}
            >
              {PRIORITY_LABELS[lead.priority]}
            </Text>
          </View>

          {/* Stage pill (neutral — stage is descriptive, not actionable) */}
          <View
            style={[
              styles.pill,
              {
                backgroundColor: stageBg,
                marginTop: 4,
              },
            ]}
          >
            <View style={[styles.pillDot, { backgroundColor: stageFg }]} />
            <Text
              variant="caption2"
              style={{
                color: stageFg,
                fontWeight: '600',
                marginLeft: 4,
                letterSpacing: 0.1,
              }}
            >
              {STAGE_LABELS[lead.stage]}
            </Text>
          </View>
        </View>
      </View>

      {/* Optional overdue ribbon */}
      {overdue ? (
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
            OVERDUE · {lead.overdueLabel}
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

      {/* Row 3 — meta + actions */}
      <View style={styles.row3}>
        <View style={styles.metaRow}>
          <Meta label="Budget" value={inrCompact(lead.budget)} />
          {lead.source ? <Meta label="Source" value={lead.source} /> : null}
          {lead.ageLabel ? <Meta label="Created" value={lead.ageLabel} /> : null}
        </View>

        <View style={styles.actions}>
          {onCall ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                haptic.lightImpact();
                onCall();
              }}
              hitSlop={4}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: t.palette.blue.soft },
                pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
              ]}
              accessibilityLabel="Call"
            >
              <Ionicons name="call" size={15} color={t.palette.blue.base} />
            </Pressable>
          ) : null}
          {onWhatsApp ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                haptic.lightImpact();
                onWhatsApp();
              }}
              hitSlop={4}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: t.palette.green.soft },
                pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
              ]}
              accessibilityLabel="WhatsApp"
            >
              <Ionicons name="logo-whatsapp" size={15} color={t.palette.green.base} />
            </Pressable>
          ) : null}
        </View>
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
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nameBlock: {
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
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  divider: {
    height: 0.5,
  },
  row3: {
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
  actions: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
