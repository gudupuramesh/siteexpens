import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/src/features/auth/useAuth';

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F7F8FA' },
      }}
    />
  );
}
