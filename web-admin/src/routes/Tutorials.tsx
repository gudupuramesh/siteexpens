/**
 * Tutorial Videos — admin portal editor.
 *
 * Reads `system/tutorialVideos` (onSnapshot so two admin tabs stay in
 * sync). Renders one row per page key: URL input, title input, category
 * select, and enabled toggle. Saves the entire doc with a single setDoc
 * call (merge: true) — no Cloud Function needed, isAppOwner() in rules
 * gates the write.
 *
 * YouTube thumbnail preview: if the URL contains a valid video ID,
 * shows a small <img> next to the URL input so the admin can confirm
 * they pasted the right link.
 */
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Image,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconDeviceFloppy, IconPlayerPlay } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';

// ── Tutorial types (mirror of src/features/tutorials/types.ts) ────────
// Inlined here so the web-admin tsconfig (include: ["src"]) doesn't need
// to reach into the mobile app's src folder. Keep in sync manually if
// page keys are added.

type TutorialVideoEntry = {
  youtubeUrl: string;
  title: string;
  category: string;
  enabled: boolean;
};

type TutorialVideosDoc = Record<string, TutorialVideoEntry>;

const PAGE_KEYS = [
  'projects',
  'transactions',
  'tasks',
  'dpr',
  'material_requests',
  'crm_leads',
  'crm_appointments',
  'ledger',
  'finance',
  'parties',
  'material_library',
  'staff',
] as const;

type PageKey = (typeof PAGE_KEYS)[number];

const PAGE_KEY_LABELS: Record<PageKey, string> = {
  projects: 'Projects',
  transactions: 'Project Transactions',
  tasks: 'Project Timeline / Tasks',
  dpr: 'Daily Progress Reports',
  material_requests: 'Material Requests',
  crm_leads: 'CRM Leads',
  crm_appointments: 'CRM Appointments',
  ledger: 'Ledger',
  finance: 'Finance Dashboard',
  parties: 'Parties (Clients / Vendors)',
  material_library: 'Material Library',
  staff: 'Staff',
};

const PAGE_KEY_DEFAULT_CATEGORY: Record<PageKey, string> = {
  projects: 'Projects',
  transactions: 'Projects',
  tasks: 'Projects',
  dpr: 'Projects',
  material_requests: 'Projects',
  crm_leads: 'CRM',
  crm_appointments: 'CRM',
  ledger: 'Finance',
  finance: 'Finance',
  parties: 'Studio',
  material_library: 'Studio',
  staff: 'Studio',
};

// ── YouTube helpers ───────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function thumbnailUrl(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

// ── Category options ──────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'Projects', label: 'Projects' },
  { value: 'CRM', label: 'CRM' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Studio', label: 'Studio' },
  { value: 'General', label: 'General' },
];

// ── Default row (for a page with no data in Firestore yet) ────────────

function defaultEntry(pageKey: string): TutorialVideoEntry {
  return {
    youtubeUrl: '',
    title: `How to use ${PAGE_KEY_LABELS[pageKey as keyof typeof PAGE_KEY_LABELS] ?? pageKey}`,
    category: PAGE_KEY_DEFAULT_CATEGORY[pageKey as keyof typeof PAGE_KEY_DEFAULT_CATEGORY] ?? 'General',
    enabled: false,
  };
}

// ── Main component ────────────────────────────────────────────────────

export function Tutorials() {
  // Local edit state — initialised from Firestore; edited in-place.
  const [form, setForm] = useState<TutorialVideosDoc>(() =>
    Object.fromEntries(PAGE_KEYS.map((k) => [k, defaultEntry(k)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live snapshot — another admin tab's save shows up here too.
  useEffect(() => {
    const ref = doc(db, 'system', 'tutorialVideos');
    return onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? (snap.data() as TutorialVideosDoc) : {};
        // Merge Firestore data into defaults so new page keys always show.
        setForm(
          Object.fromEntries(
            PAGE_KEYS.map((k) => [k, { ...defaultEntry(k), ...(data[k] ?? {}) }]),
          ),
        );
      },
      (err) => setError(err.message),
    );
  }, []);

  const updateField = <K extends keyof TutorialVideoEntry>(
    pageKey: string,
    field: K,
    value: TutorialVideoEntry[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [pageKey]: { ...prev[pageKey], [field]: value },
    }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      // Firestore sends the ID token on writes; force refresh so
      // `role: app_owner` is present if it was granted after sign-in.
      const u = auth.currentUser;
      if (!u) throw new Error('Not signed in');
      await u.getIdToken(true);

      const ref = doc(db, 'system', 'tutorialVideos');
      // setDoc with merge:true so future page keys don't clobber
      // existing ones when added to PAGE_KEYS.
      await setDoc(ref, form, { merge: true });
      notifications.show({
        title: 'Tutorial videos saved',
        message: 'Live immediately for all app users.',
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
        <Title order={2}>Tutorial Videos</Title>
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={onSave}
          loading={saving}
        >
          Save all changes
        </Button>
      </Group>

      <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
        <Text size="sm">
          Set a YouTube URL for each page. When a user opens that page and the list is empty,
          the video thumbnail appears as a helpful tutorial. Toggle{' '}
          <strong>Enabled</strong> to show/hide without deleting the URL.
          Changes are live immediately after saving.
        </Text>
      </Alert>

      {error ? <Text c="red">{error}</Text> : null}

      <Stack gap="sm">
        {PAGE_KEYS.map((pageKey) => {
          const entry = form[pageKey] ?? defaultEntry(pageKey);
          const thumb = thumbnailUrl(entry.youtubeUrl);
          const label = PAGE_KEY_LABELS[pageKey];

          return (
            <Card key={pageKey} withBorder p="md">
              <Stack gap="sm">
                {/* Header row */}
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <IconPlayerPlay size={16} color="var(--mantine-color-blue-6)" />
                    <Text fw={600} size="sm">
                      {label}
                    </Text>
                    <Badge
                      variant="light"
                      color={entry.enabled ? 'green' : 'gray'}
                      size="sm"
                    >
                      {entry.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </Group>
                  <Tooltip
                    label={entry.enabled ? 'Hide from users (URL preserved)' : 'Show to users'}
                    position="left"
                    withArrow
                  >
                    <Switch
                      checked={entry.enabled}
                      onChange={(e) =>
                        updateField(pageKey, 'enabled', e.currentTarget.checked)
                      }
                      size="sm"
                      color="green"
                    />
                  </Tooltip>
                </Group>

                <Divider />

                {/* URL + thumbnail preview */}
                <Group align="flex-start" gap="sm">
                  <TextInput
                    style={{ flex: 1 }}
                    label="YouTube URL"
                    placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                    value={entry.youtubeUrl}
                    onChange={(e) =>
                      updateField(pageKey, 'youtubeUrl', e.currentTarget.value)
                    }
                  />
                  {thumb ? (
                    <Image
                      src={thumb}
                      w={120}
                      h={68}
                      fit="cover"
                      radius="sm"
                      mt={24}
                      alt="YouTube thumbnail"
                    />
                  ) : null}
                </Group>

                {/* Title + category */}
                <Group grow align="flex-start">
                  <TextInput
                    label="Title (shown on card)"
                    placeholder="e.g. How to add a project"
                    value={entry.title}
                    onChange={(e) =>
                      updateField(pageKey, 'title', e.currentTarget.value)
                    }
                  />
                  <Select
                    label="Category (for Tutorials screen)"
                    data={CATEGORY_OPTIONS}
                    value={entry.category}
                    onChange={(v) =>
                      updateField(pageKey, 'category', v ?? 'General')
                    }
                    allowDeselect={false}
                  />
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      {/* Bottom save button for long-page convenience */}
      <Group justify="flex-end">
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={onSave}
          loading={saving}
        >
          Save all changes
        </Button>
      </Group>
    </Stack>
  );
}
