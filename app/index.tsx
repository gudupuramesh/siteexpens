/**
 * Entry redirect. Decides where the user should land based on auth +
 * onboarding state:
 *   - still checking            -> centered spinner
 *   - signed out                -> /(auth)/sign-in
 *   - signed in, no org yet     -> /(onboarding)/organization
 *   - signed in, has an org     -> /(app)
 *
 * Auth-listener race guard:
 *   When `confirmOtp()` resolves on the verify screen, Firebase's
 *   `auth()` singleton already has a `currentUser`, but the
 *   `onAuthStateChanged` listener that feeds `AuthProvider.user` can
 *   take 100-500 ms to fire on the next render of THIS route. Without
 *   guarding for that gap, we briefly evaluate `!user` as true and
 *   flash the sign-in screen on the way to onboarding/dashboard for a
 *   new sign-up — exactly what new users were reporting after entering
 *   their OTP. Reading `auth().currentUser` directly closes the gap:
 *   when Firebase has a user but AuthProvider doesn't yet, we keep
 *   the spinner up until the listener catches up.
 */
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { auth } from '@/src/lib/firebase';
import { color } from '@/src/theme';

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { data: userDoc, loading: docLoading } = useCurrentUserDoc();

  // Race guard — see file header for details. Mismatch between Firebase's
  // synchronous `auth().currentUser` and the (slower) AuthProvider context
  // means we just signed in but the listener hasn't propagated yet.
  const inTransition = !!auth.currentUser && !user;

  const loading = authLoading || inTransition || (user && docLoading);

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
  return <Redirect href={'/(app)' as never} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
});
