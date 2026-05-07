import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider } from '@/src/features/auth/AuthProvider';
import { useAuth } from '@/src/features/auth/useAuth';
import { initRevenueCat } from '@/src/features/billing/initRevenueCat';
import { PaywallProvider } from '@/src/features/billing/usePaywall';
import { InteriorSplash } from '@/src/ui/InteriorSplash';

export default function RootLayout() {
  // RevenueCat SDK must be configured BEFORE any screen calls
  // Purchases.* methods. Runs once per app process; the helper is
  // idempotent so React's strict-mode double-render is harmless.
  // Org identity (`Purchases.logIn(orgId)`) is wired separately in
  // app/(app)/_layout.tsx after the active org is known.
  useEffect(() => {
    initRevenueCat();
  }, []);

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
        {/* PaywallProvider sits inside AuthProvider so it can read
            useSubscription() (which depends on the active org doc).
            The sheet is rendered globally so any screen can call
            usePaywall().openPaywall(...) without mounting its own
            Modal. */}
        <PaywallProvider>
          <View style={{ flex: 1 }}>
            <Slot />
            {splashVisible ? (
              <SplashHost onDone={() => setSplashVisible(false)} />
            ) : null}
          </View>
          <StatusBar style="auto" />
        </PaywallProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Couples splash dismissal to the auth-bootstrap readiness signal.
 *
 * Sits inside `<AuthProvider/>` so it can read `useAuth().loading`. The
 * splash holds for at least its `minDuration` for visual polish, then
 * dismisses as soon as `loading` flips to `false` — meaning the route
 * guard in `app/index.tsx` is ready to redirect to the dashboard. If
 * auth bootstrap stalls (offline / slow network), the splash's own
 * `maxDuration` ceiling kicks in so the user never sees a frozen
 * splash forever.
 *
 * For returning users: AuthProvider's fast path flips loading=false in
 * ~300 ms, which is well under the 1400 ms min — so the splash dismisses
 * exactly at min. Net effect: cold-start time = ~1.4 s + ~50 ms redirect
 * = effectively instant dashboard.
 *
 * For first-sign-in / invited users: AuthProvider blocks for 2–3 s on
 * claimInvites + token refresh. Splash holds gracefully on its
 * fully-played end-frame until ready (or until the 2400 ms max ceiling
 * → at which point the dashboard renders against whatever auth state
 * has settled).
 */
function SplashHost({ onDone }: { onDone: () => void }) {
  const { loading: authLoading } = useAuth();
  return <InteriorSplash ready={!authLoading} onDone={onDone} />;
}
