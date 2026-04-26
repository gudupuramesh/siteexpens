import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

function Row({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <View style={styles.rowLeft}>
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={18} color={color.textMuted} />
        </View>
        <View style={styles.rowBody}>
          <Text variant="body" color="text" style={styles.rowTitle}>{title}</Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted" style={styles.rowSubtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color.textFaint} />
    </Pressable>
  );
}

export default function MoreTabScreen() {
  const { data: org } = useCurrentOrganization();
  const { data: userDoc } = useCurrentUserDoc();
  const initial = (org?.name ?? '?').charAt(0).toUpperCase();

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Text variant="caption" color="textMuted" style={styles.navEyebrow}>ACCOUNT</Text>
        <Text variant="title" color="text" style={styles.navTitle}>More</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.push('/(app)/profile')}
          style={({ pressed }) => [styles.hero, pressed && { opacity: 0.82 }]}
        >
          <View style={styles.avatar}>
            <Text variant="title" color="onPrimary">{initial}</Text>
          </View>
          <View style={styles.heroBody}>
            <Text variant="bodyStrong" color="text" numberOfLines={1}>
              {userDoc?.displayName ?? org?.name ?? 'Member'}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              Principal Designer · Studio Owner
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1} style={styles.heroMeta}>
              HYD · STUDIO/2024/0042
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={color.textFaint} />
        </Pressable>

        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>PROFILE</Text>
        <View style={styles.group}>
          <Row
            icon="person-outline"
            title="Profile details"
            subtitle="Organization, account and trust info"
            onPress={() => router.push('/(app)/profile')}
          />
        </View>

        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>OPERATIONS</Text>
        <View style={styles.group}>
          <Row
            icon="wallet-outline"
            title="Ledger"
            subtitle="All transactions across projects"
            onPress={() => router.push({ pathname: '/(app)/more/ledger', params: { title: 'Ledger' } })}
          />
          <View style={styles.sep} />
          <Row
            icon="people-outline"
            title="Parties"
            subtitle="Clients, vendors, subs and staff"
            onPress={() => router.push('/(app)/(tabs)/parties')}
          />
          <View style={styles.sep} />
          <Row
            icon="shield-checkmark-outline"
            title="ABS Section"
            subtitle="Approvals and governance workflows"
            onPress={() => router.push({ pathname: '/(app)/more/abs', params: { title: 'ABS Section' } })}
          />
        </View>

        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>STUDIO</Text>
        <View style={styles.group}>
          <Row
            icon="business-outline"
            title="Studio dashboard"
            subtitle="Studio-level control center"
            onPress={() => router.push({ pathname: '/(app)/more/studio-dashboard', params: { title: 'Studio dashboard' } })}
          />
          <View style={styles.sep} />
          <Row
            icon="people-circle-outline"
            title="Team & roles"
            subtitle="Members, roles and permissions"
            onPress={() => router.push({ pathname: '/(app)/more/team-roles', params: { title: 'Team & roles' } })}
          />
          <View style={styles.sep} />
          <Row
            icon="receipt-outline"
            title="Billing & subscription"
            subtitle="Plan, invoices and usage"
            onPress={() => router.push({ pathname: '/(app)/more/billing', params: { title: 'Billing & subscription' } })}
          />
          <View style={styles.sep} />
          <Row
            icon="construct-outline"
            title="Integrations"
            subtitle="Connected apps and automations"
            onPress={() => router.push({ pathname: '/(app)/more/integrations', params: { title: 'Integrations' } })}
          />
        </View>

        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>MASTER LIBRARIES</Text>
        <View style={styles.group}>
          <Row
            icon="cube-outline"
            title="Material library"
            subtitle="Manage shared material catalog"
            onPress={() => router.push('/(app)/material-library')}
          />
          <View style={styles.sep} />
          <Row
            icon="layers-outline"
            title="Task category library"
            subtitle="Add/delete timeline categories"
            onPress={() => router.push('/(app)/task-category-library')}
          />
          <View style={styles.sep} />
          <Row
            icon="folder-open-outline"
            title="More libraries"
            subtitle="Future shared masters"
            onPress={() => router.push({ pathname: '/(app)/more/libraries', params: { title: 'More libraries' } })}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  navBar: {
    paddingHorizontal: screenInset,
    paddingTop: 0,
    paddingBottom: 18,
    backgroundColor: color.bgGrouped,
  },
  navEyebrow: { letterSpacing: 1.8, marginBottom: 1, fontSize: 10 },
  navTitle: { fontSize: 25, lineHeight: 30, letterSpacing: -0.5 },
  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: 12,
    paddingBottom: 24,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    borderRadius: radius.none,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.none,
    borderWidth: 1,
    borderColor: color.primary,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flex: 1, marginLeft: space.sm },
  heroMeta: { marginTop: 2, letterSpacing: 1.1 },
  sectionLabel: {
    marginTop: 14,
    marginBottom: 8,
    letterSpacing: 0.4,
  },
  group: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bg,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    paddingHorizontal: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  rowIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, marginLeft: 10, minWidth: 0 },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  sep: {
    height: 1,
    backgroundColor: color.borderStrong,
    marginLeft: space.sm + 28 + 10,
  },
});
