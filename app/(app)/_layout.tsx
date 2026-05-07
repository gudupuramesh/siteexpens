import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/src/features/auth/useAuth';
import { identifyOrgWithRevenueCat } from '@/src/features/billing/initRevenueCat';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { TutorialsProvider } from '@/src/features/tutorials/TutorialsContext';

export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { data: userDoc, loading: docLoading } = useCurrentUserDoc();

  // Bind RevenueCat to the active org as soon as both are known.
  // App User ID = orgId (NOT user uid) so purchases attach to the
  // studio — when the owner switches phones or another admin pays,
  // the entitlement stays on the org. See initRevenueCat.ts.
  //
  // Re-fires when the user switches orgs (`primaryOrgId` changes),
  // which calls Purchases.logIn(newOrgId). RevenueCat handles the
  // anonymous→identified merge of any pending purchases.
  const primaryOrgId = userDoc?.primaryOrgId;
  useEffect(() => {
    if (!primaryOrgId) return;
    void identifyOrgWithRevenueCat(primaryOrgId);
  }, [primaryOrgId]);

  if (authLoading || (user && docLoading)) return null;
  if (!user) return <Redirect href="/(auth)/sign-in" />;
  if (!userDoc?.primaryOrgId) return <Redirect href="/(onboarding)/organization" />;

  return (
    // TutorialsProvider performs a single onSnapshot on system/tutorialVideos
    // so every child screen can call useTutorialVideo(pageKey) for free.
    <TutorialsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F7F8FA' },
        }}
      />
    </TutorialsProvider>
  );
}
