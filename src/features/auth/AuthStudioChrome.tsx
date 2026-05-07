/**
 * Studio OTP screen chrome: gradient backdrop + white elevated card
 * (matches `OTPLoginForm` layout: gradient page, centered card, footer below card).
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { radius, screenInset, shadow } from '@/src/theme';

import { studioAuth } from './studioAuth';

export type AuthStudioChromeProps = {
  children: ReactNode;
  footer?: ReactNode;
  cardStyle?: ViewStyle;
};

export function AuthStudioChrome({
  children,
  footer,
  cardStyle,
}: AuthStudioChromeProps) {
  return (
    <LinearGradient
      colors={[...studioAuth.gradient]}
      locations={[0, 0.42, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.center}>
              <View style={[styles.card, shadow.lg, cardStyle]}>{children}</View>
              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: 16,
  },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 320,
  },
  card: {
    backgroundColor: studioAuth.card,
    borderRadius: radius.xl,
    padding: 24,
  },
  footer: {
    marginTop: 20,
    paddingBottom: 8,
  },
});
