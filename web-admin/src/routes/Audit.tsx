/**
 * Admin audit log — every write performed via an admin callable
 * appends a row here. Read-only; never edited or deleted.
 *
 * Reads directly from Firestore (`adminAudit/`) — App Owner gets
 * read access via the rule, no callable needed.
 */
import {
  Badge,
  Card,
  Code,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

type AuditRow = {
  id: string;
  actorUid: string;
  action: string;
  targetOrgId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
  at?: Timestamp;
};

const ACTION_COLOR: Record<string, string> = {
  override_org_tier: 'violet',
  update_plan_config: 'indigo',
};

export function Audit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'adminAudit'),
      orderBy('at', 'desc'),
      limit(200),
    );
    return onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AuditRow, 'id'>),
          })),
        );
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, []);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Audit log</Title>
        <Text c="dimmed" size="sm">
          Last {rows.length} events · newest first
        </Text>
      </Group>

      {error ? (
        <Text c="red">{error}</Text>
      ) : loading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : rows.length === 0 ? (
        <Card withBorder p="xl">
          <Text c="dimmed" ta="center">
            No admin actions yet. Override an org's tier or edit plan
            limits — events appear here in real time.
          </Text>
        </Card>
      ) : (
        <Table highlightOnHover striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>When</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Actor</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th>Note</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {r.at?.toDate().toLocaleString('en-IN') ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={ACTION_COLOR[r.action] ?? 'gray'}
                    variant="light"
                  >
                    {r.action}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Code>{r.actorUid.slice(0, 8)}…</Code>
                </Table.Td>
                <Table.Td>
                  {r.targetOrgId ? (
                    <Code>{r.targetOrgId}</Code>
                  ) : (
                    <Text c="dimmed">—</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{r.note ?? '—'}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
