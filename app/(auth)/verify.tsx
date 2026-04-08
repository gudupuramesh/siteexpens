/**
 * OTP verification screen. Reads the pending `ConfirmationResult` stashed
 * by the sign-in screen and asks the user for the 6-digit code.
 *
 * On successful verification, AuthProvider picks up the state change and
 * the root redirect sends the user to /(app).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { confirmOtp } from '@/src/features/auth/phoneAuth';
import {
  getPendingConfirmation,
  setPendingConfirmation,
} from '@/src/features/auth/pendingConfirmation';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { space } from '@/src/theme';

const RESEND_SECONDS = 30;

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = params.phone ?? '';
  const inputRef = useRef<TextInput>(null);

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  // Auto-focus the OTP field on mount.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // Resend countdown.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const canSubmit = code.length === 6 && !submitting;

  async function handleVerify() {
    setError(undefined);
    const confirmation = getPendingConfirmation();
    if (!confirmation) {
      setError('Session expired — please request a new code.');
      return;
    }
    if (code.length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmOtp(confirmation, code);
      setPendingConfirmation(null);
      // Root redirect will move us to /(app) once onAuthStateChanged fires.
      router.replace('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleChangeNumber() {
    setPendingConfirmation(null);
    router.back();
  }

  return (
    <Screen bg="plain">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <Text variant="largeTitle" color="text">
            Enter code
          </Text>
          <View style={styles.subtitleRow}>
            <Text variant="body" color="textMuted">
              Sent to {phone || 'your number'}
            </Text>
            <Text
              variant="metaStrong"
              color="primary"
              style={styles.changeLink}
              onPress={handleChangeNumber}
            >
              Change
            </Text>
          </View>

          <View style={styles.field}>
            <TextField
              ref={inputRef}
              label="6-digit code"
              value={code}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
                if (error) setError(undefined);
              }}
              placeholder="000000"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              autoCorrect={false}
              maxLength={6}
              editable={!submitting}
              error={error}
              returnKeyType="done"
              onSubmitEditing={handleVerify}
            />
          </View>

          <Button
            label="Verify"
            onPress={handleVerify}
            loading={submitting}
            disabled={!canSubmit}
          />

          <View style={styles.resend}>
            {secondsLeft > 0 ? (
              <Text variant="meta" color="textMuted">
                Resend code in {secondsLeft}s
              </Text>
            ) : (
              <Button
                variant="text"
                label="Resend code"
                onPress={() => {
                  // Resend flow goes back to sign-in for now; full resend
                  // (without retyping the number) lands in a follow-up PR.
                  handleChangeNumber();
                }}
              />
            )}
          </View>
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
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.md,
    marginBottom: space.xxl,
  },
  changeLink: {
    marginLeft: space.md,
  },
  field: {
    marginBottom: space.xl,
  },
  resend: {
    marginTop: space.lg,
    alignItems: 'center',
  },
});
