/**
 * Toolkit home — v2 design.
 *
 * Layout:
 *   1. Single-line header — "Toolkit" title (left) + OrgSwitcher chip (right)
 *   2. Category FormGroups (Convert / Estimate / Lighting / Climate / Soft Finishes / Layout / Reference)
 *      Each Row inside a FormGroup is a tool — colored IconTile + title + subtitle + chevron.
 *
 * Tools open as modal sheets (each module is self-contained — see
 * `src/features/toolkit/modules/*`). The grid pattern from v1 (custom
 * cards in a column) is replaced with grouped FormGroup + Row so the
 * Toolkit reads like the Account screen — same vocabulary across the app.
 */
import { useState, type ComponentProps, type ComponentType } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { IconTile } from '@/src/ui/v2/IconTile';
import { OrgSwitcher } from '@/src/ui/v2/OrgSwitcher';
import { Row } from '@/src/ui/v2/Row';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

import { UnitConverter } from './modules/UnitConverter';
import { TileCalculator } from './modules/TileCalculator';
import { PaintCalculator } from './modules/PaintCalculator';
import { PlywoodCalculator } from './modules/PlywoodCalculator';
import { LightingCalculator } from './modules/LightingCalculator';
import { AcTonnageCalculator } from './modules/AcTonnageCalculator';
import { WallpaperCalculator } from './modules/WallpaperCalculator';
import { CurtainCalculator } from './modules/CurtainCalculator';
import { SpacingCalculator } from './modules/SpacingCalculator';
import { GoldenRatioCalculator } from './modules/GoldenRatioCalculator';
import { StandardDimensions } from './modules/StandardDimensions';

type IconName = ComponentProps<typeof Ionicons>['name'];

type ModuleKey =
  | 'converter'
  | 'tile'
  | 'paint'
  | 'plywood'
  | 'lighting'
  | 'ac'
  | 'wallpaper'
  | 'curtain'
  | 'spacing'
  | 'golden'
  | 'dimensions';

type ModuleGroup =
  | 'Convert'
  | 'Estimate'
  | 'Lighting'
  | 'Climate'
  | 'Soft Finishes'
  | 'Layout'
  | 'Reference';

type ModuleDef = {
  key: ModuleKey;
  group: ModuleGroup;
  title: string;
  subtitle: string;
  icon: IconName;
  Component: ComponentType<{ visible: boolean; onClose: () => void }>;
};

const MODULES: ModuleDef[] = [
  {
    key: 'converter',
    group: 'Convert',
    title: 'Unit converter',
    subtitle: 'ft / in ↔ mm / cm / m  ·  sq ft ↔ m² ↔ Gaj',
    icon: 'swap-horizontal',
    Component: UnitConverter,
  },
  {
    key: 'tile',
    group: 'Estimate',
    title: 'Tile calculator',
    subtitle: 'Area + size → tiles + 10% wastage',
    icon: 'grid-outline',
    Component: TileCalculator,
  },
  {
    key: 'paint',
    group: 'Estimate',
    title: 'Paint calculator',
    subtitle: 'Wall area − openings → litres needed',
    icon: 'color-palette-outline',
    Component: PaintCalculator,
  },
  {
    key: 'plywood',
    group: 'Estimate',
    title: 'Plywood / laminate',
    subtitle: 'Face area → 8×4 ft sheets to order',
    icon: 'albums-outline',
    Component: PlywoodCalculator,
  },
  {
    key: 'lighting',
    group: 'Lighting',
    title: 'Lighting estimator',
    subtitle: 'Lumens needed · downlight count · K guide',
    icon: 'bulb-outline',
    Component: LightingCalculator,
  },
  {
    key: 'ac',
    group: 'Climate',
    title: 'AC tonnage',
    subtitle: 'Room volume → recommended split-AC size',
    icon: 'snow-outline',
    Component: AcTonnageCalculator,
  },
  {
    key: 'wallpaper',
    group: 'Soft Finishes',
    title: 'Wallpaper calculator',
    subtitle: 'Wall + roll + pattern repeat → rolls to order',
    icon: 'image-outline',
    Component: WallpaperCalculator,
  },
  {
    key: 'curtain',
    group: 'Soft Finishes',
    title: 'Curtain fabric',
    subtitle: 'Window + fullness → metres of fabric',
    icon: 'browsers-outline',
    Component: CurtainCalculator,
  },
  {
    key: 'spacing',
    group: 'Layout',
    title: 'Equidistant spacing',
    subtitle: 'Centre objects evenly across a wall',
    icon: 'resize-outline',
    Component: SpacingCalculator,
  },
  {
    key: 'golden',
    group: 'Layout',
    title: 'Proportion calculator',
    subtitle: '60 / 30 / 10 split + golden ratio',
    icon: 'analytics-outline',
    Component: GoldenRatioCalculator,
  },
  {
    key: 'dimensions',
    group: 'Reference',
    title: 'Standard dimensions',
    subtitle: 'Counter, wardrobe, doors, TV — searchable',
    icon: 'book-outline',
    Component: StandardDimensions,
  },
];

const GROUP_ORDER: ModuleGroup[] = [
  'Convert',
  'Estimate',
  'Lighting',
  'Climate',
  'Soft Finishes',
  'Layout',
  'Reference',
];

export function ToolkitHome() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [openKey, setOpenKey] = useState<ModuleKey | null>(null);

  // Group → IconTile colour. 90/10 colour discipline: tool groups are
  // categorical labels, not actionable status, so they all read in the
  // neutral secondary tone. The icon glyph + section header tell the user
  // which group a tile belongs to.
  const groupColor: Record<ModuleGroup, string> = {
    Convert:        t.colors.secondary,
    Estimate:       t.colors.secondary,
    Lighting:       t.colors.secondary,
    Climate:        t.colors.secondary,
    'Soft Finishes': t.colors.secondary,
    Layout:         t.colors.secondary,
    Reference:      t.colors.secondary,
  };

  const byGroup = GROUP_ORDER.map((g) => ({
    group: g,
    items: MODULES.filter((m) => m.group === g),
  }));

  return (
    <View style={styles.root}>
      <AmbientBackground />

      {/* Single-line header: "Toolkit" title (left) + OrgSwitcher (right) */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text variant="title2" color="label" style={{ fontWeight: '700' }}>
          Toolkit
        </Text>
        <OrgSwitcher />
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: t.region.tabBarBuffer + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {byGroup.map(({ group, items }) => (
          <FormGroup key={group} header={group}>
            {items.map((m, idx) => (
              <Row
                key={m.key}
                leading={
                  <IconTile icon={m.icon} color={groupColor[group]} />
                }
                label={m.title}
                subtitle={m.subtitle}
                chevron
                onPress={() => setOpenKey(m.key)}
                divider={idx < items.length - 1}
              />
            ))}
          </FormGroup>
        ))}
      </ScrollView>

      {/* Render every module modal at once — visibility is gated by state.
          React mounts/unmounts the underlying Modal natively. */}
      {MODULES.map((m) => (
        <m.Component
          key={m.key}
          visible={openKey === m.key}
          onClose={() => setOpenKey(null)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  scroll: {
    paddingTop: 0,
  },
});
