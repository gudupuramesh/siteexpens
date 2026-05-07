/**
 * Per-org override screen — push a studio onto a specific tier
 * (comp account, refund stand-in, trial extension).
 *
 * Reads the live org doc via a snapshot so changes propagate
 * instantly. Save calls `adminOverrideOrgTier` callable.
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconShieldHalfFilled } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';

import { callAdmin, db } from '@/lib/firebase';

type Tier = 'free' | 'solo' | 'studio' | 'agency';

type OrgDoc = {
  name?: string;
  ownerId?: string;
  email?: string;
  memberIds?: string[];
  subscription?: {
    tier?: string;
    status?: string;
    expiresAt?: { toMillis: () => number };
    source?: string;
    manualOverrideNote?: string;
  };
  counters?: {
    memberCount?: number;
    projectCount?: number;
    storageBytes?: number;
  };
};

export function OrgDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [org, setOrg] = useState<OrgDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [tier, setTier] = useState<Tier>('studio');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, 'organizations', id),
      (snap) => {
        if (!snap.exists()) {
          setError('Organization not found.');
          return;
        }
        const data = snap.data() as OrgDoc;
        setOrg(data);
        // Pre-fill the form with current state.
        const t = data.subscription?.tier;
        if (t === 'free' || t === 'solo' || t === 'studio' || t === 'agency') {
          setTier(t);
        }
        const exp = data.subscription?.expiresAt;
        if (exp) {
          setExpiresAt(new Date(exp.toMillis()));
        }
      },
      (err) => setError(err.message),
    );
  }, [id]);

  const onSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await callAdmin.overrideOrgTier({
        orgId: id,
        tier,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        note: note.trim() || undefined,
      });
      notifications.show({
        title: 'Tier override saved',
        message: 'Live for the org now. Audit log updated.',
        color: 'green',
      });
      setNote('');
    } catch (err) {
      notifications.show({
        title: 'Override failed',
        message: (err as Error).message,
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Stack>
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={14} />}
          onClick={() => nav('/subscribers')}
          w="fit-content"
        >
          Back
        </Button>
        <Text c="red">{error}</Text>
      </Stack>
    );
  }
  if (!org) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  const sub = org.subscription ?? {};
  const counters = org.counters ?? {};
  const isManual = sub.source === 'manual';

  return (
    <Stack gap="md">
      <Button
        variant="subtle"
        leftSection={<IconArrowLeft size={14} />}
        onClick={() => nav('/subscribers')}
        w="fit-content"
      >
        Back to subscribers
      </Button>

      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={2}>{org.name || 'Untitled studio'}</Title>
          <Text c="dimmed" size="sm" ff="monospace">
            {id}
          </Text>
        </Stack>
        <Group>
          <Badge color="indigo" variant="light" size="lg">
            {sub.tier ?? 'free'}
          </Badge>
          <Badge color="cyan" variant="dot">
            {sub.status ?? 'active'}
          </Badge>
        </Group>
      </Group>

      <Group gap="md">
        <Stat label="Members" value={String(counters.memberCount ?? 0)} />
        <Stat label="Projects" value={String(counters.projectCount ?? 0)} />
        <Stat
          label="Storage"
          value={formatBytes(counters.storageBytes ?? 0)}
        />
        <Stat
          label="Trial / paid until"
          value={
            sub.expiresAt
              ? new Date(sub.expiresAt.toMillis()).toLocaleDateString('en-IN')
              : '—'
          }
        />
      </Group>

      {isManual ? (
        <Alert
          icon={<IconShieldHalfFilled size={16} />}
          color="violet"
          variant="light"
        >
          <Text size="sm">
            This org is on a <b>manual override</b>. RevenueCat lifecycle
            events for this org are recorded in audit but do not change the
            tier until the override is cleared.
            {sub.manualOverrideNote ? (
              <>
                {' '}
                Note: <i>{sub.manualOverrideNote}</i>
              </>
            ) : null}
          </Text>
        </Alert>
      ) : null}

      <Card withBorder p="md">
        <Stack gap="md">
          <Title order={4}>Override plan</Title>
          <Group gap="md" align="flex-end">
            <Select
              label="Tier"
              value={tier}
              onChange={(v) => v && setTier(v as Tier)}
              data={[
                { value: 'free', label: 'Free' },
                { value: 'solo', label: 'Solo' },
                { value: 'studio', label: 'Studio' },
                { value: 'agency', label: 'Agency' },
              ]}
              w={160}
            />
            <DateInput
              label="Expires on"
              description="Leave empty for permanent override."
              placeholder="Never"
              value={expiresAt}
              onChange={(v) =>
                setExpiresAt(typeof v === 'string' ? (v ? new Date(v) : null) : v)
              }
              clearable
              w={220}
              minDate={new Date()}
            />
          </Group>
          <Textarea
            label="Note (optional)"
            placeholder="e.g. Comp account for design partner Q3 launch"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group>
            <Button onClick={onSave} loading={saving}>
              Apply override
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card withBorder p="sm" w={170}>
      <Stack gap={2}>
        <Text c="dimmed" size="xs" tt="uppercase" lts="0.05em">
          {label}
        </Text>
        <Text fw={700}>{value}</Text>
      </Stack>
    </Card>
  );
}

function formatBytes(b: number): string {
  if (!b) return '—';
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}
