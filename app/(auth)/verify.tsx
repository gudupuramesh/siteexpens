/**
 * OTP verification screen — InteriorOS aesthetic.
 *
 * Layout (top to bottom):
 *   - Small back-button (rounded square, top-left) — wires to
 *     `router.back()` (also clears the pending confirmation).
 *   - GlassCard centred vertically with:
 *       - "Verify OTP" serif h2
 *       - Subtitle "Enter the 6-digit code sent to" + bold phone
 *       - <OtpDigits /> — 6 boxes, auto-advance + paste support
 *       - "Verify & Continue" primary button
 *       - Resend row: "Didn't receive it? Resend in {n}s" → tappable
 *         "Resend OTP" once the 30s timer hits 0
 *   - HYDERABAD · 2026 stamp footer (provided by AuthChrome)
 *
 * Logic preserved from the previous version:
 *   - Auto-focus on mount (handled by OtpDigits' `autoFocus`)
 *   - Digit-only input, max 6
 *   - SMS auto-fill on iOS + Android (handled inside OtpDigits)
 *   - 30-second resend countdown
 *   - "Resend" routes back to sign-in (same flow as before)
 *   - `confirmOtp` + Firebase custom-token sign-in
 *   - Session-expired error when no pending confirmation
 *
 * Auto-submit when six digits are entered — saves the user from
 * tapping the button after typing/pasting the code.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { confirmOtp } from '@/src/features/auth/phoneAuth';
import {
  getPendingConfirmation,
  setPendingConfirmation,
} from '@/src/features/auth/pendingConfirmation';
import { Button } from '@/src/ui/Button';
import { OtpDigits } from '@/src/ui/OtpDigits';
import { Text } from '@/src/ui/Text';
import { AuthChrome } from '@/src/ui/brand/AuthChrome';
import { GlassCard } from '@/src/ui/brand/GlassCard';
import { color, space } from '@/src/theme';

const RESEND_SECONDS = 30;
const SERIF_FAMILY = Platform.select({ ios: 'Iowan Old Style', default: 'serif' });

export default function VerifyScreen() {
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
    <AuthChrome
      hero={
        <Pressable
          onPress={handleBack}
          disabled={submitting}
          hitSlop={8}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
            <Path
              d="M11 4L6 9l5 5"
              stroke={color.text}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      }
    >
      <GlassCard padding={{ vertical: 32, horizontal: 24 }}>
        <Text style={styles.title}>Verify OTP</Text>
        <Text variant="meta" color="textMuted" style={styles.subtitle}>
          Enter the 6-digit code sent to{'\n'}
          <Text variant="bodyStrong" color="text">
            {displayPhone}
          </Text>
        </Text>

        <OtpDigits
          value={code}
          onChange={(next) => {
            setCode(next);
            if (error) setError(undefined);
          }}
          onComplete={(full) => handleVerify(full)}
          error={!!error}
          disabled={submitting}
          style={styles.otp}
        />

        {error ? (
          <Text variant="caption" color="danger" align="center" style={styles.errorText}>
            {error}
          </Text>
        ) : null}

        <Button
          label="Verify & Continue"
          onPress={() => handleVerify()}
          loading={submitting}
          disabled={!canSubmit}
          style={styles.cta}
        />

        <View style={styles.resend}>
          {secondsLeft > 0 ? (
            <Text variant="meta" color="textMuted">
              Didn't receive it?{' '}
              <Text variant="metaStrong" color="textFaint">
                Resend in {secondsLeft}s
              </Text>
            </Text>
          ) : (
            <Pressable onPress={handleBack} hitSlop={8}>
              <Text variant="metaStrong" color="primary">
                Resend OTP
              </Text>
            </Pressable>
          )}
        </View>
      </GlassCard>
    </AuthChrome>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  title: {
    fontFamily: SERIF_FAMILY,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: color.text,
    textAlign: 'center',
    marginBottom: space.xs,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: space.xl,
  },
  otp: {
    marginBottom: space.md,
  },
  errorText: {
    marginTop: space.xs,
    marginBottom: space.xs,
  },
  cta: {
    marginTop: space.sm,
  },
  resend: {
    marginTop: space.md,
    alignItems: 'center',
  },
});
