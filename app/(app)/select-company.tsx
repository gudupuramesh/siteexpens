/**
 * Select Company screen — full-page studio switcher.
 *
 * Replaces the previous bottom-sheet flow. Reasons for the change:
 *  - More discoverable than a sheet (matches competitor patterns
 *    in Tally / Zoho / Onsite — users navigate to a "select org"
 *    page, not pull-up a modal).
 *  - Roomier for per-org settings + role labels + future filters.
 *  - Tappable cards include a settings shortcut on the active org.
 *
 * UX rules:
 *  - Active org is highlighted with the primary tint and shows a
 *    small settings (gear) icon — tapping it routes to the studio
 *    profile / team-roles. Other orgs are tap-to-switch.
 *  - Each card shows: avatar (initials), role label in colored
 *    caps, studio name, owner name.
 *  - Tap any non-active row → setActiveOrg → router.replace home.
 *  - Tap active row → no-op (already active); tap its settings
 *    icon → routes to settings.
 *  - "+ Create your studio" footer appears only when the user
 *    doesn't yet own a studio (the one-owned-studio rule).
 */
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { db } from '@/src/lib/firebase';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useMyOrganizations } from '@/src/features/org/useMyOrganizations';
import { useTokenClaims } from '@/src/features/org/useTokenClaims';
import { setActiveOrg } from '@/src/features/org/setActiveOrg';
import { PlanBadge } from '@/src/ui/PlanBadge';
import { StudioAvatar } from '@/src/ui/StudioAvatar';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

/** Map role label colour to give each role a recognisable accent.
 *  Mirrors the competitor's "Supervisor (orange) / Super Admin
 *  (green) / Admin (teal)" pattern. */
const ROLE_COLOR: Record<string, string> = {
  'Super Admin': color.success,
  Admin: color.info,
  Manager: color.primary,
  Accountant: color.warning,
  'Site Engineer': color.primary,
  Supervisor: color.warning,
  Viewer: color.textMuted,
  Client: color.textMuted,
  Member: color.textMuted,
};

export default function SelectCompanyScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: currentOrg } = useCurrentOrganization();
  const { orgs, loading } = useMyOrganizations();
  const { refresh: refreshClaims } = useTokenClaims();

  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeOrgId = currentOrg?.id ?? null;
  const ownsAnOrg = orgs.some((o) => o.isYourStudio);

  const onPickOrg = useCallback(
    async (targetId: string) => {
      if (!user || targetId === activeOrgId) return;
      setPendingTargetId(targetId);
      setBusy(true);
      try {
        // One-shot snapshot listener to wait for the userDoc to
        // reflect the new primaryOrgId (~150 ms). Mirrors the
        // pattern in OrgSwitcherSheet so usePermissions sees the
        // right primary before the next paint.
        const waitForUserDoc = () =>
          new Promise<void>((resolve) => {
            const unsub = db
              .collection('users')
              .doc(user.uid)
              .onSnapshot(
                (snap) => {
                  const next = snap.data() as
                    | { primaryOrgId?: string }
                    | undefined;
                  if (next?.primaryOrgId === targetId) {
                    unsub();
                    resolve();
                  }
                },
                () => {
                  unsub();
                  resolve();
                },
              );
          });
        await setActiveOrg(targetId, {
          refresh: refreshClaims,
          waitForUserDoc,
        });
        // Drop them at home in the new org so a deep-route they
        // had open doesn't render with the new role's reduced
        // permissions and look broken.
        router.replace('/(app)/(tabs)' as never);
      } catch (err) {
        console.warn('[SelectCompany] switch failed:', err);
      } finally {
        setBusy(false);
        setPendingTargetId(null);
      }
    },
    [user, activeOrgId, refreshClaims],
  );

  const onCreateStudio = useCallback(() => {
    if (busy) return;
    router.push('/(onboarding)/organization?mode=add' as never);
  }, [busy]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {/* Custom header — iOS 26's default Stack back button renders
            as an enlarged "Liquid Glass" pill that doesn't always
            respond. A plain chevron + label is more reliable and
            visually quieter. */}
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(app)/(tabs)' as never);
            }}
            hitSlop={12}
            style={({ pressed }) => [
              styles.backBtn,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={color.primary} />
            <Text variant="body" color="primary">Back</Text>
          </Pressable>
          <Text variant="rowTitle" color="text" style={styles.headerTitle}>
            Select Company
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={color.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {orgs.map((row) => {
              const active = row.id === activeOrgId;
              const roleColor = ROLE_COLOR[row.roleLabel] ?? color.textMuted;
              const isPending = busy && pendingTargetId === row.id;
              // Owner line — three states:
              //   "You"        — you own this studio
              //   "<Name>"     — owner's name resolved from memberPublic
              //   "—"          — name not yet loaded OR access denied
              //                  (clients can't read other members'
              //                  memberPublic docs by design).
              const ownerLine = row.isYourStudio
                ? 'You'
                : row.ownerName || '—';

              return (
                <Pressable
                  key={row.id}
                  onPress={() => void onPickOrg(row.id)}
                  disabled={busy || active}
                  style={({ pressed }) => [
                    styles.card,
                    active && styles.cardActive,
                    pressed && !active && { opacity: 0.85 },
                  ]}
                >
                  <StudioAvatar logoUrl={row.logoUrl} size="md" />

                  <View style={styles.body}>
                    <View style={styles.titleRow}>
                      <Text
                        style={[styles.role, { color: roleColor }]}
                        numberOfLines={1}
                      >
                        {row.roleLabel}
                      </Text>
                      <PlanBadge tier={row.tier} size="sm" />
                    </View>
                    <Text variant="rowTitle" color="text" numberOfLines={1}>
                      {row.name}
                    </Text>
                    <Text variant="meta" color="textMuted" numberOfLines={1}>
                      Owner: {ownerLine}
                    </Text>
                  </View>

                  {/* Trailing slot — settings icon for the active org,
                      pending spinner during a switch, otherwise empty
                      so taps register on the whole row. */}
                  {isPending ? (
                    <ActivityIndicator color={color.primary} />
                  ) : active ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push('/(app)/team-roles' as never);
                      }}
                      style={styles.gearBtn}
                      hitSlop={8}
                      accessibilityLabel="Studio settings"
                    >
                      <Ionicons
                        name="settings-outline"
                        size={20}
                        color={color.primary}
                      />
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}

            {!ownsAnOrg ? (
              <Pressable
                onPress={onCreateStudio}
                disabled={busy}
                style={({ pressed }) => [
                  styles.createCard,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={styles.createIcon}>
                  <Ionicons name="add" size={20} color={color.primary} />
                </View>
                <View style={styles.body}>
                  <Text variant="bodyStrong" color="primary">
                    Create your studio
                  </Text>
                  <Text variant="meta" color="textMuted">
                    Set up your own workspace · You stay signed in
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={color.primary}
                />
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bgGrouped,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 80,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    minWidth: 80,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.huge,
    gap: 12,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: space.md,
    backgroundColor: color.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  cardActive: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  role: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },

  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: space.md,
    backgroundColor: color.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.primary,
    borderStyle: 'dashed',
    marginTop: space.xs,
  },
  createIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
  },
});
