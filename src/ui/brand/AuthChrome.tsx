/**
 * AuthChrome — wrapper for sign-in + OTP-verify screens.
 *
 * The InteriorOS auth aesthetic: a full-bleed interior illustration
 * sits behind everything (`<InteriorScene/>`), the form floats over
 * it inside a glass card, and the brand block hangs in the upper
 * left like a magazine masthead. The footer carries the studio
 * stamp.
 *
 * Layout slots:
 *
 *   ┌───────────────────────────────────────┐  ← <InteriorScene/>
 *   │ ┌─────────╮                           │
 *   │ │  hero   │  ← left-aligned brand     │
 *   │ ╰─────────┘                           │
 *   │                                       │
 *   │      ┌──────────────────────────┐     │
 *   │      │       form / body        │     │  ← children (glass card)
 *   │      └──────────────────────────┘     │
 *   │                                       │
 *   │            HYDERABAD · 2026           │  ← <Stamp/>
 *   └───────────────────────────────────────┘
 *
 * Keyboard handling: `KeyboardAvoidingView` (padding on iOS, height
 * on Android) so the form pushes up cleanly instead of getting
 * hidden behind the keyboard. `ScrollView` + `keyboardShouldPersistTaps`
 * so taps on buttons inside the column don't dismiss the keyboard.
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, space } from '@/src/theme';

import { InteriorScene } from './InteriorScene';
import { TrustBadge } from './TrustBadge';

export type AuthChromeProps = {
  /** The hero block (square monogram + serif wordmark + tagline).
   *  Sits up top, left-aligned. Pass `null` on screens that don't
   *  want a hero (the OTP verify screen uses just a back button). */
  hero?: ReactNode;
  /** The form body — text fields, buttons, helper text. */
  children: ReactNode;
  /** Show the trust badge footer. Default true. */
  showStamp?: boolean;
};

export function AuthChrome({ hero, children, showStamp = true }: AuthChromeProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <InteriorScene />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 72, paddingBottom: insets.bottom + space.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            {hero ? <View style={styles.hero}>{hero}</View> : null}
            <View style={styles.body}>{children}</View>
          </View>
          {showStamp ? (
            <View style={styles.footer}>
              <TrustBadge />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  column: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  hero: {
    alignItems: 'flex-start',
    marginBottom: 48,
  },
  body: {
    width: '100%',
  },
  footer: {
    alignItems: 'center',
    paddingTop: space.xl,
  },
});
