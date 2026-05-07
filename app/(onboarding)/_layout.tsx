/**
 * Onboarding group. Two entry modes:
 *
 *   1. Default (first-time setup): only reachable by a signed-in user
 *      who hasn't yet created their primary organization. If
 *      `primaryOrgId` is already set we bounce them to the
 *      authenticated app — they don't need onboarding.
 *
 *   2. `?mode=add` (create-your-studio): a user who has been
 *      INVITED into other studios but doesn't own one yet can
 *      reach the form via the Profile "+ Create your studio"
 *      button. We skip the redirect so they can create their own
 *      studio (one per user — see below).
 *
 * Hard product rule: each user can OWN exactly one studio. They
 * may join unlimited studios as a member via invite, but the
 * `createOrganization` Cloud Function rejects a second create
 * attempt and we surface that via UI guards too:
 *
 *   - Profile "+ Create your studio" row hides when the user
 *     already appears as `isYourStudio` in any of their orgs.
 *   - This layout bounces out when `mode=add` AND the user
 *     already owns one of their orgs (covers deep-link entries
 *     after the first studio was created).
 */
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useMyOrganizations } from '@/src/features/org/useMyOrganizations';

export default function OnboardingLayout() {
  const { user, loading: authLoading } = useAuth();
  const { data: userDoc, loading: docLoading } = useCurrentUserDoc();
  const { orgs: myOrgs, loading: orgsLoading } = useMyOrganizations();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  if (authLoading || docLoading || orgsLoading) return null;
  if (!user) return <Redirect href="/(auth)/sign-in" />;

  const ownsAnOrg = myOrgs.some((o) => o.isYourStudio);

  // Default mode (first-time setup): bounce home once primaryOrgId
  // exists OR they already own one (legacy users may land here
  // before primaryOrgId is set on the user doc).
  if (mode !== 'add' && (userDoc?.primaryOrgId || ownsAnOrg)) {
    return <Redirect href={'/(app)' as never} />;
  }

  // Add-studio mode: bounce home if they ALREADY own a studio —
  // server-side createOrganization would reject the create
  // anyway, so don't even let them reach the form.
  if (mode === 'add' && ownsAnOrg) return <Redirect href={'/(app)' as never} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F7F8FA' },
      }}
    />
  );
}
