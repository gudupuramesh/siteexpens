/**
 * RolePickerSheet — v2 design.
 *
 * Full-height bottom sheet that lets a Studio Admin / Owner pick a
 * role for a teammate or invite. Every role renders as its own card
 * with the full module-access matrix inline — five cards, five
 * matrices, side-by-side comparable in one scroll. The user wanted
 * the original "full card with matrix" structure preserved; this
 * iteration keeps that but trades the boxes-within-boxes visual for
 * a much cleaner styling vocabulary:
 *
 *   - The inner gray-tile matrix is gone. Module rows render flush
 *     inside the card with no nested surface.
 *   - Heavy checkmark / dash / cross icons replaced by small 7 px
 *     tone dots (green / orange / muted) — same information at a
 *     fraction of the visual weight.
 *   - Module labels render in small-caps caption type (caption2
 *     letterspacing 0.4) so they read as labels rather than copy.
 *   - The access tag is text-only ("· FULL ACCESS" inline next to the
 *     role name), no coloured pill chip — keeps the role header
 *     visually quiet so the matrix doesn't have to compete for attention.
 *   - Selected state: thin blue ring + faint blue tint + small filled
 *     blue checkmark. Not a saturated blue background.
 *
 * Layout:
 *   1. Sheet header (grabber + Cancel · "Pick role" title + Done)
 *   2. Identity strip (target's name + phone subtitle)
 *   3. List of selectable role cards — each shows label + access
 *      tag + description + 2-col module access matrix
 *   4. Optional Remove-from-studio footer (edit flow only)
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
  type ModuleKey,
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

          {/* Role cards — every role shows its full module-access
              matrix inline so the user can compare side-by-side. */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 16,
              gap: 12,
            }}
            showsVerticalScrollIndicator={false}
          >
            {assignable.map((role) => (
              <RoleCard
                key={role}
                role={role}
                isSelected={selected === role}
                onPress={() => setSelected(role)}
              />
            ))}
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

/**
 * RoleCard — selectable card with the full module-access matrix
 * inline. Visual vocabulary:
 *   - Header: role name (heavy) · "FULL ACCESS" / "LIMITED ACCESS"
 *     in tone-coloured caption (no pill chip).
 *   - Description: 1-line secondary copy.
 *   - Matrix: 2-col flush layout, module label in caption2 small-caps,
 *     7 px tone dot at the right of each cell. Green = full, orange
 *     = partial, neutral grey = none.
 *   - Selected: thin 1.5 px blue ring + faint blue tint + filled blue
 *     check in top-right corner. Subtle, not loud.
 */
function RoleCard({
  role,
  isSelected,
  onPress,
}: {
  role: AssignableRole;
  isSelected: boolean;
  onPress: () => void;
}) {
  const t = useThemeV2();
  const tag = accessTagFor(role);
  const tagTone = t.palette[tag.tone];

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  // Faint tint when selected — 14 % opacity of blue.soft so the row
  // reads as "lit" without overpowering the matrix beneath.
  const selectedTint =
    t.mode === 'dark'
      ? 'rgba(10,132,255,0.12)'
      : 'rgba(10,132,255,0.06)';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isSelected ? selectedTint : cardBg,
          borderRadius: t.radii.card,
          borderColor: isSelected ? t.palette.blue.base : cardBorder,
          borderWidth: isSelected ? 1.5 : t.hairline,
        },
        pressed && { opacity: 0.94 },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${ROLE_LABELS[role]}, ${tag.label}`}
    >
      {/* Header — name + access tag (left) + check (right) */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.headerLine}>
            <Text
              variant="headline"
              color="label"
              style={{ fontWeight: '700' }}
              numberOfLines={1}
            >
              {ROLE_LABELS[role]}
            </Text>
            <Text
              variant="caption2"
              style={{
                color: tagTone.base,
                fontWeight: '700',
                letterSpacing: 0.5,
                marginLeft: 8,
              }}
              numberOfLines={1}
            >
              {`· ${tag.label.toUpperCase()}`}
            </Text>
          </View>
          <Text
            variant="footnote"
            color="secondary"
            style={{ marginTop: 4 }}
          >
            {ROLE_DESCRIPTIONS[role]}
          </Text>
        </View>
        <View style={styles.checkSlot}>
          {isSelected ? (
            <View
              style={[
                styles.checkFilled,
                { backgroundColor: t.palette.blue.base },
              ]}
            >
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          ) : (
            <View
              style={[
                styles.checkRing,
                { borderColor: t.colors.tertiary },
              ]}
            />
          )}
        </View>
      </View>

      {/* Module access matrix — 2 col, flush inside the card (no
          inner gray surface). Labels in caption2 small-caps, dots
          on the right encode access level. */}
      <View style={styles.matrix}>
        {pairsOf(MODULE_KEYS).map(([a, b], i) => (
          <View key={i} style={styles.matrixRow}>
            <ModuleCell role={role} moduleKey={a} t={t} />
            <ModuleCell role={role} moduleKey={b} t={t} />
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** One module label + access dot inside the matrix. */
function ModuleCell({
  role,
  moduleKey,
  t,
}: {
  role: RoleKey;
  moduleKey: ModuleKey | null;
  t: ReturnType<typeof useThemeV2>;
}) {
  if (!moduleKey) return <View style={styles.cell} />;
  const level: AccessLevel = ROLE_MODULE_ACCESS[role][moduleKey];
  const dotColor =
    level === 'full'
      ? t.palette.green.base
      : level === 'partial'
        ? t.palette.orange.base
        : t.colors.tertiary;
  // "None" gets a hollow ring instead of a filled dot so it reads
  // as "not granted" rather than "another colour I have to decode".
  const isNone = level === 'none';
  return (
    <View style={styles.cell}>
      <Text
        variant="caption2"
        color="secondary"
        style={{
          flex: 1,
          letterSpacing: 0.4,
          fontWeight: '600',
        }}
        numberOfLines={1}
      >
        {MODULE_LABELS[moduleKey].toUpperCase()}
      </Text>
      <View
        style={[
          styles.accessDot,
          isNone
            ? {
                borderColor: dotColor,
                borderWidth: 1,
                backgroundColor: 'transparent',
              }
            : { backgroundColor: dotColor },
        ]}
      />
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Top-right radio indicator slot — fixed size so checked / unchecked
  // states don't shift the header layout when the user picks.
  checkSlot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  checkFilled: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Module access matrix — flush inside the card, no inner surface.
  matrix: {
    marginTop: 14,
    gap: 8,
  },
  matrixRow: {
    flexDirection: 'row',
    gap: 24,
  },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accessDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
