/**
 * Sign-in — clean white field with line-art InteriorScene at the bottom.
 *
 * Foreground (top → bottom):
 *   • Magazine-style brand hero — left-aligned monogram + serif wordmark
 *   • Flat phone field (iOS pill with India flag chip) — no card chrome
 *   • Blue pill "Send OTP →" CTA
 *   • "★ #1 App for Interior Designers" trust tagline
 *   • Tiny "Terms / Privacy Policy" legal footer
 *
 * The frosted-glass card is gone — the InteriorScene is now a quiet
 * line drawing on pure white, so the form sits directly on it without
 * needing its own surface.
 *
 * Logic preserved:
 *   - MSG91 + Firebase custom-token flow via `sendOtp`
 *   - `nationalDigitsIndia` digit-strip handling for paste-with-91
 *   - Dev-bypass via `EXPO_PUBLIC_DEV_LOGIN_PHONE` (in `phoneAuth.ts`)
 *   - 10-digit validation + error states
 *   - Display formatted "98765 43210"; submit is `+91XXXXXXXXXX`
 */
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path as SvgPath, Rect } from 'react-native-svg';

import { sendOtp } from '@/src/features/auth/phoneAuth';
import { setPendingConfirmation } from '@/src/features/auth/pendingConfirmation';

import { InteriorScene } from '@/src/ui/brand/InteriorScene';
import { Wordmark } from '@/src/ui/brand/Wordmark';

// Real InteriorOS app icon (the same PNG that ships in the bundle).
const APP_ICON = require('../../assets/images/icon.png');
import { AppearOnMount } from '@/src/ui/v2/AppearOnMount';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const COUNTRY_CODE = '+91';
const TRUST_RED = '#E63946';

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

/** Filled star glyph used by the trust tagline. Inline SVG keeps the
 *  red consistent across themes without pulling in an icon dependency. */
function StarGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <SvgPath
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={TRUST_RED}
      />
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
      {/* White-field line-art interior scene (bottom-anchored) */}
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
          {/* Two top-level blocks — `justifyContent: 'space-between'`
              on the scroll puts the brand+form column at the top and
              the trust footer at the bottom. The brand-to-form gap is
              controlled by `hero.marginBottom` so the logo and the
              phone field sit close together as one visual unit. */}

          <View style={styles.column}>
            {/* Centered brand hero — app icon + serif wordmark */}
            <AppearOnMount rise={10}>
              <View style={styles.hero}>
                <Image
                  source={APP_ICON}
                  style={styles.appIcon}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                <Wordmark size="lg" font="serif" align="center" showTagline={false} />
              </View>
            </AppearOnMount>

            {/* Form — phone, terms (right under the number), CTA */}
            <AppearOnMount delay={140} rise={18}>
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

            {/* Terms — sits right under the phone number, contextual
                to the action the user is about to take */}
            <Text style={styles.terms}>
              By continuing you agree to our{' '}
              <Text style={styles.termsLink}>Terms</Text>{' '}
              &amp;{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>.
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
          </AppearOnMount>
          </View>

          {/* Bottom: trust block (★ #1 + Trusted by …) */}
          <AppearOnMount delay={260} rise={6} style={styles.footer}>
            <View style={styles.trustRow}>
              <StarGlyph />
              <Text style={styles.trustText}>
                #1 App for Interior Designers
              </Text>
            </View>
            <Text style={styles.trustedBy}>
              Trusted by 10,000+ designers across India
            </Text>
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
    // Column floats up, footer hugs the bottom of the screen
    justifyContent: 'space-between',
  },
  column: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },

  // Centered brand hero — app icon stacked above the wordmark.
  // Tight gap to the form (logo + phone field read as one unit).
  hero: {
    alignItems: 'center',
    marginBottom: 36,
  },
  appIcon: {
    width: 64,
    height: 64,
    // iOS app-icon corner radius is ~22.37% of width — round shape
    // matches what the user sees on the home screen.
    borderRadius: 14,
    marginBottom: 14,
    // Subtle lift so the icon doesn't feel pasted onto the white field.
    // (No `overflow: 'hidden'` — that would clip the shadow on iOS;
    // <Image> with borderRadius already rounds the corners natively.)
    shadowColor: '#0E5BA8',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
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

  // CTA
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    marginTop: 16,
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

  // Terms — directly under the phone field
  terms: {
    color: 'rgba(60,60,67,0.55)',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
  },
  termsLink: {
    color: '#0A84FF',
    fontWeight: '600',
  },

  // Bottom trust footer (★ #1 App + Trusted by …)
  footer: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 4,
    gap: 4,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '600',
    color: TRUST_RED,
    letterSpacing: 0.2,
  },
  trustedBy: {
    fontSize: 11,
    color: 'rgba(60,60,67,0.55)',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
