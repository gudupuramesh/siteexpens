/**
 * Subscribers — cross-org list with filters + click-through to
 * the per-org detail screen for overrides.
 *
 * Data flow:
 *   - Calls `adminListSubscribers` callable on mount + filter change
 *   - Server reads every org via Admin SDK, returns pre-shaped rows
 *   - Sorts by createdAt desc on the server; client just renders
 *
 * Performance: at < 5K orgs we don't paginate. The callable returns
 * up to 500 rows; if we ever need more, switch to startAfter cursors.
 */
import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { callAdmin } from '@/lib/firebase';

type Row = Awaited<
  ReturnType<typeof callAdmin.listSubscribers>
>['data']['rows'][number];

const TIER_COLOR: Record<string, string> = {
  free: 'gray',
  solo: 'blue',
  studio: 'indigo',
  agency: 'violet',
};

const STATUS_COLOR: Record<string, string> = {
  active: 'green',
  trialing: 'cyan',
  past_due: 'orange',
  cancelled: 'gray',
  expired: 'red',
};

export function Subscribers() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    callAdmin
      .listSubscribers({
        pageSize: 500,
        filters: {
          ...(tier ? { tier } : {}),
          ...(status ? { status } : {}),
        },
      })
      .then((res) => setRows(res.data.rows))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tier, status]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.ownerContact?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Subscribers</Title>
        <Text c="dimmed" size="sm">
          {filtered.length} of {rows.length}
        </Text>
      </Group>

      <Group gap="sm">
        <TextInput
          placeholder="Search name, id, or email…"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          flex={1}
          maw={400}
        />
        <Select
          placeholder="All tiers"
          data={[
            { value: 'free', label: 'Free' },
            { value: 'solo', label: 'Solo' },
            { value: 'studio', label: 'Studio' },
            { value: 'agency', label: 'Agency' },
          ]}
          value={tier}
          onChange={setTier}
          clearable
          w={140}
        />
        <Select
          placeholder="All statuses"
          data={[
            { value: 'active', label: 'Active' },
            { value: 'trialing', label: 'Trialing' },
            { value: 'past_due', label: 'Past due' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'expired', label: 'Expired' },
          ]}
          value={status}
          onChange={setStatus}
          clearable
          w={160}
        />
      </Group>

      {error ? (
        <Text c="red">{error}</Text>
      ) : loading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : (
        <Box style={{ overflowX: 'auto' }}>
          <Table highlightOnHover striped withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Studio</Table.Th>
                <Table.Th>Tier</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Members</Table.Th>
                <Table.Th>Projects</Table.Th>
                <Table.Th>Storage</Table.Th>
                <Table.Th>Trial ends</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={600} size="sm">
                        {r.name || '—'}
                      </Text>
                      <Text c="dimmed" size="xs" ff="monospace">
                        {r.id}
                      </Text>
                      {r.ownerContact ? (
                        <Text c="dimmed" size="xs">
                          {r.ownerContact}
                        </Text>
                      ) : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={TIER_COLOR[r.tier] ?? 'gray'} variant="light">
                      {r.tier}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={STATUS_COLOR[r.status] ?? 'gray'}
                      variant="dot"
                    >
                      {r.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{r.memberCount}</Table.Td>
                  <Table.Td>{r.projectCount}</Table.Td>
                  <Table.Td>{formatBytes(r.storageBytes)}</Table.Td>
                  <Table.Td>{formatDate(r.expiresAt)}</Table.Td>
                  <Table.Td>{formatDate(r.createdAt)}</Table.Td>
                  <Table.Td>
                    <Button
                      variant="light"
                      size="xs"
                      onClick={() => nav(`/org/${r.id}`)}
                    >
                      Open
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}

function formatBytes(b: number): string {
  if (!b) return '—';
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

function formatDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
