/**
 * v2 FloatingTabBar — DESIGN: bottom capsule glass bar with the 5
 * production tabs (Projects · Overview · CRM · Toolkit · Account).
 *
 * Pure presentational component. The `<AppTabBar>` bridge wires it to
 * Expo Router's tab navigator state and to per-role visibility.
 *
 * Pinned 16 px from the bottom (or safe area), 16 px insets. Tabs that
 * the role can't see are hidden via the `visible` set, so the visible
 * set's order (always: index, overview, crm, toolkit, account) defines
 * the layout — the same order the system tab bar previously used.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeV2 } from '@/src/theme/v2';
import { haptic } from '@/src/lib/haptics';

import { Text } from './Text';

/** Route keys mirror `BottomTabKey` in `useVisibleTabs.ts`. */
export type TabKey =
  | 'index'      // Projects
  | 'overview'   // Overview
  | 'crm'        // CRM
  | 'toolkit'    // Toolkit
  | 'account';   // Account (formerly "More" / chats)

type TabDef = {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const TABS: TabDef[] = [
  { key: 'index',    label: 'Projects', icon: 'folder-outline',           iconActive: 'folder' },
  { key: 'overview', label: 'Finance',  icon: 'pie-chart-outline',        iconActive: 'pie-chart' },
  { key: 'crm',      label: 'CRM',      icon: 'people-outline',           iconActive: 'people' },
  { key: 'toolkit',  label: 'Toolkit',  icon: 'construct-outline',        iconActive: 'construct' },
  { key: 'account',  label: 'Account',  icon: 'person-circle-outline',    iconActive: 'person-circle' },
];

export type FloatingTabBarProps = {
  /** Currently active route key. */
  active: TabKey;
  /** Set of tab keys the current role is allowed to see. Tabs not in
   *  the set are hidden. Pass `null`/undefined to show all tabs. */
  visible?: ReadonlySet<TabKey> | null;
  /** Tap handler — receives the chosen tab key. */
  onChange?: (k: TabKey) => void;
};

export function FloatingTabBar({ active, visible, onChange }: FloatingTabBarProps) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();

  const visibleTabs = visible ? TABS.filter((tab) => visible.has(tab.key)) : TABS;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, 16), paddingHorizontal: 16 },
      ]}
    >
      <View
        style={[
          styles.capsule,
          {
            borderRadius: t.radii.tabbar,
            borderColor:
              t.mode === 'dark'
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(0,0,0,0.06)',
            borderWidth: t.hairline,
            // BlurView is a true OS-level blur on iOS but only an
            // approximated tint on Android — content underneath bleeds
            // through and makes the tab labels unreadable. So on Android
            // we paint a near-opaque surface here (the BlurView still
            // sits on top and gets fully obscured); iOS keeps the
            // lighter wash so the blur reads as glass.
            backgroundColor:
              Platform.OS === 'android'
                ? (t.mode === 'dark'
                    ? 'rgba(28,28,30,0.97)'
                    : 'rgba(255,255,255,0.97)')
                : (t.mode === 'dark'
                    ? 'rgba(28,28,30,0.55)'
                    : 'rgba(255,255,255,0.55)'),
          },
          t.shadows.glass,
        ]}
      >
        <BlurView
          intensity={Platform.OS === 'android' ? 0 : 70}
          tint={
            t.mode === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'
          }
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: t.radii.tabbar, overflow: 'hidden' },
          ]}
        />
        <View style={styles.tabs}>
          {visibleTabs.map((tab) => {
            const isActive = tab.key === active;
            const icon = isActive ? tab.iconActive : tab.icon;
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  if (!isActive) haptic.selection();
                  onChange?.(tab.key);
                }}
                hitSlop={6}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.label}
                style={({ pressed }) => [
                  styles.tab,
                  isActive && {
                    backgroundColor: t.palette.blue.soft,
                    borderRadius: 22,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name={icon}
                  size={isActive ? 22 : 20}
                  color={isActive ? t.palette.blue.base : t.colors.secondary}
                />
                <Text
                  variant="caption2"
                  style={{
                    color: isActive ? t.palette.blue.base : t.colors.secondary,
                    marginTop: 2,
                    fontWeight: isActive ? '700' : '600',
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  capsule: {
    height: 60,
    overflow: 'hidden',
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-evenly',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    marginVertical: 6,
  },
});
