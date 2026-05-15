/**
 * OTP verification — clean white field with line-art InteriorScene.
 *
 * Foreground (top → bottom):
 *   • Plain back chevron (no frosted chrome — matches the new flat look)
 *   • Serif "Verify OTP" title
 *   • Masked phone subtitle
 *   • Six-box OTP input
 *   • Blue pill "Verify & continue" CTA
 *   • 30-second resend countdown / link
 *   • "★ #1 App for Interior Designers" trust tagline
 *
 * Logic preserved:
 *   - Auto-focus on mount (handled by OtpDigits' `autoFocus`)
 *   - Digit-only input, max 6
 *   - SMS auto-fill on iOS + Android (handled inside OtpDigits)
 *   - 30-second resend countdown
 *   - "Resend" routes back to sign-in (clears pendingConfirmation)
 *   - `confirmOtp` + Firebase custom-token sign-in
 *   - Session-expired error when no pending confirmation
 *   - Auto-submit when six digits are entered
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path as SvgPath } from 'react-native-svg';

import { confirmOtp } from '@/src/features/auth/phoneAuth';
import {
  getPendingConfirmation,
  setPendingConfirmation,
} from '@/src/features/auth/pendingConfirmation';
import { OtpDigits } from '@/src/ui/OtpDigits';

import { InteriorScene } from '@/src/ui/brand/InteriorScene';
import { AppearOnMount } from '@/src/ui/v2/AppearOnMount';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const RESEND_SECONDS = 30;
const SERIF_FAMILY = Platform.select({ ios: 'Iowan Old Style', default: 'serif' });
const TRUST_RED = '#E63946';

/** Inline filled star — used by the trust tagline. */
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

export default function VerifyScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = params.phone ?? '';

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const canSubmit = code.length === 6 && !submitting;

  async function handleVerify(codeOverride?: string) {
    setError(undefined);
    const c = codeOverride ?? code;
    const confirmation = getPendingConfirmation();
    if (!confirmation) {
      setError('Session expired — please request a new code.');
      return;
    }
    if (c.length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmOtp(confirmation, c);
      setPendingConfirmation(null);
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    setPendingConfirmation(null);
    router.back();
  }

  // Format the phone for display: "+91 98765 43210" reads better
  // than the raw E.164 string. Splits at 5+5 for Indian mobile.
  const displayPhone = (() => {
    const raw = phone.replace(/^\+91/, '').replace(/\D/g, '');
    if (raw.length === 10) return `+91 ${raw.slice(0, 5)} ${raw.slice(5)}`;
    return phone || 'your number';
  })();

  return (
    <View style={styles.root}>
      <InteriorScene />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 24,
            },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.column}>
            {/* Plain back chevron — flat to match the new white aesthetic */}
            <AppearOnMount rise={4}>
              <Pressable
                onPress={handleBack}
                disabled={submitting}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.backBtn,
                  pressed && { opacity: 0.7 },
                  submitting && { opacity: 0.5 },
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={22}
                  color="rgba(0,0,0,0.92)"
                />
              </Pressable>
            </AppearOnMount>

            <View style={{ height: 36 }} />

            {/* Flat content — no card */}
            <AppearOnMount delay={120} rise={18}>
              <Text style={styles.title}>Verify OTP</Text>
              <Text variant="footnote" style={styles.subtitle}>
                Enter the 6-digit code sent to{'\n'}
                <Text variant="footnote" style={styles.subtitleBold}>
                  {displayPhone}
                </Text>
              </Text>

              <View style={styles.otpWrap}>
                <OtpDigits
                  value={code}
                  onChange={(next) => {
                    setCode(next);
                    if (error) setError(undefined);
                  }}
                  onComplete={(full) => handleVerify(full)}
                  error={!!error}
                  disabled={submitting}
                />
              </View>

              {error ? (
                <Text variant="caption2" style={styles.errorText}>
                  {error}
                </Text>
              ) : null}

              <Pressable
                onPress={() => void handleVerify()}
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
                    <Text style={styles.ctaText}>Verify &amp; continue</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={16}
                      color="#fff"
                      style={{ marginLeft: 8 }}
                    />
                  </>
                )}
              </Pressable>

              {/* Resend */}
              <View style={styles.resendRow}>
                {secondsLeft > 0 ? (
                  <Text variant="footnote" style={styles.resendText}>
                    Didn't receive it?{' '}
                    <Text variant="footnote" style={styles.resendCountdown}>
                      Resend in {secondsLeft}s
                    </Text>
                  </Text>
                ) : (
                  <Pressable onPress={handleBack} hitSlop={8}>
                    <Text variant="footnote" style={styles.resendCta}>
                      Resend OTP
                    </Text>
                  </Pressable>
                )}
              </View>
            </AppearOnMount>
          </View>

          {/* Bottom trust footer — pinned to the bottom via the
              scroll's `justifyContent: 'space-between'` */}
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

  // Back button — flat, no chrome
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginLeft: -6,
  },

  title: {
    fontFamily: SERIF_FAMILY,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: 'rgba(0,0,0,0.92)',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(60,60,67,0.6)',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 22,
  },
  subtitleBold: {
    color: 'rgba(0,0,0,0.92)',
    fontWeight: '700',
  },

  otpWrap: {
    marginTop: 4,
  },

  errorText: {
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 12,
  },

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

  resendRow: {
    alignItems: 'center',
    paddingTop: 14,
  },
  resendText: {
    color: 'rgba(60,60,67,0.6)',
  },
  resendCountdown: {
    color: 'rgba(60,60,67,0.4)',
    fontWeight: '600',
  },
  resendCta: {
    color: '#0A84FF',
    fontWeight: '700',
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
