/**
 * Profile screen. Shows the signed-in user's company, contact info and a
 * sign-out action. This is a read-only surface in Phase 1 — editing
 * (change company name, update email, upload avatar) lands in a follow-
 * up PR once the org settings flow exists.
 */
import { router, Stack } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { auth } from '@/src/lib/firebase';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { Button } from '@/src/ui/Button';
import { ListRow } from '@/src/ui/ListRow';
import { Screen } from '@/src/ui/Screen';
import { SectionHeader } from '@/src/ui/SectionHeader';
import { Separator } from '@/src/ui/Separator';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, shadow, space } from '@/src/theme';

export default function ProfileScreen() {
  const { data: userDoc, loading: userLoading } = useCurrentUserDoc();
  const { data: org, loading: orgLoading } = useCurrentOrganization();

  async function handleSignOut() {
    await auth.signOut();
  }

  if (userLoading || orgLoading) {
    return (
      <Screen bg="grouped">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      </Screen>
    );
  }

  const companyInitial = (org?.name ?? '?').charAt(0).toUpperCase();
  const displayName = org?.name ?? 'Your firm';
  const email = userDoc?.email ?? org?.email ?? '—';
  const phone = userDoc?.phoneNumber ?? '—';

  return (
    <Screen bg="grouped" padded={false}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Nav bar: back button + centered title */}
      <View style={styles.navBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text variant="title" color="text" style={styles.navGlyph}>
            {'‹'}
          </Text>
        </Pressable>
        <Text variant="title" color="text" style={styles.navTitle}>
          Profile
        </Text>
        <View style={styles.navButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text variant="largeTitle" color="onPrimary">
              {companyInitial}
            </Text>
          </View>
          <Text variant="title" color="text" align="center" style={styles.heroName}>
            {displayName}
          </Text>
          <Text variant="meta" color="textMuted" align="center" style={styles.heroEmail}>
            {email}
          </Text>
        </View>

        {/* Company details group */}
        <SectionHeader>Company</SectionHeader>
        <View style={styles.group}>
          <ListRow title="Company name" trailing={<Text variant="body" color="textMuted">{org?.name ?? '—'}</Text>} />
          <Separator />
          <ListRow title="Email" trailing={<Text variant="body" color="textMuted">{email}</Text>} />
        </View>

        {/* Account details group */}
        <SectionHeader>Account</SectionHeader>
        <View style={styles.group}>
          <ListRow title="Phone" trailing={<Text variant="body" color="textMuted">{phone}</Text>} />
        </View>

        {/* Trust card */}
        <View style={styles.trustCard}>
          <View style={styles.trustRow}>
            <View style={[styles.trustGlyph, { backgroundColor: color.successSoft }]}>
              <Text variant="title" color="success">✓</Text>
            </View>
            <View style={styles.trustBody}>
              <Text variant="rowTitle" color="text">100% Safe</Text>
              <Text variant="meta" color="textMuted">Your data is encrypted end-to-end.</Text>
            </View>
          </View>
          <View style={styles.trustSep} />
          <View style={styles.trustRow}>
            <View style={[styles.trustGlyph, { backgroundColor: color.successSoft }]}>
              <Text variant="title" color="success">↻</Text>
            </View>
            <View style={styles.trustBody}>
              <Text variant="rowTitle" color="text">100% auto Data Backup</Text>
              <Text variant="meta" color="textMuted">All data is linked to your phone number.</Text>
            </View>
          </View>
        </View>

        <View style={styles.signOut}>
          <Button variant="secondary" label="Sign out" onPress={handleSignOut} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenInset,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hairline,
  },
  navButtonPressed: {
    opacity: 0.7,
  },
  navGlyph: {
    fontSize: 26,
    lineHeight: 26,
    marginLeft: -2, // visual centering for the chevron glyph
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    paddingBottom: space.xxxl,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    marginHorizontal: screenInset,
    marginTop: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    alignItems: 'center',
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    ...shadow.hairline,
  },
  trustCard: {
    marginHorizontal: screenInset,
    marginTop: space.xl,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.md,
    ...shadow.hairline,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  trustGlyph: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustBody: {
    flex: 1,
  },
  trustSep: {
    height: 1,
    backgroundColor: color.separator,
    marginLeft: 44 + space.sm,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  heroName: {
    marginBottom: space.xs,
  },
  heroEmail: {},
  group: {
    marginHorizontal: screenInset,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.hairline,
  },
  signOut: {
    marginTop: space.xxl,
    paddingHorizontal: screenInset,
  },
});
