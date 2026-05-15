/**
 * Select Studio — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header: back · "Select studio" · count caption
 *   2. Active studio hero card (when present) — full bleed surface
 *      card with cover-y plan tint + name + role pill + plan badge +
 *      "Active" status pill + Settings shortcut
 *   3. "Other studios" section card with rows for the rest — tap to
 *      switch (with spinner during the switch)
 *   4. Dashed "Create your studio" CTA (only when user doesn't own one)
 *
 * Switching flow preserved exactly:
 *   • One-shot snapshot listener waits for `users/{uid}.primaryOrgId`
 *     to mirror the new org (~150 ms) before redirecting home — so
 *     `usePermissions` sees the new role on the very first render.
 *   • Auth claims refreshed via `refreshClaims`.
 *   • Lands at `/(app)/(tabs)` so any deep route the user had open
 *     doesn't render with the new role's reduced permissions.
 */
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { db } from '@/src/lib/firebase';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useMyOrganizations, type MyOrgRow } from '@/src/features/org/useMyOrganizations';
import { useTokenClaims } from '@/src/features/org/useTokenClaims';
import { setActiveOrg } from '@/src/features/org/setActiveOrg';
import { PlanBadge } from '@/src/ui/PlanBadge';
import { StudioAvatar } from '@/src/ui/StudioAvatar';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { ProgressOverlay } from '@/src/ui/v2/ProgressOverlay';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

/**
 * Per-role tone for the role pill on each org card.
 *
 * Color discipline: roles are categorical labels. Only "Super Admin" keeps
 * a coloured pill (red, for emphasis on the privileged role). Everything else
 * uses a neutral tone (fill3 + secondary).
 *
 * Returns a palette-shaped object so consuming JSX (`tone.soft`, `tone.base`)
 * doesn't need branching.
 */
function roleTone(
  roleLabel: string,
  t: ReturnType<typeof useThemeV2>,
): { base: string; soft: string; softDark: string } {
  if (roleLabel === 'Super Admin') return t.palette.red;
  return {
    base: t.colors.secondary,
    soft: t.colors.fill3,
    softDark: t.colors.fill3,
  };
}

export default function SelectCompanyScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const refresh = usePullToRefresh();
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
        // One-shot snapshot listener — wait for userDoc.primaryOrgId
        // to flip before redirecting so `usePermissions` sees the
        // new role on the very first paint.
        const waitForUserDoc = () =>
          new Promise<void>((resolve) => {
            const unsub = db
              .collection('users')
              .doc(user.uid)
              .onSnapshot(
                (snap) => {
                  const next = snap.data() as { primaryOrgId?: string } | undefined;
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

  const activeRow = orgs.find((o) => o.id === activeOrgId) ?? null;
  const otherRows = orgs.filter((o) => o.id !== activeOrgId);
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* Header — transparent so the ambient background flows through;
          no bottom border (the section header below provides separation). */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(app)/(tabs)' as never);
          }}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: t.colors.fill3, borderRadius: 999 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="headline" color="label">
            Select studio
          </Text>
          <Text
            variant="caption2"
            color="secondary"
            style={{ letterSpacing: 0.5, marginTop: 1 }}
          >
            {orgs.length} {orgs.length === 1 ? 'STUDIO' : 'STUDIOS'}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl {...refresh.props} />}
        >
          {/* Active studio hero */}
          {activeRow ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <Text
                variant="caption2"
                color="secondary"
                style={{ paddingHorizontal: 16, paddingBottom: 7, letterSpacing: 0.4 }}
              >
                ACTIVE
              </Text>
              <ActiveCard
                row={activeRow}
                onCardPress={() => router.push('/(app)/profile' as never)}
                onTeamPress={() => router.push('/(app)/team-roles' as never)}
              />
            </View>
          ) : null}

          {/* Other studios */}
          {otherRows.length > 0 ? (
            <View style={{ marginTop: 24 }}>
              <View style={styles.sectionHeader}>
                <Text
                  variant="caption2"
                  color="secondary"
                  style={{ letterSpacing: 0.4 }}
                >
                  SWITCH TO
                </Text>
                <Text variant="caption2" color="tertiary">
                  {otherRows.length}
                </Text>
              </View>
              <View
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: cardBg,
                    borderRadius: t.radii.group,
                    borderColor: cardBorder,
                    borderWidth: t.hairline,
                  },
                ]}
              >
                {otherRows.map((row, idx) => {
                  const isPending = busy && pendingTargetId === row.id;
                  return (
                    <OrgRow
                      key={row.id}
                      row={row}
                      divider={idx < otherRows.length - 1}
                      pending={isPending}
                      disabled={busy}
                      onPress={() => void onPickOrg(row.id)}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Empty state — only fires when there are 0 orgs at all */}
          {orgs.length === 0 ? (
            <View style={{ paddingVertical: 64, paddingHorizontal: 32, alignItems: 'center' }}>
              <View
                style={[
                  styles.emptyIcon,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                    borderRadius: t.radii.tile + 4,
                  },
                ]}
              >
                <Ionicons name="business-outline" size={28} color={t.palette.blue.base} />
              </View>
              <Text
                variant="headline"
                color="label"
                style={{ marginTop: 12, fontWeight: '600' }}
              >
                No studios yet
              </Text>
              <Text
                variant="footnote"
                color="secondary"
                style={{ marginTop: 4, textAlign: 'center' }}
              >
                Create one to start managing projects and your team.
              </Text>
            </View>
          ) : null}

          {/* Create studio CTA */}
          {!ownsAnOrg ? (
            <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
              <Pressable
                onPress={onCreateStudio}
                disabled={busy}
                style={({ pressed }) => [
                  styles.createCard,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                    borderRadius: t.radii.card,
                    borderColor: t.palette.blue.base + '55',
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                  },
                  pressed && { opacity: 0.85 },
                  busy && { opacity: 0.5 },
                ]}
              >
                <View
                  style={[
                    styles.createIcon,
                    {
                      backgroundColor: t.palette.blue.base,
                      borderRadius: t.radii.tile,
                    },
                  ]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    variant="body"
                    style={{
                      color: t.palette.blue.base,
                      fontWeight: '700',
                    }}
                  >
                    Create your studio
                  </Text>
                  <Text
                    variant="caption1"
                    color="secondary"
                    style={{ marginTop: 2 }}
                  >
                    Set up your own workspace · You stay signed in
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={t.palette.blue.base}
                />
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Full-screen blocking overlay during the switch — the per-row
          spinner above stays visible underneath via the dimmed
          backdrop, but this gives the user a clearer "yes, something
          IS happening" signal during the ~1-2 s claim refresh +
          snapshot wait + redirect. */}
      <ProgressOverlay
        visible={busy}
        title="Switching studio"
        subtitle={
          orgs.find((o) => o.id === pendingTargetId)?.name ?? undefined
        }
      />
    </View>
  );
}

function ActiveCard({
  row,
  onCardPress,
  onTeamPress,
}: {
  row: MyOrgRow;
  /** Tap on the card body → studio profile screen. */
  onCardPress: () => void;
  /** Tap on the small person-add chip → team & roles screen.
   *  Wrapped in its own Pressable so the tap doesn't bubble up to
   *  `onCardPress`. */
  onTeamPress: () => void;
}) {
  const t = useThemeV2();
  const tone = roleTone(row.roleLabel, t);
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const ownerLine = row.isYourStudio ? 'You' : row.ownerName || '—';

  return (
    <Pressable
      onPress={onCardPress}
      style={({ pressed }) => [
        styles.activeCard,
        {
          backgroundColor: cardBg,
          borderRadius: t.radii.card,
          borderColor: t.palette.blue.base + '33',
          borderWidth: 1.5,
        },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, open studio profile`}
    >
      {/* Top row: avatar + name + plan badge */}
      <View style={styles.activeTop}>
        <StudioAvatar logoUrl={row.logoUrl} size="md" />
        <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <Text
            variant="title3"
            color="label"
            numberOfLines={1}
            style={{ fontWeight: '700', letterSpacing: -0.3 }}
          >
            {row.name}
          </Text>
          <Text
            variant="caption1"
            color="secondary"
            numberOfLines={1}
            style={{ marginTop: 2 }}
          >
            Owner: {ownerLine}
          </Text>
        </View>
        <Pressable
          onPress={onTeamPress}
          hitSlop={10}
          style={({ pressed }) => [
            styles.gearBtn,
            {
              backgroundColor:
                t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
              borderRadius: 999,
            },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Manage team & roles"
        >
          {/* person-add reads as "add a teammate" — opens Team &
              Roles in one tap. The outer card Pressable handles the
              "open studio profile" intent. */}
          <Ionicons
            name="person-add"
            size={15}
            color={t.palette.blue.base}
          />
        </Pressable>
      </View>

      {/* Pill row */}
      <View style={[styles.activePillRow, { borderTopColor: cardBorder, borderTopWidth: t.hairline }]}>
        <View
          style={[
            styles.activePill,
            {
              backgroundColor: t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft,
              borderRadius: 999,
            },
          ]}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: t.palette.green.base,
              marginRight: 5,
            }}
          />
          <Text
            variant="caption2"
            style={{
              color: t.palette.green.base,
              fontWeight: '700',
              letterSpacing: 0.4,
            }}
          >
            ACTIVE
          </Text>
        </View>
        <View
          style={[
            styles.activePill,
            {
              backgroundColor: t.mode === 'dark' ? tone.softDark : tone.soft,
              borderRadius: 999,
            },
          ]}
        >
          <Text
            variant="caption2"
            style={{
              color: tone.base,
              fontWeight: '700',
              letterSpacing: 0.4,
            }}
            numberOfLines={1}
          >
            {row.roleLabel.toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <PlanBadge tier={row.tier} size="sm" />
      </View>
    </Pressable>
  );
}

function OrgRow({
  row,
  divider,
  pending,
  disabled,
  onPress,
}: {
  row: MyOrgRow;
  divider: boolean;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useThemeV2();
  const tone = roleTone(row.roleLabel, t);
  const ownerLine = row.isYourStudio ? 'You' : row.ownerName || '—';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.orgRow,
        pressed && !disabled && { backgroundColor: t.colors.fill3 },
        disabled && pending && { opacity: 1 },
        disabled && !pending && { opacity: 0.5 },
      ]}
    >
      <StudioAvatar logoUrl={row.logoUrl} size="md" />

      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <View style={styles.rowTitleLine}>
          <Text
            variant="body"
            color="label"
            style={{ flex: 1 }}
            numberOfLines={1}
          >
            {row.name}
          </Text>
          <PlanBadge tier={row.tier} size="sm" />
        </View>
        <View style={styles.rowMetaLine}>
          <View
            style={[
              styles.rolePill,
              {
                backgroundColor: t.mode === 'dark' ? tone.softDark : tone.soft,
                borderRadius: 999,
              },
            ]}
          >
            <Text
              variant="caption2"
              style={{
                color: tone.base,
                fontWeight: '700',
                letterSpacing: 0.4,
              }}
              numberOfLines={1}
            >
              {row.roleLabel.toUpperCase()}
            </Text>
          </View>
          <Text
            variant="caption1"
            color="secondary"
            numberOfLines={1}
            style={{ marginLeft: 8, flex: 1 }}
          >
            Owner: {ownerLine}
          </Text>
        </View>
      </View>

      {pending ? (
        <ActivityIndicator color={t.palette.blue.base} style={{ marginLeft: 8 }} />
      ) : (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={t.colors.tertiary}
          style={{ marginLeft: 8 }}
        />
      )}

      {divider ? (
        <View
          style={[
            styles.rowDivider,
            { backgroundColor: t.colors.separator, left: 64 },
          ]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    gap: 10,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Active card
  activeCard: {
    overflow: 'hidden',
  },
  activeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },
  gearBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  activePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 7,
  },
  sectionCard: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },

  // Org row
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 76,
    position: 'relative',
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 130,
  },
  rowDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  // Empty
  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Create CTA
  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  createIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
