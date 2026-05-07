/**
 * RolePickerSheet — full-height bottom sheet for assigning a role to a
 * team member or invitee. Renders one card per assignable role with a
 * compact two-column module-access summary so the studio admin can
 * compare roles at a glance before saving.
 *
 * Used in two flows:
 *   - Invite: pickContact → open sheet → pick role → tap Save Access
 *             → calls `inviteMember` upstream.
 *   - Edit:   tap existing member → open sheet (current role
 *             pre-selected) → pick role → tap Save Access (or Remove
 *             Access for demote-only).
 *
 * The sheet is a self-contained component; the parent owns the
 * `onSave` / `onRemove` mutations so we can plug it into both the
 * Team and Roles screen and the per-project Client invite flow.
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

import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

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
  /** Save button copy. Defaults to "Save Access". */
  saveLabel?: string;
};

export function RolePickerSheet({
  visible,
  onClose,
  title,
  subtitle,
  assignable,
  current,
  onSave,
  onRemove,
  saveLabel = 'Save Access',
}: RolePickerSheetProps) {
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" color="text">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="caption" color="textMuted">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable hitSlop={12} onPress={onClose}>
              <Ionicons name="close" size={22} color={color.text} />
            </Pressable>
          </View>

          {/* Role cards */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {assignable.map((role) => {
              const isSelected = selected === role;
              return (
                <Pressable
                  key={role}
                  onPress={() => setSelected(role)}
                  style={[styles.card, isSelected && styles.cardSelected]}
                >
                  <View style={styles.cardHeader}>
                    <Text variant="bodyStrong" color="text">
                      {ROLE_LABELS[role]}{' '}
                      <Text variant="caption" color="textMuted">
                        (Limited Access)
                      </Text>
                    </Text>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={color.primary}
                      />
                    ) : (
                      <Ionicons
                        name="ellipse-outline"
                        size={18}
                        color={color.textFaint}
                      />
                    )}
                  </View>

                  <Text variant="caption" color="textMuted" style={styles.cardSubtitle}>
                    {ROLE_DESCRIPTIONS[role]}
                  </Text>

                  <View style={styles.matrix}>
                    {pairsOf(MODULE_KEYS).map(([a, b], i) => (
                      <View key={i} style={styles.matrixRow}>
                        <ModuleCell role={role} moduleKey={a} />
                        <ModuleCell role={role} moduleKey={b} />
                      </View>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            {onRemove ? (
              <Pressable
                onPress={onRemove}
                disabled={busy}
                style={({ pressed }) => [
                  styles.btnGhost,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text variant="bodyStrong" color="danger">
                  Remove Access
                </Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable
              onPress={handleSave}
              disabled={!selected || busy}
              style={({ pressed }) => [
                styles.btnPrimary,
                (!selected || busy) && styles.btnDisabled,
                pressed && { opacity: 0.85 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={color.onPrimary} />
              ) : (
                <Text variant="bodyStrong" style={{ color: color.onPrimary }}>
                  {saveLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ModuleCell({
  role,
  moduleKey,
}: {
  role: RoleKey;
  moduleKey: (typeof MODULE_KEYS)[number] | null;
}) {
  if (!moduleKey) return <View style={styles.cell} />;
  const level: AccessLevel = ROLE_MODULE_ACCESS[role][moduleKey];
  return (
    <View style={styles.cell}>
      <Text variant="meta" color="text" style={styles.cellLabel} numberOfLines={1}>
        {MODULE_LABELS[moduleKey]}
      </Text>
      <AccessIcon level={level} />
    </View>
  );
}

function AccessIcon({ level }: { level: AccessLevel }) {
  if (level === 'full') {
    return <Ionicons name="checkmark" size={14} color={color.success} />;
  }
  if (level === 'partial') {
    return <Ionicons name="checkmark" size={14} color={color.warning} />;
  }
  return <Ionicons name="close" size={14} color={color.textFaint} />;
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    height: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: color.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: 12,
  },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: screenInset, paddingBottom: space.lg, gap: space.md },
  card: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.md,
    backgroundColor: color.bg,
    padding: 14,
    gap: 10,
  },
  cardSelected: {
    borderColor: color.primary,
    borderWidth: 2,
    backgroundColor: color.primarySoft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardSubtitle: { marginTop: -4 },
  matrix: { gap: 6 },
  matrixRow: { flexDirection: 'row', gap: 12 },
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  cellLabel: { flex: 1, paddingRight: 6 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  btnGhost: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.danger,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    flex: 1,
    borderRadius: radius.sm,
    backgroundColor: color.primary,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
});
