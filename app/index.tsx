/**
 * Entry redirect. Decides where the user should land based on auth +
 * onboarding state:
 *   - still checking            -> centered spinner
 *   - signed out                -> /(auth)/sign-in
 *   - signed in, no org yet     -> /(onboarding)/organization
 *   - signed in, has an org     -> /(app)
 */
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { color } from '@/src/theme';

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { data: userDoc, loading: docLoading } = useCurrentUserDoc();

  const loading = authLoading || (user && docLoading);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={color.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }
  if (!userDoc?.primaryOrgId) {
    return <Redirect href="/(onboarding)/organization" />;
  }
  return <Redirect href="/(app)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
});
