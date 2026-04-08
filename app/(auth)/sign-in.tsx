/**
 * Sign-in screen. The user enters their phone number (with country code)
 * and taps "Send OTP". We then navigate to the verify screen.
 *
 * IMPORTANT: the current JS SDK phone-auth implementation only works on
 * web. The sign-in screen still renders on native (useful for UI review),
 * but tapping "Send OTP" on native will surface a clear error. Wiring up
 * native phone auth lands in a follow-up PR.
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

import { createWebRecaptchaVerifier, sendOtp } from '@/src/features/auth/phoneAuth';
import { setPendingConfirmation } from '@/src/features/auth/pendingConfirmation';
import { colors } from '@/src/theme/colors';

const RECAPTCHA_CONTAINER_ID = 'recaptcha-container';

export default function SignInScreen() {
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSendOtp() {
    const trimmed = phone.trim();
    if (!trimmed.startsWith('+') || trimmed.length < 8) {
      Alert.alert(
        'Invalid phone number',
        'Enter your phone number in international format, e.g. +919876543210.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const verifier = createWebRecaptchaVerifier(RECAPTCHA_CONTAINER_ID);
      const confirmation = await sendOtp(trimmed, verifier);
      setPendingConfirmation(confirmation);
      router.push('/(auth)/verify');
    } catch (err) {
      Alert.alert('Could not send OTP', (err as Error).message);
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
        <Text style={styles.title}>SiteExpens</Text>
        <Text style={styles.subtitle}>Sign in with your mobile number</Text>

        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 98765 43210"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          autoComplete="tel"
          autoCorrect={false}
          editable={!submitting}
        />

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSendOtp}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.buttonText}>Send OTP</Text>
          )}
        </TouchableOpacity>

        {/* Invisible reCAPTCHA mount point — only used on web. nativeID
            renders as a DOM id when react-native-web is the target. */}
        {Platform.OS === 'web' ? <View nativeID={RECAPTCHA_CONTAINER_ID} /> : null}
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
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
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
