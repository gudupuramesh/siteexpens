/**
 * OrgSwitcherChip — universal studio-switcher entry point that
 * lives in the top header of every tab (Projects, Overview, CRM,
 * Toolkit, Chats).
 *
 * Surface: a compact pill showing the studio NAME with a small
 * swap icon — readable at a glance ("LAUNDRY GO ⇅") instead of a
 * pair of initials. Initials confused users who weren't sure what
 * "PA" meant; the name is unambiguous.
 *
 * Tap → router.push('/(app)/select-company') opens the full-screen
 * Select Company picker (replaces the older bottom-sheet flow). The
 * navigation pattern mirrors what most studio-software apps use
 * (Tally, Zoho Books, Onsite competitor) — it's more discoverable
 * than a sheet and gives room for per-org settings + role labels.
 *
 * Always reachable for every role — Supervisor / Client / Site
 * Engineer included. They don't always have the Overview tab, but
 * the chip is on every header, so org-switching is one tap from
 * anywhere.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { Text } from './Text';
import { color, space } from '@/src/theme';

export type OrgSwitcherChipProps = {
  /** Optional positioning override — typically caller supplies a
   *  `marginRight` or absolute placement. */
  style?: ViewStyle;
};

export function OrgSwitcherChip({ style }: OrgSwitcherChipProps) {
  const { data: org } = useCurrentOrganization();
  const name = org?.name ?? '';
  // Display name as-is, but cap to ~18 chars so really long studio
  // names don't push the chip off-screen on phones. We tested with
  // "Happy Interior Designers Pvt Ltd" — needed truncation.
  const display = name.length > 18 ? `${name.slice(0, 18).trim()}…` : name;

  return (
    <Pressable
      onPress={() => router.push('/(app)/select-company' as never)}
      style={({ pressed }) => [
        styles.chip,
        pressed && { opacity: 0.7 },
        style,
      ]}
      accessibilityLabel="Switch studio"
      hitSlop={8}
    >
      <Text
        variant="metaStrong"
        color="text"
        style={styles.name}
        numberOfLines={1}
      >
        {display || 'Select studio'}
      </Text>
      {/* Vertical-double-arrow icon reads as "swap" / "switch" — same
          metaphor as the competitor app the user referenced. Subtle
          but obvious it's an interactive control, not a static label. */}
      <Ionicons name="swap-vertical" size={14} color={color.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  name: {
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flexShrink: 1,
    minWidth: 0,
  },
});
