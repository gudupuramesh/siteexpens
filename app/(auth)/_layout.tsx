import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/src/features/auth/useAuth';

export default function AuthLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Redirect href="/(app)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
