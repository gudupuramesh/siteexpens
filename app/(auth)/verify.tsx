/**
 * OTP verification screen. Reads the pending `ConfirmationResult` stashed
 * by the sign-in screen and asks the user for the 6-digit code.
 *
 * On successful verification, AuthProvider picks up the state change and
 * the root redirect sends the user to /(app).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { confirmOtp } from '@/src/features/auth/phoneAuth';
import {
  getPendingConfirmation,
  setPendingConfirmation,
} from '@/src/features/auth/pendingConfirmation';
import { colors } from '@/src/theme/colors';

export default function VerifyScreen() {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleVerify() {
    const confirmation = getPendingConfirmation();
    if (!confirmation) {
      Alert.alert('Session expired', 'Please enter your phone number again.');
      router.replace('/(auth)/sign-in');
      return;
    }

    if (code.trim().length < 4) {
      Alert.alert('Invalid code', 'Enter the 6-digit code we sent you.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmOtp(confirmation, code.trim());
      setPendingConfirmation(null);
      // Root redirect will move us to /(app) once onAuthStateChanged fires.
      router.replace('/');
    } catch (err) {
      Alert.alert('Verification failed', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Enter OTP</Text>
        <Text style={styles.subtitle}>We sent a 6-digit code to your phone</Text>

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="sms-otp"
          autoCorrect={false}
          editable={!submitting}
        />

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    letterSpacing: 4,
    color: colors.text,
    backgroundColor: colors.surface,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: '600',
  },
});
