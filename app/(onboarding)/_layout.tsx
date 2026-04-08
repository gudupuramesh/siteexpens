/**
 * Onboarding group. Only reachable by a signed-in user who hasn't yet
 * created their primary organization. If auth is missing we bounce them
 * to sign-in; if they've already completed onboarding we bounce to the
 * authenticated app.
 */
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';

export default function OnboardingLayout() {
  const { user, loading: authLoading } = useAuth();
  const { data: userDoc, loading: docLoading } = useCurrentUserDoc();

  if (authLoading || docLoading) return null;
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (userDoc?.primaryOrgId) return <Redirect href="/(app)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F7F8FA' },
      }}
    />
  );
}
