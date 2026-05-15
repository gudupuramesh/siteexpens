/**
 * Sign-in — restored InteriorScene background, iOS 26 styled card.
 *
 * Background: full-bleed `<InteriorScene/>` illustration (the herringbone
 * floor + window + plant scene that gives the auth flow its identity).
 *
 * Foreground: a frosted `<BlurView>` glass card holding an iOS-style
 * grouped form — uppercase eyebrow label, big rounded country-chip +
 * phone field, helper line, full-width pill CTA, terms footer.
 *
 * Logic preserved from the previous version:
 *   - Same MSG91 + Firebase custom-token flow via `sendOtp`
 *   - Same `nationalDigitsIndia` digit-strip handling for paste-with-91
 *   - Same dev-bypass via `EXPO_PUBLIC_DEV_LOGIN_PHONE` (in `phoneAuth.ts`)
 *   - Same error states + 10-digit validation
 *   - Display still formatted "98765 43210"; submit is `+91XXXXXXXXXX`
 */
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Rect } from 'react-native-svg';

import { sendOtp } from '@/src/features/auth/phoneAuth';
import { setPendingConfirmation } from '@/src/features/auth/pendingConfirmation';

import { InteriorScene } from '@/src/ui/brand/InteriorScene';
import { SquareMonogram } from '@/src/ui/brand/SquareMonogram';
import { Wordmark } from '@/src/ui/brand/Wordmark';
import { TrustBadge } from '@/src/ui/brand/TrustBadge';
import { AppearOnMount } from '@/src/ui/v2/AppearOnMount';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const COUNTRY_CODE = '+91';

/** User may type/paste `91XXXXXXXXXX` while the field already shows
 *  `+91`. Strip repeated `91` prefixes until we have 10 digits. */
function nationalDigitsIndia(rawDigits: string): string {
  let d = rawDigits.replace(/\D/g, '');
  while (d.length > 10 && d.startsWith('91')) {
    d = d.slice(2);
  }
  return d;
}

/** Render 10 digits as "98765 43210" — empty-safe (returns the
 *  partial string if fewer than 10 digits have been typed). */
function formatNationalIN(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

/** Tiny inline India flag for the country-code chip. */
function IndiaFlag() {
  return (
    <Svg width={18} height={13} viewBox="0 0 20 14">
      <Rect width={20} height={4.67} fill="#FF9933" />
      <Rect y={4.67} width={20} height={4.67} fill="#FFFFFF" />
      <Rect y={9.33} width={20} height={4.67} fill="#138808" />
      <Circle cx={10} cy={7} r={1.6} fill="none" stroke="#000080" strokeWidth={0.5} />
    </Svg>
  );
}

export default function SignInScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const digits = phone.replace(/\D/g, '');
  const national10 = nationalDigitsIndia(digits);
  const canSubmit = national10.length === 10 && !submitting;

  async function handleSendOtp() {
    setError(undefined);
    if (national10.length !== 10) {
      setError('Enter a 10-digit mobile number');
      return;
    }
    const e164 = `${COUNTRY_CODE}${national10}`;

    setSubmitting(true);
    try {
      const confirmation = await sendOtp(e164);
      setPendingConfirmation(confirmation);
      router.push({ pathname: '/(auth)/verify', params: { phone: e164 } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      {/* Full-bleed brand illustration */}
      <InteriorScene />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + 56,
              paddingBottom: insets.bottom + 24,
            },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Magazine-style hero — left-aligned monogram + serif wordmark.
              SquareMonogram's `animated` mode draws the outer ring on
              mount, giving the splash a subtle premium reveal. */}
          <View style={styles.column}>
            <AppearOnMount rise={10}>
              <View style={styles.hero}>
                <SquareMonogram
                  size={48}
                  animated
                  ringDelay={140}
                  style={styles.monogram}
                />
                <Wordmark size="lg" font="serif" align="left" />
              </View>
            </AppearOnMount>

            {/* iOS-style glass card — staggered after the hero */}
            <AppearOnMount delay={140} rise={18} style={styles.cardShell}>
              <BlurView
                intensity={24}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cardOverlay} pointerEvents="none" />

              <View style={styles.cardBody}>
                <Text
                  variant="caption2"
                  style={styles.eyebrow}
                >
                  SIGN IN TO CONTINUE
                </Text>

                {/* Phone field — country chip + input */}
                <View
                  style={[
                    styles.phoneField,
                    {
                      borderColor: error ? '#FF3B30' : 'rgba(0,0,0,0.08)',
                      borderWidth: error ? 1.5 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={styles.countryChip}>
                    <IndiaFlag />
                    <Text style={styles.countryCodeText}>
                      {COUNTRY_CODE}
                    </Text>
                  </View>
                  <View style={styles.divider} />
                  <TextInput
                    value={formatNationalIN(national10)}
                    onChangeText={(tx) => {
                      let d = tx.replace(/\D/g, '');
                      while (d.length > 10 && d.startsWith('91')) d = d.slice(2);
                      d = d.slice(0, 10);
                      setPhone(d);
                      if (error) setError(undefined);
                    }}
                    placeholder="98765 43210"
                    placeholderTextColor="rgba(60,60,67,0.36)"
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    autoCorrect={false}
                    maxLength={11 /* 5 + space + 5 */}
                    editable={!submitting}
                    returnKeyType="done"
                    onSubmitEditing={() => void handleSendOtp()}
                    style={styles.phoneInput}
                  />
                </View>

                {error ? (
                  <Text variant="caption2" style={styles.errorText}>
                    {error}
                  </Text>
                ) : null}

                <Text variant="footnote" style={styles.helper}>
                  We'll send a 6-digit OTP to verify it's you.
                </Text>

                <Pressable
                  onPress={() => void handleSendOtp()}
                  disabled={!canSubmit}
                  style={({ pressed }) => [
                    styles.cta,
                    {
                      backgroundColor: t.palette.blue.base,
                    },
                    pressed && { opacity: 0.85 },
                    !canSubmit && { opacity: 0.5 },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.ctaText}>Send OTP</Text>
                      <Ionicons
                        name="arrow-forward"
                        size={16}
                        color="#fff"
                        style={{ marginLeft: 8 }}
                      />
                    </>
                  )}
                </Pressable>

                <Text style={styles.terms}>
                  By continuing you agree to our{' '}
                  <Text style={styles.termsLink}>Terms</Text>{' '}
                  &amp;{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>.
                </Text>
              </View>
            </AppearOnMount>
          </View>

          {/* Footer trust stamp — staggered last */}
          <AppearOnMount delay={300} rise={6}>
            <View style={styles.footer}>
              <TrustBadge />
            </View>
          </AppearOnMount>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  column: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },

  // Hero
  hero: {
    alignItems: 'flex-start',
    marginBottom: 40,
  },
  monogram: { marginBottom: 16 },

  // Glass card
  cardShell: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  cardBody: {
    position: 'relative',
    paddingHorizontal: 22,
    paddingVertical: 26,
  },
  eyebrow: {
    color: 'rgba(60,60,67,0.6)',
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },

  // Phone field — iOS pill with country chip on the left
  phoneField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(118,118,128,0.06)',
    borderRadius: 14,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    minHeight: 54,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
  },
  countryCodeText: {
    color: 'rgba(0,0,0,0.92)',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 6,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
    backgroundColor: 'rgba(0,0,0,0.12)',
    marginHorizontal: 10,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.92)',
    letterSpacing: 0.4,
    paddingVertical: 0,
    margin: 0,
  },

  errorText: {
    color: '#FF3B30',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  helper: {
    color: 'rgba(60,60,67,0.6)',
    marginTop: 14,
    textAlign: 'center',
  },

  // CTA
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    marginTop: 18,
    shadowColor: '#0A84FF',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: -0.2,
  },

  // Terms
  terms: {
    color: 'rgba(60,60,67,0.5)',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 14,
  },
  termsLink: {
    color: '#0A84FF',
    fontWeight: '600',
  },

  footer: {
    alignItems: 'center',
    paddingTop: 28,
  },
});
