/**
 * v2 FAB — Floating Action Button.
 *
 * Circular blue button with white SF Symbol inside, pinned bottom-right.
 * Used for the primary creation action on a list screen — e.g. "New
 * lead" on CRM, "New project" on Projects.
 *
 * Sits ABOVE the FloatingTabBar (default `bottomOffset` = 92).
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeV2 } from '@/src/theme/v2';

import { PressableScale } from './PressableScale';

export type FABProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Bottom offset above the safe area / tab bar. Default 92 (16 + 60 tabbar + 16 gap). */
  bottomOffset?: number;
  accessibilityLabel?: string;
};

export function FAB({ icon, onPress, bottomOffset = 92, accessibilityLabel }: FABProps) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();

  return (
    <PressableScale
      onPress={onPress}
      hitSlop={6}
      haptic="light"
      scaleTo={0.92}
      pressOpacity={null}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.fab,
        {
          right: 20,
          bottom: Math.max(insets.bottom, 16) + bottomOffset,
          backgroundColor: t.palette.blue.base,
          shadowColor: t.palette.blue.base,
          shadowOpacity: 0.32,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        },
      ]}
    >
      <Ionicons name={icon} size={26} color="#FFFFFF" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
