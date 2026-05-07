/**
 * Wraps the entire admin app — gates access on the `role: 'app_owner'`
 * Firebase custom claim.
 *
 * States:
 *   - `loading` — auth state hasn't resolved yet (spinner)
 *   - `signed-out` — show <SignIn /> with the Google button
 *   - `signed-in but missing claim` — show <NotAuthorized /> with
 *     the user's email + a sign-out button. They CAN'T do anything
 *     else; rules + callables also reject them.
 *   - `signed-in with claim` — render children (the routed app)
 *
 * The custom claim is checked from the user's ID token result, which
 * is already cached after sign-in (no network round-trip). When the
 * App Owner runs `grant-app-owner.ts` to add a new operator, that
 * operator must sign out + back in once for the new claim to land.
 */
import {
  Box,
  Button,
  Center,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconBrandGoogle,
  IconLock,
} from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';

import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  signOut,
  type User,
} from '@/lib/firebase';

type GateStatus =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'no-claim'; user: User }
  | { kind: 'authorized'; user: User };

export function AdminGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GateStatus>({ kind: 'loading' });
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setStatus({ kind: 'signed-out' });
        return;
      }
      try {
        // Force-refresh the token so a freshly granted claim shows up
        // without requiring a sign-out / sign-in dance. Cheap (cached
        // server-side); only fires on auth-state changes.
        const result = await u.getIdTokenResult(true);
        if (result.claims.role === 'app_owner') {
          setStatus({ kind: 'authorized', user: u });
        } else {
          setStatus({ kind: 'no-claim', user: u });
        }
      } catch (err) {
        console.warn('[AdminGate] token-result failed:', err);
        setStatus({ kind: 'no-claim', user: u });
      }
    });
  }, []);

  if (status.kind === 'loading') {
    return (
      <Center style={{ minHeight: '100vh' }}>
        <Loader />
      </Center>
    );
  }

  if (status.kind === 'signed-out') {
    return (
      <Center style={{ minHeight: '100vh', padding: 24 }}>
        <Stack align="center" gap="md" maw={420}>
          <IconLock size={48} stroke={1.5} />
          <Title order={2}>SiteExpens Admin</Title>
          <Text c="dimmed" ta="center">
            Sign in with the Google account that has been granted the
            App Owner role. If you're not sure, ask the person who
            set up the project.
          </Text>
          <Button
            leftSection={<IconBrandGoogle size={18} />}
            onClick={async () => {
              setSignInError(null);
              try {
                await signInWithGoogle();
              } catch (err) {
                setSignInError((err as Error).message ?? 'Sign-in failed.');
              }
            }}
            size="md"
          >
            Sign in with Google
          </Button>
          {signInError ? (
            <Text c="red" size="sm" ta="center">
              {signInError}
            </Text>
          ) : null}
        </Stack>
      </Center>
    );
  }

  if (status.kind === 'no-claim') {
    return (
      <Center style={{ minHeight: '100vh', padding: 24 }}>
        <Stack align="center" gap="md" maw={460}>
          <IconAlertTriangle size={48} stroke={1.5} color="orange" />
          <Title order={2}>Not authorised</Title>
          <Text ta="center">
            You're signed in as{' '}
            <Text span fw={600}>
              {status.user.email ?? status.user.uid}
            </Text>{' '}
            but this account doesn't have App Owner privileges.
          </Text>
          <Text c="dimmed" size="sm" ta="center">
            If you're meant to be an App Owner, ask an existing
            operator to run{' '}
            <Text span ff="monospace" size="xs">
              scripts/grant-app-owner.ts &lt;your-uid&gt;
            </Text>{' '}
            then sign out + back in here.
          </Text>
          <Button variant="light" onClick={signOut}>
            Sign out
          </Button>
          <Box>
            <Text size="xs" c="dimmed" ta="center">
              Your uid: <Text span ff="monospace">{status.user.uid}</Text>
            </Text>
          </Box>
        </Stack>
      </Center>
    );
  }

  return <>{children}</>;
}
