/**
 * Sign-in screen — InteriorOS aesthetic.
 *
 * Layout (top to bottom):
 *   - Hero: SquareMonogram + serif Wordmark + uppercase tagline
 *     (left-aligned, hangs in the upper-left like a magazine masthead)
 *   - GlassCard wrapping the form:
 *       - "SIGN IN TO CONTINUE" small caps
 *       - Phone field with India-flag country chip + 10-digit phone-pad
 *       - Helper "We'll send a 6-digit OTP to verify it's you."
 *       - "Send OTP" primary button
 *       - Terms & Privacy disclaimer (now inside the card)
 *   - HYDERABAD · 2026 stamp footer (provided by AuthChrome)
 *
 * Logic preserved from the previous version:
 *   - Same MSG91 + Firebase custom-token flow via `sendOtp`
 *   - Same `nationalDigitsIndia` digit-strip handling for paste-with-91
 *   - Same dev-bypass via `EXPO_PUBLIC_DEV_LOGIN_PHONE` (in `phoneAuth.ts`)
 *   - Same error states + 10-digit validation
 *
 * The displayed phone is now formatted "98765 43210" (5+5 with a
 * space) for readability — the underlying state still stores the
 * raw 10 digits, and we submit `+91XXXXXXXXXX` unchanged.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { sendOtp } from '@/src/features/auth/phoneAuth';
import { setPendingConfirmation } from '@/src/features/auth/pendingConfirmation';
import { Button } from '@/src/ui/Button';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { AuthChrome } from '@/src/ui/brand/AuthChrome';
import { GlassCard } from '@/src/ui/brand/GlassCard';
import { SquareMonogram } from '@/src/ui/brand/SquareMonogram';
import { Wordmark } from '@/src/ui/brand/Wordmark';
import { color, space } from '@/src/theme';

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

/** Tiny inline India flag for the country-code chip — three
 *  horizontal bands + a hollow chakra disc in the centre. Drawn at
 *  20×14 to sit cleanly next to "+91" without dominating. */
function IndiaFlag() {
  return (
    <Svg width={20} height={14} viewBox="0 0 20 14">
      <Rect width={20} height={4.67} fill="#FF9933" />
      <Rect y={4.67} width={20} height={4.67} fill="#FFFFFF" />
      <Rect y={9.33} width={20} height={4.67} fill="#138808" />
      <Circle cx={10} cy={7} r={1.6} fill="none" stroke="#000080" strokeWidth={0.5} />
    </Svg>
  );
}

export default function SignInScreen() {
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
    <AuthChrome
      hero={
        <View style={styles.heroStack}>
          <SquareMonogram size={48} style={styles.monogram} />
          <Wordmark size="lg" font="serif" align="left" />
        </View>
      }
    >
      <GlassCard>
        <Text variant="meta" color="textFaint" style={styles.sectionLabel}>
          SIGN IN TO CONTINUE
        </Text>

        <TextField
          leading={
            <View style={styles.flagRow}>
              <IndiaFlag />
              <Text style={styles.countryCodeText}>{COUNTRY_CODE}</Text>
            </View>
          }
          value={formatNationalIN(national10)}
          onChangeText={(t) => {
            // Strip non-digits + any leading "91" the user pasted.
            // Cap at 10 digits — formatting is purely cosmetic, the
            // underlying state stays as raw digits.
            let d = t.replace(/\D/g, '');
            while (d.length > 10 && d.startsWith('91')) d = d.slice(2);
            d = d.slice(0, 10);
            setPhone(d);
            if (error) setError(undefined);
          }}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          autoCorrect={false}
          maxLength={11 /* 5 + space + 5 */}
          editable={!submitting}
          error={error}
          returnKeyType="done"
          onSubmitEditing={handleSendOtp}
          surface
          strongBorder
        />
        <Text variant="meta" color="textMuted" style={styles.helper}>
          We'll send a 6-digit OTP to verify it's you.
        </Text>

        <Button
          label="Send OTP"
          onPress={handleSendOtp}
          loading={submitting}
          disabled={!canSubmit}
          style={styles.cta}
        />

        <Text variant="caption" color="textFaint" align="center" style={styles.terms}>
          By continuing you agree to our Terms &amp; Privacy Policy.
        </Text>
      </GlassCard>
    </AuthChrome>
  );
}

const styles = StyleSheet.create({
  heroStack: {
    alignItems: 'flex-start',
  },
  monogram: {
    marginBottom: space.md,
  },
  sectionLabel: {
    letterSpacing: 1,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: space.md,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countryCodeText: {
    color: color.text,
    fontSize: 16,
    fontWeight: '500',
  },
  helper: {
    marginTop: space.sm,
  },
  cta: {
    marginTop: space.md,
  },
  terms: {
    marginTop: space.md,
  },
});
