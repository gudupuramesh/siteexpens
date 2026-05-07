/**
 * Plan editor — edits `system/planConfig` so per-tier limits
 * (members, projects, storage) can be tuned live without a code
 * redeploy.
 *
 * IMPORTANT — what's editable here vs in the App Store / Play
 * Console:
 *   - Edited HERE (instant): per-tier limits (member cap, project
 *     cap, storage cap)
 *   - NOT edited here: subscription product PRICES. Apple + Google
 *     own the price tiers; changes propagate in 1-2 days from the
 *     respective consoles. The display strings (₹499 etc.) are
 *     informational only on this page.
 *
 * Saving calls `adminUpdatePlanConfig` which writes to
 * `system/planConfig` + appends to `adminAudit`. The change is
 * live for new actions immediately (next paywall check reads the
 * new doc).
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconDeviceFloppy } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { callAdmin, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

type TierKey = 'free' | 'solo' | 'studio' | 'agency';
type TierConfig = {
  maxMembers: number;
  maxProjects: number;
  maxStorageBytes: number;
};
type PlanConfig = Record<TierKey, TierConfig>;

const TIERS: TierKey[] = ['free', 'solo', 'studio', 'agency'];

const TIER_LABELS: Record<TierKey, string> = {
  free: 'Free',
  solo: 'Solo',
  studio: 'Studio',
  agency: 'Agency',
};

// Display-only pricing. Real prices live in App Store / Play.
const TIER_DISPLAY_PRICE: Record<TierKey, string> = {
  free: '₹0',
  solo: '₹499 / mo',
  studio: '₹1,999 / mo',
  agency: '₹4,999 / mo',
};

export function Plans() {
  const [config, setConfig] = useState<PlanConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live snapshot — changes from another admin (or another tab)
  // surface here too.
  useEffect(() => {
    const ref = doc(db, 'system', 'planConfig');
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError('system/planConfig is missing — run the seed once.');
          return;
        }
        const data = snap.data() as Record<string, TierConfig>;
        const next: PlanConfig = {
          free: data.free,
          solo: data.solo,
          studio: data.studio,
          agency: data.agency,
        };
        setConfig(next);
      },
      (err) => setError(err.message),
    );
  }, []);

  const update = (tier: TierKey, key: keyof TierConfig, value: number) => {
    if (!config) return;
    setConfig({ ...config, [tier]: { ...config[tier], [key]: value } });
  };

  const onSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await callAdmin.updatePlanConfig(config);
      notifications.show({
        title: 'Plan limits saved',
        message: 'Live for new actions across the app.',
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
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Plans</Title>
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={onSave}
          loading={saving}
          disabled={!config}
        >
          Save changes
        </Button>
      </Group>

      <Alert
        icon={<IconAlertCircle size={16} />}
        color="blue"
        variant="light"
      >
        <Text size="sm">
          Per-tier <b>limits</b> are editable here and live instantly. Subscription{' '}
          <b>prices</b> live in App Store Connect (iOS) and Google Play Console
          (Android) — changes there take 1–2 days to propagate. The price strings
          shown below are informational only.
        </Text>
      </Alert>

      {error ? <Text c="red">{error}</Text> : null}

      {config ? (
        <Stack gap="md">
          {TIERS.map((tier) => (
            <Card key={tier} withBorder p="md">
              <Group justify="space-between" mb="sm">
                <Group gap="sm">
                  <Title order={4}>{TIER_LABELS[tier]}</Title>
                  <Badge variant="light">{TIER_DISPLAY_PRICE[tier]}</Badge>
                </Group>
                <Text c="dimmed" size="xs">
                  Use <Text span ff="monospace">-1</Text> for unlimited.
                </Text>
              </Group>
              <Group gap="md" align="flex-end">
                <NumberInput
                  label="Members"
                  value={config[tier].maxMembers}
                  onChange={(v) => update(tier, 'maxMembers', Number(v))}
                  min={-1}
                  step={1}
                  w={140}
                />
                <NumberInput
                  label="Projects"
                  value={config[tier].maxProjects}
                  onChange={(v) => update(tier, 'maxProjects', Number(v))}
                  min={-1}
                  step={1}
                  w={140}
                />
                <NumberInput
                  label="Storage (bytes)"
                  description={
                    config[tier].maxStorageBytes >= 0
                      ? humanBytes(config[tier].maxStorageBytes)
                      : 'unlimited'
                  }
                  value={config[tier].maxStorageBytes}
                  onChange={(v) =>
                    update(tier, 'maxStorageBytes', Number(v))
                  }
                  min={-1}
                  step={1_073_741_824}
                  thousandSeparator=","
                  w={240}
                />
              </Group>
            </Card>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function humanBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${b} bytes`;
}
