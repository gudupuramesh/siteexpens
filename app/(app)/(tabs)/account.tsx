/**
 * Account tab — v2 design (replaces the old `chats.tsx` More tab).
 *
 * Layout (top → bottom):
 *   1. Inline header: "Account" title (left) + OrgSwitcher chip (right)
 *   2. StudioProfileCard hero (avatar + name + plan + 3 shaded stat blocks)
 *   3. PROFILE  → Profile details
 *   4. OPERATIONS → Ledger, Finance (gated), Parties, ABS Section
 *   5. STUDIO   → Studio dashboard, Team & roles, Billing & subscription, Integrations
 *   6. MASTER LIBRARIES → Material library, Task categories, Staff roles (gated), More libraries
 *   7. LEARN    → Tutorials
 *   8. SUPPORT  → Send feedback
 *   9. LEGAL    → Privacy Policy, Terms of Service
 *  10. Sign out + Delete account (Owner only) + footer note + version
 *
 * The bottom floating tab bar is rendered by `(tabs)/_layout.tsx` via
 * `<AppTabBar>`, so this screen does NOT render its own tab bar.
 */
import { Stack, router } from 'expo-router';
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/src/features/auth/useAuth';
import { useSubscription } from '@/src/features/billing/useSubscription';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useProjects } from '@/src/features/projects/useProjects';
import { auth, callFunction } from '@/src/lib/firebase';
import { openLegalUrl } from '@/src/lib/openLegalUrl';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { IconTile } from '@/src/ui/v2/IconTile';
import { OrgSwitcher } from '@/src/ui/v2/OrgSwitcher';
import { Row } from '@/src/ui/v2/Row';
import { StudioProfileCard } from '@/src/ui/v2/StudioProfileCard';
import { Text } from '@/src/ui/v2/Text';
import { usePullToRefresh } from '@/src/ui/v2/usePullToRefresh';
import { useThemeV2 } from '@/src/theme/v2';

// Legal-link opener moved to `src/lib/openLegalUrl` so the More tab,
// the full subscription screen, and the PaywallSheet teaser all read
// from the same source of truth (`app.json` → `expo.privacyPolicy`
// / `.termsOfService`). Apple guideline 3.1.2(c).

export default function AccountTabScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const refresh = usePullToRefresh();

  const { user } = useAuth();
  const { data: org } = useCurrentOrganization();
  const { effectiveTier, subscription } = useSubscription();
  const { can, isOwner } = usePermissions();
  const { data: projects } = useProjects();

  // ── Derived display fields ────────────────────────────────────────
  const studioName = org?.name ?? 'Studio';
  const tier = (effectiveTier ?? 'free') as 'free' | 'solo' | 'studio' | 'agency';
  const memberCount = org?.memberIds?.length ?? 0;
  const projectCount = projects.length;
  // Subline beneath the studio name — phone is the canonical identifier
  // for our auth (Firebase phone-OTP); fall back to email if absent.
  const cardSubline = user?.phoneNumber ?? user?.email ?? undefined;

  // Plan expiry → split into short DD-MMM value + "Renews" / "Expires"
  // label so the shaded block reads cleanly.
  const { expiryValue, expiryLabel } = (() => {
    if (tier === 'free') return { expiryValue: undefined, expiryLabel: undefined };
    const expiresAt = subscription?.expiresAt?.toDate?.();
    if (!expiresAt) return { expiryValue: undefined, expiryLabel: undefined };
    const value = expiresAt.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    });
    return {
      expiryValue: value,
      expiryLabel: subscription?.willRenew ? 'Renews' : 'Expires',
    };
  })();

  const planValue =
    tier === 'free' ? 'Free plan'
    : tier === 'solo' ? 'Solo · ₹499/mo'
    : tier === 'studio' ? 'Studio · ₹1,999/mo'
    : 'Agency · ₹4,999/mo';

  const billingSubtitleAccess = can('billing.manage');

  // ── Destructive action handlers ───────────────────────────────────
  const onSignOut = () => {
    Alert.alert(
      'Sign out?',
      'You can sign back in with your phone number any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void auth.signOut().catch(() => undefined);
          },
        },
      ],
    );
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your Interior OS account and ALL data you own:\n\n' +
        '• Your profile, phone number, and sign-in credentials\n' +
        '• Every studio you own (and every project, transaction, daily report, photo, and team member inside it)\n' +
        '• Your membership in studios owned by other people (those studios stay running for the other members)\n\n' +
        'This cannot be undone. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS === 'ios') {
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

  const runDelete = async () => {
    try {
      await callFunction<unknown, { ok: true }>('deleteAccount', {});
      await auth.signOut().catch(() => undefined);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const code = e.code ?? '';
      if (code.includes('failed-precondition')) {
        Alert.alert(
          'Cannot delete account',
          e.message ?? 'You still own a studio with other members. Remove them first or contact support.',
        );
      } else {
        Alert.alert(
          'Delete failed',
          e.message ?? 'Please try again, or contact support if the problem persists.',
        );
      }
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Layered background — must be first child of the screen */}
      <AmbientBackground />

      {/* Single-line header: title (left) + OrgSwitcher (right) */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text variant="title2" color="label" style={{ fontWeight: '700' }}>
          Account
        </Text>
        <OrgSwitcher />
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...refresh.props} />}
      >
        {/* Hero: studio profile card with the 5 key details */}
        <StudioProfileCard
          studioName={studioName}
          subline={cardSubline}
          tier={tier}
          expiryValue={expiryValue}
          expiryLabel={expiryLabel}
          stats={{
            projects: String(projectCount),
            members: String(memberCount),
          }}
        />

        {/* PROFILE */}
        <FormGroup header="Profile">
          <Row
            leading={<IconTile icon="person-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Profile details"
            chevron
            onPress={() => router.push('/(app)/profile' as never)}
            divider={false}
          />
        </FormGroup>

        {/* OPERATIONS */}
        <FormGroup header="Operations">
          <Row
            leading={<IconTile icon="wallet-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Ledger"
            chevron
            onPress={() =>
              router.push({
                pathname: '/(app)/more/ledger',
                params: { title: 'Ledger' },
              } as never)
            }
          />
          {can('finance.read') ? (
            <Row
              leading={<IconTile icon="cash-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
              label="Finance"
              chevron
              onPress={() => router.push('/(app)/finance' as never)}
            />
          ) : null}
          <Row
            leading={<IconTile icon="people-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Parties"
            chevron
            onPress={() => router.push('/(app)/parties' as never)}
          />
          <Row
            leading={<IconTile icon="shield-checkmark-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="ABS Section"
            chevron
            onPress={() =>
              router.push({
                pathname: '/(app)/more/abs',
                params: { title: 'ABS Section' },
              } as never)
            }
            divider={false}
          />
        </FormGroup>

        {/* STUDIO */}
        <FormGroup header="Studio">
          <Row
            leading={<IconTile icon="business-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Studio dashboard"
            chevron
            onPress={() =>
              router.push({
                pathname: '/(app)/more/studio-dashboard',
                params: { title: 'Studio dashboard' },
              } as never)
            }
          />
          <Row
            leading={<IconTile icon="people-circle-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Team & roles"
            value={`${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}
            chevron
            onPress={() => router.push('/(app)/team-roles' as never)}
          />
          <Row
            leading={<IconTile icon="card-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Billing & subscription"
            value={billingSubtitleAccess ? planValue : `${tier === 'free' ? 'Free plan' : 'Active'}`}
            chevron
            onPress={() => router.push('/(app)/subscription' as never)}
          />
          <Row
            leading={<IconTile icon="construct-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Integrations"
            chevron
            onPress={() =>
              router.push({
                pathname: '/(app)/more/integrations',
                params: { title: 'Integrations' },
              } as never)
            }
            divider={false}
          />
        </FormGroup>

        {/* MASTER LIBRARIES */}
        <FormGroup header="Master libraries">
          <Row
            leading={<IconTile icon="cube-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Material library"
            chevron
            onPress={() => router.push('/(app)/material-library' as never)}
          />
          <Row
            leading={<IconTile icon="layers-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Task category library"
            chevron
            onPress={() => router.push('/(app)/task-category-library' as never)}
          />
          {can('finance.read') ? (
            <Row
              leading={<IconTile icon="briefcase-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
              label="Staff role library"
              chevron
              onPress={() => router.push('/(app)/staff-role-library' as never)}
            />
          ) : null}
          <Row
            leading={<IconTile icon="folder-open-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="More libraries"
            chevron
            onPress={() =>
              router.push({
                pathname: '/(app)/more/libraries',
                params: { title: 'More libraries' },
              } as never)
            }
            divider={false}
          />
        </FormGroup>

        {/* LEARN */}
        <FormGroup header="Learn">
          <Row
            leading={<IconTile icon="play-circle-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Tutorials"
            chevron
            onPress={() =>
              router.push({
                pathname: '/(app)/more/tutorials',
                params: { title: 'Tutorials' },
              } as never)
            }
            divider={false}
          />
        </FormGroup>

        {/* SUPPORT */}
        <FormGroup header="Support">
          <Row
            leading={<IconTile icon="chatbubble-ellipses-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Send feedback"
            chevron
            onPress={() => router.push('/(app)/feedback' as never)}
            divider={false}
          />
        </FormGroup>

        {/* LEGAL */}
        <FormGroup header="Legal">
          <Row
            leading={<IconTile icon="document-text-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Privacy Policy"
            chevron
            onPress={() => void openLegalUrl('privacyPolicy', 'Privacy Policy')}
          />
          <Row
            leading={<IconTile icon="reader-outline" color={t.colors.fill3} glyphColor={t.colors.secondary} />}
            label="Terms of Service"
            chevron
            onPress={() => void openLegalUrl('termsOfService', 'Terms of Service')}
            divider={false}
          />
        </FormGroup>

        {/* Destructive actions */}
        <View style={styles.destructiveBlock}>
          <Pressable
            onPress={onSignOut}
            style={({ pressed }) => [
              styles.destructiveBtn,
              {
                backgroundColor: t.colors.surface,
                borderRadius: t.radii.field,
                borderColor:
                  t.mode === 'dark'
                    ? 'rgba(255,255,255,0.05)'
                    : 'rgba(0,0,0,0.04)',
                borderWidth: t.hairline,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="log-out-outline" size={16} color={t.palette.red.base} />
            <Text
              variant="body"
              style={{ color: t.palette.red.base, fontWeight: '600', marginLeft: 6 }}
            >
              Sign out
            </Text>
          </Pressable>

          {isOwner ? (
            <Pressable
              onPress={onDeleteAccount}
              style={({ pressed }) => [
                styles.destructiveBtn,
                {
                  backgroundColor:
                    t.mode === 'dark'
                      ? 'rgba(255,69,58,0.12)'
                      : 'rgba(255,59,48,0.08)',
                  borderRadius: t.radii.field,
                  borderColor:
                    t.mode === 'dark'
                      ? 'rgba(255,69,58,0.3)'
                      : 'rgba(255,59,48,0.25)',
                  borderWidth: t.hairline,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                variant="body"
                style={{ color: t.palette.red.base, fontWeight: '600' }}
              >
                Delete account
              </Text>
            </Pressable>
          ) : null}

          <Text variant="caption2" color="tertiary" style={styles.destructiveNote}>
            Account deletion is permanent. Projects, expenses, photos and library data are erased.
          </Text>
        </View>

        {/* Version footer */}
        <Text variant="caption2" color="tertiary" style={styles.versionLine}>
          Interior OS · v1.0.4
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingTop: 0,
    paddingBottom: 130, // leave room for the floating tab bar
  },

  // Single-line header: "Account" title on the left, OrgSwitcher on the right.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },

  destructiveBlock: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 10,
  },
  destructiveBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  destructiveNote: {
    paddingHorizontal: 16,
    paddingTop: 6,
    textAlign: 'center',
  },
  versionLine: {
    paddingHorizontal: 20,
    paddingTop: 22,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
