/**
 * Feedback admin view — lists every submission from `feedback/{id}`,
 * with filters, a detail drawer, and inline triage controls.
 *
 * Read direct from Firestore (App Owner has list permission via the
 * rule). Mutations (status change, admin notes) write back to the
 * same doc; the rule enforces owner-only updates.
 */
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  Image,
  Loader,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBug, IconBulb, IconMessage, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';

// ── Local mirror of the mobile types ───────────────────────────────
//
// The web admin doesn't import from `src/features/feedback/types.ts`
// (that path lives in the mobile app). Keep these in lock-step when
// the doc shape changes.

type FeedbackType = 'bug' | 'feature' | 'general';
type FeedbackStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';

type FeedbackScreenshot = {
  publicUrl: string;
  r2Key: string;
  sizeBytes: number;
};

type FeedbackDeviceInfo = {
  platform: string;
  osVersion: string;
  modelName: string;
  modelId: string;
  appVersion: string;
  appBuildNumber: string;
};

type FeedbackRow = {
  id: string;
  type: FeedbackType;
  module: string;
  moduleCustom: string;
  description: string;
  screenshots: FeedbackScreenshot[];
  device: FeedbackDeviceInfo;
  orgId: string | null;
  orgName: string | null;
  userId: string;
  userPhone: string;
  userDisplayName: string;
  userRole: string;
  status: FeedbackStatus;
  adminNotes?: string;
  triagedBy?: string;
  triagedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

// ── Constants for badges + selects ─────────────────────────────────

const TYPE_META: Record<
  FeedbackType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  bug: { label: 'Bug', color: 'red', icon: <IconBug size={12} /> },
  feature: { label: 'Feature', color: 'blue', icon: <IconBulb size={12} /> },
  general: { label: 'Feedback', color: 'gray', icon: <IconMessage size={12} /> },
};

const STATUS_META: Record<FeedbackStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'orange' },
  in_progress: { label: 'In progress', color: 'blue' },
  resolved: { label: 'Resolved', color: 'green' },
  wont_fix: { label: "Won't fix", color: 'gray' },
};

const STATUS_OPTIONS = (Object.keys(STATUS_META) as FeedbackStatus[]).map((k) => ({
  value: k,
  label: STATUS_META[k].label,
}));

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...((Object.keys(TYPE_META) as FeedbackType[]).map((k) => ({
    value: k,
    label: TYPE_META[k].label,
  }))),
];

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...((Object.keys(STATUS_META) as FeedbackStatus[]).map((k) => ({
    value: k,
    label: STATUS_META[k].label,
  }))),
];

const PAGE_SIZE = 25;

function fmtDate(t: Timestamp | null | undefined): string {
  if (!t) return '—';
  return t.toDate().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function moduleLabel(row: FeedbackRow): string {
  if (row.module === 'other' && row.moduleCustom) return row.moduleCustom;
  // Stable keys → display label. Lazy mapping; new keys added on the
  // mobile side will fall through to the raw key — visible but not
  // pretty. Update this map when adding new modules.
  const MAP: Record<string, string> = {
    home: 'Home',
    projects: 'Projects',
    tasks: 'Tasks',
    transactions: 'Transactions',
    finance: 'Finance',
    dpr: 'DPR',
    materials: 'Materials',
    designs: 'Designs',
    laminates: 'Laminates',
    attendance: 'Attendance',
    whiteboard: 'Whiteboard',
    parties: 'Parties',
    crm: 'CRM',
    billing: 'Billing',
    profile: 'Studio profile',
    team: 'Team & roles',
    account_switching: 'Account switching',
    auth: 'Sign-in',
    notifications: 'Notifications',
    tutorials: 'Tutorials',
    other: 'Other',
  };
  return MAP[row.module] ?? row.module;
}

export function Feedback() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters + search
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Drawer
  const [openId, setOpenId] = useState<string | null>(null);
  const open = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId]);

  useEffect(() => {
    const q = query(
      collection(db, 'feedback'),
      orderBy('createdAt', 'desc'),
      fsLimit(500),
    );
    return onSnapshot(
      q,
      (snap) => {
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<FeedbackRow, 'id'>),
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

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (needle) {
        const hay = [
          r.description, r.userDisplayName, r.userPhone, r.orgName ?? '',
          r.userRole, moduleLabel(r), r.device.modelName,
        ].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, statusFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, search]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Feedback</Title>
          <Text c="dimmed" size="sm">
            User submissions from the mobile app — bugs, feature requests, and general feedback.
          </Text>
        </div>
        <Text size="sm" c="dimmed">
          {filtered.length} of {rows.length} shown
        </Text>
      </Group>

      <Card withBorder padding="sm">
        <Group gap="sm" wrap="wrap">
          <Select
            value={typeFilter}
            onChange={(v) => setTypeFilter(v ?? 'all')}
            data={TYPE_FILTER_OPTIONS}
            w={160}
            comboboxProps={{ withinPortal: true }}
          />
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v ?? 'all')}
            data={STATUS_FILTER_OPTIONS}
            w={180}
            comboboxProps={{ withinPortal: true }}
          />
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Search description, user, studio, module…"
            leftSection={<IconSearch size={14} />}
            style={{ flex: 1, minWidth: 240 }}
          />
        </Group>
      </Card>

      {loading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : error ? (
        <Card withBorder padding="md" bg="red.0">
          <Text c="red.7">Could not load: {error}</Text>
        </Card>
      ) : filtered.length === 0 ? (
        <Card withBorder padding="xl">
          <Stack align="center" gap="xs">
            <Text c="dimmed">No feedback matches the current filters.</Text>
          </Stack>
        </Card>
      ) : (
        <>
          <Card withBorder padding={0}>
            <Table
              striped
              highlightOnHover
              stickyHeader
              verticalSpacing="sm"
              horizontalSpacing="md"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 90 }}>Type</Table.Th>
                  <Table.Th style={{ width: 130 }}>Module</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th style={{ width: 60 }}>Imgs</Table.Th>
                  <Table.Th style={{ width: 150 }}>User</Table.Th>
                  <Table.Th style={{ width: 130 }}>Studio</Table.Th>
                  <Table.Th style={{ width: 110 }}>Status</Table.Th>
                  <Table.Th style={{ width: 130 }}>Submitted</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pageRows.map((r) => {
                  const tm = TYPE_META[r.type];
                  const sm = STATUS_META[r.status];
                  return (
                    <Table.Tr
                      key={r.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOpenId(r.id)}
                    >
                      <Table.Td>
                        <Badge color={tm.color} leftSection={tm.icon} variant="light">
                          {tm.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{moduleLabel(r)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={2} style={{ maxWidth: 480 }}>
                          {r.description}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {r.screenshots?.length ?? 0}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={1}>
                          {r.userDisplayName || r.userPhone}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {r.userRole}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={1}>{r.orgName ?? '—'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={sm.color} variant="light">{sm.label}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{fmtDate(r.createdAt)}</Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>

          {pageCount > 1 ? (
            <Group justify="center">
              <Pagination value={page} onChange={setPage} total={pageCount} />
            </Group>
          ) : null}
        </>
      )}

      <FeedbackDrawer
        row={open}
        onClose={() => setOpenId(null)}
      />
    </Stack>
  );
}

// ── Detail drawer ──────────────────────────────────────────────────

function FeedbackDrawer({
  row,
  onClose,
}: {
  row: FeedbackRow | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<FeedbackStatus>('open');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset state when the drawer opens onto a new row.
  useEffect(() => {
    if (row) {
      setStatus(row.status);
      setNotes(row.adminNotes ?? '');
    }
  }, [row?.id, row?.status, row?.adminNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = row ? status !== row.status || notes !== (row.adminNotes ?? '') : false;

  async function save() {
    if (!row || !dirty) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'feedback', row.id), {
        status,
        adminNotes: notes,
        updatedAt: serverTimestamp(),
        // triagedBy / triagedAt left to a follow-up — the auth.uid
        // would land here once we have a small useAuth hook in admin.
      });
      notifications.show({
        title: 'Saved',
        message: 'Triage updated.',
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        title: 'Save failed',
        message: (err as Error).message,
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      opened={!!row}
      onClose={onClose}
      title={
        row ? (
          <Group gap="xs">
            <Badge color={TYPE_META[row.type].color} variant="light">
              {TYPE_META[row.type].label}
            </Badge>
            <Text fw={600}>{moduleLabel(row)}</Text>
          </Group>
        ) : null
      }
      position="right"
      size="lg"
      padding="md"
      withCloseButton
    >
      {row ? (
        <Stack gap="md">
          {/* Description */}
          <Card withBorder padding="md">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {row.description}
            </Text>
          </Card>

          {/* Screenshots */}
          {row.screenshots && row.screenshots.length > 0 ? (
            <div>
              <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={6}>
                Screenshots ({row.screenshots.length})
              </Text>
              <SimpleGrid cols={2} spacing="xs">
                {row.screenshots.map((s, i) => (
                  <Anchor key={s.r2Key ?? i} href={s.publicUrl} target="_blank">
                    <Image
                      src={s.publicUrl}
                      alt={`Screenshot ${i + 1}`}
                      h={220}
                      fit="contain"
                      bg="gray.1"
                      style={{ borderRadius: 6 }}
                    />
                  </Anchor>
                ))}
              </SimpleGrid>
            </div>
          ) : null}

          {/* Triage controls */}
          <Card withBorder padding="md">
            <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={8}>
              Triage
            </Text>
            <Stack gap="sm">
              <Select
                label="Status"
                value={status}
                onChange={(v) => v && setStatus(v as FeedbackStatus)}
                data={STATUS_OPTIONS}
                comboboxProps={{ withinPortal: true }}
              />
              <Textarea
                label="Admin notes"
                placeholder="Internal notes on this submission (not visible to the user)."
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                minRows={3}
                autosize
              />
              <Group justify="flex-end">
                <Button onClick={() => void save()} disabled={!dirty} loading={saving}>
                  Save
                </Button>
              </Group>
            </Stack>
          </Card>

          {/* Reporter + device info */}
          <Card withBorder padding="md">
            <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={8}>
              Reporter
            </Text>
            <KV k="Name" v={row.userDisplayName || '—'} />
            <KV k="Phone" v={row.userPhone || '—'} />
            <KV k="Role" v={row.userRole || '—'} />
            <KV k="Studio" v={row.orgName ?? '—'} />
            <Tooltip label={`uid: ${row.userId}\norgId: ${row.orgId ?? '—'}`}>
              <Text size="xs" c="dimmed" mt={4} style={{ cursor: 'help' }}>
                hover for IDs
              </Text>
            </Tooltip>
          </Card>

          <Card withBorder padding="md">
            <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={8}>
              Device
            </Text>
            <KV k="Model" v={row.device.modelName || row.device.modelId || '—'} />
            <KV k="Model id" v={row.device.modelId || '—'} />
            <KV
              k="OS"
              v={`${row.device.platform.toUpperCase()} ${row.device.osVersion ?? ''}`.trim()}
            />
            <KV
              k="App"
              v={`${row.device.appVersion} (build ${row.device.appBuildNumber})`}
            />
            <KV k="Submitted" v={fmtDate(row.createdAt)} />
            {row.updatedAt && row.updatedAt !== row.createdAt ? (
              <KV k="Updated" v={fmtDate(row.updatedAt)} />
            ) : null}
            <Tooltip label={`feedback id: ${row.id}`}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => navigator.clipboard.writeText(row.id)}
                aria-label="Copy feedback id"
                mt={6}
              >
                <Text size="xs">Copy id</Text>
              </ActionIcon>
            </Tooltip>
          </Card>
        </Stack>
      ) : null}
    </Drawer>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <Group gap={8} wrap="nowrap" mb={4}>
      <Text size="xs" c="dimmed" w={80}>{k}</Text>
      <Text size="sm" style={{ flex: 1, minWidth: 0 }}>{v}</Text>
    </Group>
  );
}
