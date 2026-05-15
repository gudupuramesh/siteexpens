/**
 * v2 theme entry point. Exposes `useThemeV2()` hook + token re-exports
 * so consumers do `import { useThemeV2 } from '@/src/theme/v2';`.
 *
 * Theme is driven by `useColorScheme()` (React Native's native API). NO
 * `if (dark)` branches in screens — components consume `useThemeV2()`
 * and render the right token automatically.
 */
import { useColorScheme } from 'react-native';

import {
  ambient,
  dark,
  light,
  palette,
  statusColors,
  type AmbientSet,
  type StatusToneSet,
  type V2Colors,
} from './colors';
import { typeRamp, tabularVariants } from './typography';
import { region, space } from './spacing';
import { radii } from './radii';
import { glassShadow, hairline, liftedShadow, restingShadow } from './shadows';

export { palette, statusColors, ambient } from './colors';
export type { StatusKey, V2Colors, StatusTone, StatusToneSet, AmbientStop, AmbientSet } from './colors';
export { typeRamp, tabularVariants } from './typography';
export type { TypeVariant } from './typography';
export { space, region } from './spacing';
export { radii } from './radii';
export { glassShadow, hairline, liftedShadow, restingShadow } from './shadows';
export { inrCompact, inrFull } from './inr';

export type ThemeMode = 'light' | 'dark';

export type ThemeV2 = {
  mode: ThemeMode;
  colors: V2Colors;
  palette: typeof palette;
  statusColors: StatusToneSet;
  ambient: AmbientSet;
  type: typeof typeRamp;
  tabularVariants: typeof tabularVariants;
  space: typeof space;
  region: typeof region;
  radii: typeof radii;
  hairline: typeof hairline;
  shadows: {
    resting: ReturnType<typeof restingShadow>;
    lifted: ReturnType<typeof liftedShadow>;
    glass: ReturnType<typeof glassShadow>;
  };
};

/**
 * Read the active theme. Re-renders consumers when the system color
 * scheme flips (Control Center → Dark Mode toggle).
 */
export function useThemeV2(): ThemeV2 {
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'dark' ? 'dark' : 'light';
  const colors = mode === 'dark' ? dark : light;
  return {
    mode,
    colors,
    palette,
    statusColors: statusColors[mode],
    ambient: ambient[mode],
    type: typeRamp,
    tabularVariants,
    space,
    region,
    radii,
    hairline,
    shadows: {
      resting: restingShadow(mode),
      lifted: liftedShadow(mode),
      glass: glassShadow(mode),
    },
  };
}
