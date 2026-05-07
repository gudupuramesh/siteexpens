import { router, Stack } from 'expo-router';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Constants from 'expo-constants';

import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useSubscription } from '@/src/features/billing/useSubscription';
import { auth, callFunction } from '@/src/lib/firebase';
import { useState } from 'react';
import { OrgSwitcherChip } from '@/src/ui/OrgSwitcherChip';
import { PlanBadge } from '@/src/ui/PlanBadge';
import { Screen } from '@/src/ui/Screen';
import { StudioAvatar } from '@/src/ui/StudioAvatar';
import { TabLoadingSkeleton } from '@/src/ui/TabLoadingSkeleton';
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

/** Open a legal URL declared in app.json's `expo` block.
 *  Source of truth lives in app.json so the URL we surface in-app
 *  matches what was submitted to the App Store / Play Store review
 *  questionnaire — they MUST be identical or Apple's review bot
 *  flags the listing. Falls back to a friendly message if the URL
 *  isn't configured or the device can't open it. */
async function openLegalUrl(key: 'privacyPolicy' | 'termsOfService', label: string) {
  const expoExtra = (Constants.expoConfig ?? {}) as Record<string, unknown>;
  const url = typeof expoExtra[key] === 'string' ? (expoExtra[key] as string) : '';
  if (!url) {
    Alert.alert(label, `${label} link is not configured yet.`);
    return;
  }
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert(label, `Cannot open ${url}`);
      return;
    }
    await Linking.openURL(url);
  } catch (err) {
    Alert.alert(label, (err as Error).message);
  }
}

export default function MoreTabScreen() {
  const { data: org, loading: orgLoading } = useCurrentOrganization();
  const { data: userDoc, loading: userLoading } = useCurrentUserDoc();
  const { can } = usePermissions();
  const { effectiveTier } = useSubscription();
  const [deleting, setDeleting] = useState(false);

  // Studio logo URL — already typed on Organization via
  // OrganizationProfileExtras, so direct access is type-safe.
  // Falls back to StudioAvatar's built-in icon when not set.
  const orgLogoUrl = org?.logoUrl ?? null;

  // Show skeleton while the org/user docs are first hydrating. Without
  // this the screen renders an empty <ScrollView> on tab re-mount,
  // looking like a broken page until the snapshot arrives ~100-500ms
  // later. See plan: "Fix 1 — blank top on tab switch".
  if ((orgLoading || userLoading) && !org && !userDoc) {
    return <TabLoadingSkeleton />;
  }

  // Account deletion is a HARD requirement of both App Store Review
  // Guideline 5.1.1(v) and Google Play. Two-step confirmation:
  //   1. Initial alert explaining what will be deleted
  //   2. Final destructive Alert ("Delete forever") OR on iOS a
  //      type-DELETE prompt (Alert.prompt is iOS-only)
  // Then the deleteAccount Cloud Function does the cascade. After
  // success the auth listener auto-routes back to sign-in.
  const runDelete = async () => {
    setDeleting(true);
    try {
      await callFunction<unknown, { ok: true }>('deleteAccount', {});
      // Auth listener picks up the revoked token and routes to sign-in.
      await auth.signOut().catch(() => undefined);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const code = e.code ?? '';
      if (code.includes('failed-precondition')) {
        Alert.alert('Cannot delete account', e.message ?? 'You still own a studio with other members. Remove them first or contact support.');
      } else {
        Alert.alert('Delete failed', e.message ?? 'Please try again, or contact support if the problem persists.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your Interior OS account and ALL data you own:\n\n• Your profile, phone number, and sign-in credentials\n• Every studio you own (and every project, transaction, daily report, photo, and team member inside it)\n• Your membership in studios owned by other people (those studios stay running for the other members)\n\nThis cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS === 'ios') {
              // iOS: type DELETE to confirm (Alert.prompt available).
              Alert.prompt(
                'Type DELETE to confirm',
                'To prevent accidental deletion, type the word DELETE in capital letters.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete my account',
                    style: 'destructive',
                    onPress: (text?: string) => {
                      if ((text ?? '').trim() !== 'DELETE') {
                        Alert.alert('Not deleted', 'You did not type DELETE — your account is safe.');
                        return;
                      }
                      void runDelete();
                    },
                  },
                ],
                'plain-text',
              );
            } else {
              // Android: Alert.prompt is iOS-only, so a second
              // destructive confirm is the safest cross-platform pattern.
              Alert.alert(
                'Last chance',
                'This will delete your account and all your data immediately. There is no undo.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete forever',
                    style: 'destructive',
                    onPress: () => void runDelete(),
                  },
                ],
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <View style={styles.navTitleRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="textMuted" style={styles.navEyebrow}>ACCOUNT</Text>
            <Text variant="title" color="text" style={styles.navTitle}>More</Text>
          </View>
          {/* Universal studio switcher — most reliable spot for
              roles that don't see the Overview tab. */}
          <OrgSwitcherChip />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => router.push('/(app)/profile')}
          style={({ pressed }) => [styles.hero, pressed && { opacity: 0.82 }]}
        >
          <StudioAvatar logoUrl={orgLogoUrl} size="lg" />
          <View style={styles.heroBody}>
            <View style={styles.heroTitleRow}>
              <Text
                variant="bodyStrong"
                color="text"
                numberOfLines={1}
                style={styles.heroName}
              >
                {userDoc?.displayName ?? org?.name ?? 'Member'}
              </Text>
              <PlanBadge tier={effectiveTier} size="sm" />
            </View>
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
          {can('finance.read') ? (
            <>
              <View style={styles.sep} />
              <Row
                icon="cash-outline"
                title="Finance"
                subtitle="Dashboard, office expenses, staff and payroll"
                onPress={() => router.push('/(app)/finance' as never)}
              />
            </>
          ) : null}
          <View style={styles.sep} />
          <Row
            icon="people-outline"
            title="Parties"
            subtitle="Clients, vendors, subs and staff"
            onPress={() => router.push('/(app)/parties')}
          />
          <View style={styles.sep} />
          <Row
            icon="shield-checkmark-outline"
            title="ABS Section"
            subtitle="Approvals and governance workflows"
            onPress={() => router.push({ pathname: '/(app)/more/abs', params: { title: 'ABS Section' } } as never)}
          />
        </View>

        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>STUDIO</Text>
        <View style={styles.group}>
          <Row
            icon="business-outline"
            title="Studio dashboard"
            subtitle="Studio-level control center"
            onPress={() => router.push({ pathname: '/(app)/more/studio-dashboard', params: { title: 'Studio dashboard' } } as never)}
          />
          <View style={styles.sep} />
          <Row
            icon="people-circle-outline"
            title="Team & roles"
            subtitle="Members, roles and permissions"
            onPress={() => router.push('/(app)/team-roles')}
          />
          <View style={styles.sep} />
          <Row
            icon="receipt-outline"
            title="Billing & subscription"
            subtitle={
              can('billing.manage')
                ? 'Plan, invoices and usage'
                : 'Plan and usage (managed by Studio Owner)'
            }
            onPress={() => router.push('/(app)/subscription' as never)}
          />
          <View style={styles.sep} />
          <Row
            icon="construct-outline"
            title="Integrations"
            subtitle="Connected apps and automations"
            onPress={() => router.push({ pathname: '/(app)/more/integrations', params: { title: 'Integrations' } } as never)}
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
          {can('finance.read') ? (
            <>
              <View style={styles.sep} />
              <Row
                icon="briefcase-outline"
                title="Staff role library"
                subtitle="Position titles for your studio team"
                onPress={() => router.push('/(app)/staff-role-library' as never)}
              />
            </>
          ) : null}
          <View style={styles.sep} />
          <Row
            icon="folder-open-outline"
            title="More libraries"
            subtitle="Future shared masters"
            onPress={() => router.push({ pathname: '/(app)/more/libraries', params: { title: 'More libraries' } } as never)}
          />
        </View>

        {/* Learn — tutorial videos configured by the app admin.
            Opens the Tutorials screen which groups all enabled
            videos by category. Shown regardless of role — everyone
            benefits from seeing how the app works. */}
        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>LEARN</Text>
        <View style={styles.group}>
          <Row
            icon="play-circle-outline"
            title="Tutorials"
            subtitle="Video guides for every feature"
            onPress={() => router.push('/(app)/more/tutorials' as never)}
          />
        </View>

        {/* Support — direct line to the team. Open to every member of
            every org (no role gate) so a Site Engineer can flag a bug
            in their corner of the app without waiting for the owner.
            Submissions land in `feedback/{id}` for the App Owner to
            triage from the web admin portal. */}
        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>SUPPORT</Text>
        <View style={styles.group}>
          <Row
            icon="chatbubble-ellipses-outline"
            title="Send feedback"
            subtitle="Report a bug, request a feature, or share an idea"
            onPress={() => router.push('/(app)/feedback' as never)}
          />
        </View>

        {/* Legal — store-required links (Privacy Policy + Terms of
            Service). URLs are surfaced on app.json so they stay in
            sync with what's submitted to the App Store / Play Store
            review. Falls back to a friendly alert if the URL is
            missing or the device can't open it. */}
        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>LEGAL</Text>
        <View style={styles.group}>
          <Row
            icon="document-text-outline"
            title="Privacy Policy"
            subtitle="How we handle your data"
            onPress={() => openLegalUrl('privacyPolicy', 'Privacy Policy')}
          />
          <View style={styles.sep} />
          <Row
            icon="reader-outline"
            title="Terms of Service"
            subtitle="The rules for using Interior OS"
            onPress={() => openLegalUrl('termsOfService', 'Terms of Service')}
          />
        </View>

        {/* Account — required by App Store + Play Store policy.
            "Delete account" must be reachable in-app for any account-
            creation flow. Two-step confirmation guards against taps. */}
        <Text variant="caption" color="textMuted" style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.group}>
          <Row
            icon="trash-outline"
            title={deleting ? 'Deleting account…' : 'Delete account'}
            subtitle="Permanently remove your account and all data"
            onPress={deleting ? () => undefined : onDeleteAccount}
          />
        </View>

        {/* Sign out — kept at the bottom of the Settings scroll (not
            on the studio profile page) so it's a deliberate action,
            not something the user trips on while reading their
            studio info. Confirmation dialog mirrors the destructive
            patterns used elsewhere (remove cover / remove logo). */}
        <Pressable
          onPress={() => {
            Alert.alert(
              'Sign out?',
              'You can sign back in any time with your phone number.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign out',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await auth.signOut();
                    } catch (err) {
                      Alert.alert('Error', (err as Error).message);
                    }
                  },
                },
              ],
            );
          }}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={16} color={color.danger} />
          <Text variant="bodyStrong" color="danger">Sign out</Text>
        </Pressable>
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
  navTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
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
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  heroBody: { flex: 1, marginLeft: space.sm, minWidth: 0 },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Lets the name truncate cleanly when the badge takes its share
  // of the row's width — without `flexShrink`, long names push the
  // badge off the right edge.
  heroName: { flexShrink: 1 },
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
  signOut: {
    marginTop: space.lg,
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.danger,
    borderRadius: 10,
    backgroundColor: 'rgba(220,38,38,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
