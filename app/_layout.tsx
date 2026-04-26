import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider } from '@/src/features/auth/AuthProvider';
import { InteriorSplash } from '@/src/ui/InteriorSplash';

export default function RootLayout() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
    [],
  );

  // Show the InteriorOS splash exactly once per app process. The user sees
  // it on cold start; subsequent in-app navigation uses the lighter
  // PageEnter transition.
  const [splashVisible, setSplashVisible] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <View style={{ flex: 1 }}>
          <Slot />
          {splashVisible ? (
            <InteriorSplash onDone={() => setSplashVisible(false)} />
          ) : null}
        </View>
        <StatusBar style="auto" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
