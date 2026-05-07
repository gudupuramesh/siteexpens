/**
 * Revenue dashboard — KPIs at the top, tier mix + status mix charts.
 *
 * MRR / ARR are estimated from the displayed pricing (₹499 / ₹1,999
 * / ₹4,999) until Phase C wires RevenueCat. The dashboard labels
 * this clearly so we don't accidentally read it as audited revenue.
 */
import {
  Card,
  Grid,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconTrendingUp } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { callAdmin } from '@/lib/firebase';

type Analytics = Awaited<
  ReturnType<typeof callAdmin.getRevenueAnalytics>
>['data'];

const TIER_COLORS = ['#94a3b8', '#3b82f6', '#6366f1', '#8b5cf6'];
const STATUS_COLORS = ['#22c55e', '#06b6d4', '#f97316', '#94a3b8', '#ef4444'];

export function Revenue() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callAdmin
      .getRevenueAnalytics({})
      .then((res) => setData(res.data))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Stack>
        <Title order={2}>Revenue</Title>
        <Text c="red">{error}</Text>
      </Stack>
    );
  }
  if (!data) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  const tierData = (Object.keys(data.tierMix) as Array<keyof Analytics['tierMix']>).map(
    (key, i) => ({
      tier: key,
      count: data.tierMix[key],
      fill: TIER_COLORS[i],
    }),
  );
  const statusData = (Object.keys(data.statusMix) as Array<keyof Analytics['statusMix']>).map(
    (key, i) => ({
      status: key.replace('_', ' '),
      count: data.statusMix[key],
      fill: STATUS_COLORS[i],
    }),
  );

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Revenue</Title>
        <Text c="dimmed" size="sm">
          MRR / ARR are estimates until Phase C (RevenueCat) ships.
        </Text>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 6, md: 3 }}>
          <KpiCard label="Total studios" value={data.totalOrgs} />
        </Grid.Col>
        <Grid.Col span={{ base: 6, md: 3 }}>
          <KpiCard
            label="Estimated MRR"
            value={`₹${data.mrrInr.toLocaleString('en-IN')}`}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 6, md: 3 }}>
          <KpiCard
            label="Estimated ARR"
            value={`₹${data.arrInr.toLocaleString('en-IN')}`}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 6, md: 3 }}>
          <KpiCard
            label="Trials ending in 14 days"
            value={data.trialEndingSoon}
            hint={
              data.trialEndingSoon > 0 ? 'Conversion focus' : 'Nothing urgent'
            }
          />
        </Grid.Col>
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder p="md" h="100%">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Tier mix</Text>
              <Text c="dimmed" size="xs">
                {data.totalOrgs} orgs
              </Text>
            </Group>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={tierData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tier" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count">
                  {tierData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder p="md" h="100%">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Status mix</Text>
              <Text c="dimmed" size="xs">
                {data.manuallyOverridden} manually overridden
              </Text>
            </Group>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Tooltip />
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={50}
                  outerRadius={90}
                  label={(d) => `${d.status}: ${d.count}`}
                >
                  {statusData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card withBorder p="md">
      <Stack gap={4}>
        <Group gap={6} c="dimmed">
          <IconTrendingUp size={14} stroke={1.5} />
          <Text size="xs" tt="uppercase" lts="0.05em">
            {label}
          </Text>
        </Group>
        <Text fw={700} size="xl">
          {value}
        </Text>
        {hint ? (
          <Text c="dimmed" size="xs">
            {hint}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
