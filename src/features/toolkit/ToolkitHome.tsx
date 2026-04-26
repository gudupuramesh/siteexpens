/**
 * Toolkit home — grid of cards. Each card launches a module modal.
 *
 * Modules are intentionally launched as modals (not pushed routes) so
 * we don't have to wire a nested router; everything is local state and
 * fully self-contained inside `src/features/toolkit/`.
 */
import { useState, type ComponentType } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, space } from '@/src/theme';

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
    title: 'Unit Converter',
    subtitle: 'ft / in ↔ mm / cm / m  ·  sq ft ↔ m² ↔ Gaj',
    icon: 'swap-horizontal',
    Component: UnitConverter,
  },
  {
    key: 'tile',
    group: 'Estimate',
    title: 'Tile Calculator',
    subtitle: 'Area + size → tiles + 10% wastage',
    icon: 'grid-outline',
    Component: TileCalculator,
  },
  {
    key: 'paint',
    group: 'Estimate',
    title: 'Paint Calculator',
    subtitle: 'Wall area − openings → litres needed',
    icon: 'color-palette-outline',
    Component: PaintCalculator,
  },
  {
    key: 'plywood',
    group: 'Estimate',
    title: 'Plywood / Laminate',
    subtitle: 'Face area → 8×4 ft sheets to order',
    icon: 'albums-outline',
    Component: PlywoodCalculator,
  },
  {
    key: 'lighting',
    group: 'Lighting',
    title: 'Lighting Estimator',
    subtitle: 'Lumens needed · downlight count · K guide',
    icon: 'bulb-outline',
    Component: LightingCalculator,
  },
  {
    key: 'ac',
    group: 'Climate',
    title: 'AC Tonnage',
    subtitle: 'Room volume → recommended split-AC size',
    icon: 'snow-outline',
    Component: AcTonnageCalculator,
  },
  {
    key: 'wallpaper',
    group: 'Soft Finishes',
    title: 'Wallpaper Calculator',
    subtitle: 'Wall + roll + pattern repeat → rolls to order',
    icon: 'image-outline',
    Component: WallpaperCalculator,
  },
  {
    key: 'curtain',
    group: 'Soft Finishes',
    title: 'Curtain Fabric',
    subtitle: 'Window + fullness → metres of fabric',
    icon: 'browsers-outline',
    Component: CurtainCalculator,
  },
  {
    key: 'spacing',
    group: 'Layout',
    title: 'Equidistant Spacing',
    subtitle: 'Centre objects evenly across a wall',
    icon: 'resize-outline',
    Component: SpacingCalculator,
  },
  {
    key: 'golden',
    group: 'Layout',
    title: 'Proportion Calculator',
    subtitle: '60 / 30 / 10 split + golden ratio',
    icon: 'analytics-outline',
    Component: GoldenRatioCalculator,
  },
  {
    key: 'dimensions',
    group: 'Reference',
    title: 'Standard Dimensions',
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
  const [openKey, setOpenKey] = useState<ModuleKey | null>(null);

  // Group modules by section for the home grid.
  const byGroup = GROUP_ORDER.map((g) => ({
    group: g,
    items: MODULES.filter((m) => m.group === g),
  }));

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>SITEEXPENS · TOOLKIT</Text>
          <Text variant="largeTitle">On-site Toolkit</Text>
          <Text variant="meta" color="textMuted" style={styles.heroSub}>
            Quick utility calculators for designers in the field —
            convert units, estimate materials, plan layouts.
          </Text>
        </View>

        {byGroup.map(({ group, items }) => (
          <View key={group} style={styles.groupWrap}>
            <Text style={styles.groupTitle}>{group.toUpperCase()}</Text>
            <View style={styles.grid}>
              {items.map((m) => (
                <ToolCard
                  key={m.key}
                  title={m.title}
                  subtitle={m.subtitle}
                  icon={m.icon}
                  onPress={() => setOpenKey(m.key)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Render every module modal at once — visibility is gated by
          state. React mounts/unmounts the underlying Modal natively. */}
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

function ToolCard({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.cardIconWrap}>
        <Ionicons name={icon} size={20} color={color.primary} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardSub} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
    </Pressable>
  );
}

const GUTTER = 16;

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: color.bg },
  scroll: { paddingTop: 14, paddingBottom: 60 },

  hero: {
    paddingHorizontal: GUTTER,
    paddingBottom: space.md,
    gap: 4,
  },
  heroEyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.4,
  },
  heroSub: { marginTop: 2 },

  groupWrap: {
    marginTop: space.md,
    paddingHorizontal: GUTTER,
    gap: space.xs,
  },
  groupTitle: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    marginBottom: 4,
  },

  grid: {
    gap: 8,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
    borderRadius: radius.sm,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '600',
    color: color.text,
    letterSpacing: -0.1,
  },
  cardSub: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    color: color.textMuted,
    lineHeight: 16,
  },
});
