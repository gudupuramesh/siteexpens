/**
 * Sign-in screen. The user enters their phone number and taps "Send code".
 * On success we navigate to the verify screen.
 *
 * Phone OTP is delivered by `@react-native-firebase/auth`, which handles
 * Play Integrity (Android) / silent APNs (iOS) internally. A custom dev
 * client (not Expo Go) is required.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import { sendOtp } from '@/src/features/auth/phoneAuth';
import { setPendingConfirmation } from '@/src/features/auth/pendingConfirmation';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { space } from '@/src/theme';

const COUNTRY_CODE = '+91';

export default function SignInScreen() {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const digits = phone.replace(/\D/g, '');
  const canSubmit = digits.length >= 10 && !submitting;

  async function handleSendOtp() {
    setError(undefined);
    if (digits.length < 10) {
      setError('Enter a 10-digit mobile number');
      return;
    }
    const e164 = `${COUNTRY_CODE}${digits}`;

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
    <Screen bg="plain">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <Text variant="largeTitle" color="text">
            Sign in
          </Text>
          <Text variant="body" color="textMuted" style={styles.subtitle}>
            We&apos;ll text you a 6-digit code to verify your number.
          </Text>

          <View style={styles.field}>
            <TextField
              label="Mobile number"
              leading={COUNTRY_CODE}
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (error) setError(undefined);
              }}
              placeholder="98765 43210"
              keyboardType="phone-pad"
              autoComplete="tel"
              autoCorrect={false}
              maxLength={12}
              editable={!submitting}
              error={error}
              returnKeyType="done"
              onSubmitEditing={handleSendOtp}
            />
          </View>

          <Button
            label="Send code"
            onPress={handleSendOtp}
            loading={submitting}
            disabled={!canSubmit}
          />
        </View>

        <View style={styles.footer}>
          <Text variant="caption" color="textFaint" align="center">
            By continuing you agree to our Terms &amp; Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: space.md,
    marginBottom: space.xxl,
  },
  field: {
    marginBottom: space.xl,
  },
  footer: {
    paddingBottom: space.lg,
  },
});
