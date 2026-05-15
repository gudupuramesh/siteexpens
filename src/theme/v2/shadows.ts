/**
 * v2 elevation recipes — DESIGN.md §2.5.
 *
 * Depth comes from STROKE + TINT + BLUR, not drop shadows.
 *
 * RN doesn't support CSS `box-shadow` directly; we map each web recipe
 * to RN's iOS shadow* properties + Android `elevation`. Hairline borders
 * use `StyleSheet.hairlineWidth` and an explicit border color in light
 * mode (subtle inset glow in dark mode is approximated via a lighter
 * border).
 *
 * **Android elevation policy.** Android renders `elevation` via a
 * hardware shadow (RenderNode) that flickers / re-rasterises during
 * transitions — most visibly when swiping between tabs (LeadCard,
 * KpiCard, StudioProfileCard, project rows, etc.). Since the design
 * intent is hairline-border-driven depth and the iOS shadow is already
 * almost invisible (`shadowOpacity: 0.03`), we set `elevation: 0` on
 * Android for `resting` and `lifted`. iOS keeps its subtle drop
 * shadow; Android relies on the hairline border + surface tint to read
 * as a card. `glass` (the floating tab bar) keeps its elevation
 * because that surface doesn't move during transitions.
 */
import { Platform, StyleSheet, type ViewStyle } from 'react-native';

const isAndroid = Platform.OS === 'android';

/** Resting card on bg. Almost no shadow — relies on the hairline border. */
export const restingShadow = (mode: 'light' | 'dark'): ViewStyle =>
  mode === 'light'
    ? {
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        // Android: skip elevation to avoid transition shadow artefacts.
        elevation: isAndroid ? 0 : 1,
      }
    : {
        // dark mode resting cards rely on a subtle inner highlight
        // (handled via borderColor on the consuming component)
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
      };

/** Lifted card (hero, sheet). */
export const liftedShadow = (mode: 'light' | 'dark'): ViewStyle =>
  mode === 'light'
    ? {
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        // Android: skip elevation here too — same flicker pattern.
        elevation: isAndroid ? 0 : 2,
      }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: isAndroid ? 0 : 4,
      };

/** Liquid-glass surface (nav pill, tab bar). Used UNDER a <BlurView>. */
export const glassShadow = (mode: 'light' | 'dark'): ViewStyle =>
  mode === 'light'
    ? {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
      };

/** Hairline border helper. Use as `borderWidth: hairline` and pair
 *  with the appropriate separator/border color from `useThemeV2()`. */
export const hairline = StyleSheet.hairlineWidth;
