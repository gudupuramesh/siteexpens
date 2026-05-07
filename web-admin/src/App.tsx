/**
 * Authenticated app shell — sidebar + routed content area.
 * Rendered only when AdminGate has confirmed the user is App Owner.
 */
import {
  AppShell,
  Avatar,
  Burger,
  Button,
  Group,
  NavLink,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconClipboardList,
  IconCoins,
  IconLayoutGrid,
  IconLogout,
  IconMessages,
  IconPlayerPlay,
  IconSettings2,
  IconUsers,
} from '@tabler/icons-react';
import { NavLink as RouterLink, Route, Routes, useLocation } from 'react-router-dom';

import { auth, signOut } from './lib/firebase';

import { Subscribers } from './routes/Subscribers';
import { Revenue } from './routes/Revenue';
import { Plans } from './routes/Plans';
import { OrgDetail } from './routes/OrgDetail';
import { Audit } from './routes/Audit';
import { Tutorials } from './routes/Tutorials';
import { Feedback } from './routes/Feedback';

const NAV: Array<{ to: string; label: string; icon: typeof IconUsers }> = [
  { to: '/subscribers', label: 'Subscribers', icon: IconUsers },
  { to: '/revenue', label: 'Revenue', icon: IconCoins },
  { to: '/plans', label: 'Plans', icon: IconLayoutGrid },
  { to: '/tutorials', label: 'Tutorials', icon: IconPlayerPlay },
  { to: '/feedback', label: 'Feedback', icon: IconMessages },
  { to: '/audit', label: 'Audit', icon: IconClipboardList },
];

export function App() {
  const [opened, { toggle, close }] = useDisclosure();
  const { pathname } = useLocation();
  const user = auth.currentUser;

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: 240,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Group gap={6}>
              <IconSettings2 size={20} />
              <Title order={4}>SiteExpens Admin</Title>
            </Group>
          </Group>
          <Group>
            {user ? (
              <Group gap={8}>
                <Avatar src={user.photoURL} size="sm" radius="xl">
                  {(user.email ?? '?').slice(0, 1).toUpperCase()}
                </Avatar>
                <Text size="sm" hiddenFrom="xs">
                  {user.email}
                </Text>
              </Group>
            ) : null}
            <Button
              variant="light"
              size="xs"
              leftSection={<IconLogout size={14} />}
              onClick={signOut}
            >
              Sign out
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Stack gap={2}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              component={RouterLink}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} stroke={1.5} />}
              active={pathname.startsWith(item.to)}
              onClick={close}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Routes>
          <Route path="/" element={<Subscribers />} />
          <Route path="/subscribers" element={<Subscribers />} />
          <Route path="/revenue" element={<Revenue />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/org/:id" element={<OrgDetail />} />
          <Route path="/tutorials" element={<Tutorials />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/audit" element={<Audit />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
