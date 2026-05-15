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
 */
import { StyleSheet, type ViewStyle } from 'react-native';

/** Resting card on bg. Almost no shadow — relies on the hairline border. */
export const restingShadow = (mode: 'light' | 'dark'): ViewStyle =>
  mode === 'light'
    ? {
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
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
        elevation: 2,
      }
    : {
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
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
