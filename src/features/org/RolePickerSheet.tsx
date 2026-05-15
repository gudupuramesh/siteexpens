/**
 * RolePickerSheet — v2 design.
 *
 * Full-height bottom sheet that lets a Studio Admin / Owner pick a
 * role for a teammate or invite. Each role card shows a compact 2-up
 * module access matrix so the picker can compare roles at a glance.
 *
 * Layout:
 *   1. Sheet header (grabber + Cancel · "Pick role" title + Done)
 *   2. Identity strip (target's name + phone subtitle)
 *   3. List of selectable role cards:
 *      - Tone-tinted dot + role label + access tag (Full / Limited / Read-only)
 *      - Selected card → blue border + blue.soft fill + checkmark
 *      - Description line
 *      - 2-col matrix of all 12 modules with full / partial / none icons
 *   4. Footer with optional red.soft Remove pill + blue Save pill
 *
 * Used in two flows:
 *   - Invite: pickContact → open sheet → pick role → "Continue" → opens
 *             ProjectAccessSheet
 *   - Edit:   tap existing member → open sheet (current role
 *             pre-selected) → pick role → "Save" → calls setMemberRole
 *
 * The sheet is self-contained; the parent owns the `onSave` /
 * `onRemove` mutations.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  MODULE_KEYS,
  MODULE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_MODULE_ACCESS,
  type AccessLevel,
  type AssignableRole,
} from './permissions';
import type { RoleKey } from './types';

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export type RolePickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Sheet header — invitee or existing member name. */
  title: string;
  /** Sheet header subtitle, e.g. phone number. */
  subtitle?: string;
  /** Roles to render as picker cards. */
  assignable: AssignableRole[];
  /** Currently-selected role (for edit flows). */
  current?: RoleKey | null;
  /** Save Access button handler. */
  onSave: (role: AssignableRole) => Promise<void> | void;
  /** Optional Remove Access button (only shown when provided). */
  onRemove?: () => void;
  /** Save button copy. Defaults to "Save". */
  saveLabel?: string;
};

/**
 * Per-role tone for the dot beside each role title. Mirrors the team-roles
 * screen's avatar tones so the picker reads consistently.
 *
 * Color discipline: roles are categorical labels, not actionable status.
 * Only `superAdmin` keeps a coloured dot (red, for emphasis on the privileged
 * role). All other roles use a neutral tone (fill3 + secondary).
 *
 * Returns a palette-shaped object so consuming JSX (`tone.soft`, `tone.base`)
 * doesn't need branching.
 */
function roleTone(
  role: RoleKey,
  t: ReturnType<typeof useThemeV2>,
): { base: string; soft: string; softDark: string } {
  if (role === 'superAdmin') return t.palette.red;
  return {
    base: t.colors.secondary,
    soft: t.colors.fill3,
    softDark: t.colors.fill3,
  };
}

/** Access intensity → short tag word for the role header.
 *  Full = the role can administer everything in scope.
 *  Limited = some modules are restricted.
 *  Read-only = no full-write modules at all. */
function accessTagFor(role: RoleKey): { label: string; tone: 'blue' | 'green' | 'orange' | 'yellow' } {
  if (role === 'superAdmin') return { label: 'Full access', tone: 'green' };
  if (role === 'admin') return { label: 'Full access', tone: 'green' };
  if (role === 'viewer' || role === 'client') return { label: 'Read-only', tone: 'yellow' };
  return { label: 'Limited access', tone: 'orange' };
}

export function RolePickerSheet({
  visible,
  onClose,
  title,
  subtitle,
  assignable,
  current,
  onSave,
  onRemove,
  saveLabel = 'Save',
}: RolePickerSheetProps) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<AssignableRole | null>(
    current && assignable.includes(current as AssignableRole)
      ? (current as AssignableRole)
      : null,
  );
  const [busy, setBusy] = useState(false);

  // Reset the local selection whenever the sheet (re-)opens so a stale
  // pick from a previous invitee doesn't carry over.
  useEffect(() => {
    if (visible) {
      setSelected(
        current && assignable.includes(current as AssignableRole)
          ? (current as AssignableRole)
          : null,
      );
    }
  }, [visible, current, assignable]);

  const handleSave = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await onSave(selected);
    } finally {
      setBusy(false);
    }
  };

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.colors.bg,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              // Fixed height (not maxHeight) so the inner ScrollView's
              // flex:1 has a parent height to fill against. With
              // maxHeight + justifyContent:'flex-end', the sheet
              // shrunk to its non-flex content height (header +
              // identity card) and the role cards never rendered.
              height: '92%',
            },
          ]}
        >
          {/* Grabber */}
          <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />

          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: t.colors.surface,
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={onClose} hitSlop={8} style={styles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={[styles.title, { fontWeight: '600' }]}
              numberOfLines={1}
            >
              Pick role
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={!selected || busy}
              hitSlop={8}
              style={({ pressed }) => [
                styles.sideBtn,
                { alignItems: 'flex-end' },
                (!selected || busy || pressed) && { opacity: 0.5 },
              ]}
            >
              <Text
                variant="body"
                style={{
                  color: !selected ? t.colors.tertiary : t.palette.blue.base,
                  fontWeight: '600',
                }}
              >
                {busy ? 'Saving…' : saveLabel}
              </Text>
            </Pressable>
          </View>

          {/* Identity strip */}
          {title || subtitle ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <View
                style={[
                  styles.identityCard,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.card,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                <View
                  style={[
                    styles.identityAvatar,
                    {
                      backgroundColor:
                        t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                      borderRadius: t.radii.tile,
                    },
                  ]}
                >
                  <Ionicons name="person" size={16} color={t.palette.blue.base} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    variant="body"
                    color="label"
                    numberOfLines={1}
                   
                  >
                    {title || 'Pick a role'}
                  </Text>
                  {subtitle ? (
                    <Text
                      variant="caption1"
                      color="secondary"
                      numberOfLines={1}
                      style={{ marginTop: 2 }}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          {/* Role cards */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 16,
              gap: 10,
            }}
            showsVerticalScrollIndicator={false}
          >
            {assignable.map((role) => {
              const isSelected = selected === role;
              const tone = roleTone(role, t);
              const tag = accessTagFor(role);
              const tagTone = t.palette[tag.tone];

              return (
                <Pressable
                  key={role}
                  onPress={() => setSelected(role)}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: isSelected
                        ? t.mode === 'dark'
                          ? t.palette.blue.softDark
                          : t.palette.blue.soft
                        : cardBg,
                      borderRadius: t.radii.card,
                      borderColor: isSelected
                        ? t.palette.blue.base + '55'
                        : cardBorder,
                      borderWidth: isSelected ? 1.5 : t.hairline,
                    },
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  {/* Header row — dot + label + access tag + checkmark */}
                  <View style={styles.cardHeader}>
                    <View
                      style={[
                        styles.roleDot,
                        { backgroundColor: tone.base },
                      ]}
                    />
                    <Text
                      variant="headline"
                      color="label"
                      style={{ marginLeft: 8, fontWeight: '700' }}
                    >
                      {ROLE_LABELS[role]}
                    </Text>
                    <View
                      style={[
                        styles.tagPill,
                        {
                          backgroundColor:
                            t.mode === 'dark' ? tagTone.softDark : tagTone.soft,
                          borderRadius: 999,
                          marginLeft: 8,
                        },
                      ]}
                    >
                      <Text
                        variant="caption2"
                        style={{
                          color: tagTone.base,
                          fontWeight: '700',
                          letterSpacing: 0.4,
                        }}
                      >
                        {tag.label.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={
                        isSelected ? t.palette.blue.base : t.colors.tertiary
                      }
                    />
                  </View>

                  {/* Description */}
                  <Text
                    variant="footnote"
                    color="secondary"
                    style={{ marginTop: 6 }}
                  >
                    {ROLE_DESCRIPTIONS[role]}
                  </Text>

                  {/* Module access matrix */}
                  <View
                    style={[
                      styles.matrix,
                      {
                        backgroundColor: isSelected
                          ? t.colors.surface + '00' // already on tinted bg
                          : t.colors.fill3,
                        borderRadius: t.radii.tile,
                        marginTop: 12,
                      },
                    ]}
                  >
                    {pairsOf(MODULE_KEYS).map(([a, b], i) => (
                      <View key={i} style={styles.matrixRow}>
                        <ModuleCell role={role} moduleKey={a} t={t} />
                        <ModuleCell role={role} moduleKey={b} t={t} />
                      </View>
                    ))}
                  </View>
                </Pressable>
              );
            })}

            {/* Legend */}
            <View
              style={[
                styles.legend,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.card,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                  marginTop: 4,
                },
              ]}
            >
              <LegendItem
                icon="checkmark"
                color={t.palette.green.base}
                label="Full"
              />
              <LegendItem
                icon="remove"
                color={t.palette.orange.base}
                label="Partial"
              />
              <LegendItem
                icon="close"
                color={t.colors.tertiary}
                label="None"
              />
            </View>
          </ScrollView>

          {/* Footer — Remove Access (when editing) */}
          {onRemove ? (
            <View
              style={[
                styles.footer,
                {
                  backgroundColor: t.colors.surface,
                  borderTopColor: t.colors.separator,
                  borderTopWidth: t.hairline,
                  paddingBottom: insets.bottom + 12,
                },
              ]}
            >
              <Pressable
                onPress={onRemove}
                disabled={busy}
                style={({ pressed }) => [
                  styles.removeBtn,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                    borderRadius: t.radii.field,
                    borderColor: t.palette.red.base + '33',
                    borderWidth: t.hairline,
                  },
                  pressed && { opacity: 0.85 },
                  busy && { opacity: 0.5 },
                ]}
              >
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={t.palette.red.base}
                />
                <Text
                  variant="callout"
                  style={{
                    color: t.palette.red.base,
                    fontWeight: '700',
                    marginLeft: 8,
                  }}
                >
                  Remove from studio
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ paddingBottom: insets.bottom + 8 }} />
          )}

          {busy ? (
            <View style={styles.busyOverlay} pointerEvents="none">
              <ActivityIndicator color={t.palette.blue.base} />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ModuleCell({
  role,
  moduleKey,
  t,
}: {
  role: RoleKey;
  moduleKey: (typeof MODULE_KEYS)[number] | null;
  t: ReturnType<typeof useThemeV2>;
}) {
  if (!moduleKey) return <View style={styles.cell} />;
  const level: AccessLevel = ROLE_MODULE_ACCESS[role][moduleKey];
  return (
    <View style={styles.cell}>
      <Text
        variant="footnote"
        color="label"
        style={{ flex: 1 }}
        numberOfLines={1}
      >
        {MODULE_LABELS[moduleKey]}
      </Text>
      <AccessIcon level={level} t={t} />
    </View>
  );
}

function AccessIcon({
  level,
  t,
}: {
  level: AccessLevel;
  t: ReturnType<typeof useThemeV2>;
}) {
  if (level === 'full') {
    return (
      <Ionicons name="checkmark" size={14} color={t.palette.green.base} />
    );
  }
  if (level === 'partial') {
    return (
      <Ionicons name="remove" size={14} color={t.palette.orange.base} />
    );
  }
  return <Ionicons name="close" size={14} color={t.colors.tertiary} />;
}

function LegendItem({
  icon,
  color,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
}) {
  return (
    <View style={styles.legendItem}>
      <Ionicons name={icon} size={13} color={color} />
      <Text
        variant="caption2"
        color="secondary"
        style={{ marginLeft: 4, letterSpacing: 0.4 }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/** Group module keys into 2-column rows for compact display. */
function pairsOf<T>(arr: readonly T[]): [T, T | null][] {
  const out: [T, T | null][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push([arr[i], (arr[i + 1] ?? null) as T | null]);
  }
  return out;
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sideBtn: { minWidth: 70 },
  title: { flex: 1, textAlign: 'center' },

  // Identity card
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  identityAvatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Role card
  card: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },

  // Matrix
  matrix: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  matrixRow: {
    flexDirection: 'row',
    gap: 16,
  },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },

  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
