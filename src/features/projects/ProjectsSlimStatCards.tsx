/**
 * Slim summary stat row for the Projects tab (approved txns, pending materials, open tasks).
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius } from '@/src/theme/tokens';

export type ProjectsSlimStatCardsProps = {
  approvedTxnCount: number;
  pendingMaterialCount: number;
  openTaskCount: number;
  loading: boolean;
};

function SlimStatCard({
  primaryLabel,
  secondaryLabel,
  loading,
  value,
}: {
  primaryLabel: string;
  secondaryLabel: string;
  loading: boolean;
  value: number;
}) {
  return (
    <View style={styles.slimCard}>
      <View style={styles.slimLeft}>
        <Text style={styles.slimPrimary}>{primaryLabel}</Text>
        <View style={styles.slimSubRow}>
          <Text style={styles.slimSecondary}>{secondaryLabel}</Text>
          <Text style={styles.slimArrow}>↗</Text>
        </View>
      </View>
      {loading ? (
        <Text style={styles.slimNum} accessibilityLabel="Loading count">
          …
        </Text>
      ) : (
        <Text style={styles.slimNum}>{value}</Text>
      )}
    </View>
  );
}

export function ProjectsSlimStatCards({
  approvedTxnCount,
  pendingMaterialCount,
  openTaskCount,
  loading,
}: ProjectsSlimStatCardsProps) {
  return (
    <View style={styles.row}>
      <SlimStatCard
        primaryLabel="APPROVED"
        secondaryLabel="TRANSACTION"
        loading={loading}
        value={approvedTxnCount}
      />
      <SlimStatCard
        primaryLabel="REQUEST"
        secondaryLabel="MATERIAL"
        loading={loading}
        value={pendingMaterialCount}
      />
      <SlimStatCard
        primaryLabel="TASKS"
        secondaryLabel="OPEN"
        loading={loading}
        value={openTaskCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  slimCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  slimLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
    justifyContent: 'center',
    gap: 0,
  },
  slimPrimary: {
    fontFamily: fontFamily.sans,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.45,
    color: color.text,
    lineHeight: 11,
  },
  slimSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  slimSecondary: {
    fontFamily: fontFamily.sans,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.35,
    color: color.textMuted,
    lineHeight: 10,
  },
  slimArrow: {
    fontSize: 8,
    color: color.textFaint,
    fontWeight: '400',
  },
  slimNum: {
    fontFamily: fontFamily.sans,
    fontSize: 17,
    fontWeight: '800',
    color: color.primary,
    fontVariant: ['tabular-nums'],
    lineHeight: 20,
  },
});
