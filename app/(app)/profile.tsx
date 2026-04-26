import { router, Stack } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { auth } from '@/src/lib/firebase';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text variant="caption" color="textMuted" style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function StatCell({ value, label, last }: { value: string | number; label: string; last?: boolean }) {
  return (
    <View style={[styles.statCell, !last && styles.statCellBorder]}>
      <Text variant="title" color="text">{String(value)}</Text>
      <Text variant="caption" color="textMuted" style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FieldRow({
  icon,
  label,
  value,
  action,
  last,
  mono,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  action?: string;
  last?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={[styles.fieldRow, !last && styles.fieldDivider]}>
      <View style={styles.fieldIcon}>
        <Ionicons name={icon} size={14} color={color.textMuted} />
      </View>
      <View style={styles.fieldBody}>
        <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{label}</Text>
        <Text variant="bodyStrong" color="text" style={mono ? styles.mono : undefined}>
          {value || '—'}
        </Text>
      </View>
      {action ? (
        <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.75 }]}>
          <Text variant="metaStrong" color="primary">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ProfileScreen() {
  const { data: userDoc, loading: userLoading } = useCurrentUserDoc();
  const { data: org, loading: orgLoading } = useCurrentOrganization();

  if (userLoading || orgLoading) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      </Screen>
    );
  }

  const orgAny = (org ?? {}) as Record<string, unknown>;
  const userAny = (userDoc ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim().length > 0 ? v : fallback;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;

  const profile = {
    name: str(org?.name, 'Studio Atelier'),
    tagline: str(orgAny.tagline, 'Residential & hospitality interiors · Hyderabad'),
    ownerName: str(userDoc?.displayName, 'Meher Nair'),
    ownerTitle: str(userAny.role, 'Principal Designer · Studio Owner'),
    founded: num(orgAny.founded, 2018),
    email: str(userDoc?.email ?? org?.email, 'hello@studioatelier.in'),
    altEmail: str(userAny.altEmail ?? orgAny.altEmail, 'accounts@studioatelier.in'),
    phone: str(userDoc?.phoneNumber, '+91 98480 11234'),
    altPhone: str(userAny.altPhone ?? orgAny.altPhone, '+91 40 2354 8800'),
    website: str(orgAny.website, 'studioatelier.in'),
    instagram: str(orgAny.instagram, '@studio.atelier'),
    linkedin: str(orgAny.linkedin, 'studio-atelier'),
    address1: str(orgAny.addressLine1, '4-1-7, Gulistan House'),
    address2: str(orgAny.addressLine2, 'Road No. 12, Banjara Hills'),
    city: str(orgAny.city, 'Hyderabad'),
    state: str(orgAny.state, 'Telangana'),
    pincode: str(orgAny.pincode, '500034'),
    country: str(orgAny.country, 'India'),
    gst: str(orgAny.gstin, '36ABCDE1234F1Z5'),
    pan: str(orgAny.pan, 'ABCDE1234F'),
    rera: str(orgAny.rera, 'TS/A0287/2024'),
    bankName: str(orgAny.bankName, 'HDFC Bank'),
    bankAccount: str(orgAny.bankAccount, 'XXXX XXXX 5821'),
    bankIFSC: str(orgAny.bankIFSC, 'HDFC0001045'),
    bankBranch: str(orgAny.bankBranch, 'Banjara Hills, Hyderabad'),
    upi: str(orgAny.upi, 'studioatelier@hdfc'),
    liveProjects: num(orgAny.liveProjects, 6),
    completedProjects: num(orgAny.completedProjects, 41),
    teamSize: Array.isArray(org?.memberIds) ? org.memberIds.length : num(orgAny.teamSize, 12),
    cities: num(orgAny.cities, 3),
  };

  const initials = profile.name.slice(0, 2).toUpperCase();

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={18} color={color.textMuted} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.headerTitle}>Studio profile</Text>
        <Pressable style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.75 }]}>
          <Ionicons name="create-outline" size={13} color={color.text} />
          <Text variant="metaStrong" color="text">Edit</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.coverWrap}>
          <View style={styles.cover} />
          <View style={styles.coverBars}>
            <View style={[styles.bar, { height: 42 }]} />
            <View style={[styles.bar, { height: 58 }]} />
            <View style={[styles.bar, { height: 46 }]} />
            <View style={[styles.bar, { height: 52 }]} />
            <View style={[styles.bar, { height: 38 }]} />
          </View>
        </View>

        <View style={styles.logoRow}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <Text variant="title" color="primary">{initials}</Text>
            </View>
          </View>
          <View style={styles.ownerPill}>
            <Text variant="caption" color="primary">Owner workspace</Text>
          </View>
        </View>

        <View style={styles.identity}>
          <Text variant="largeTitle" color="text" style={styles.name}>{profile.name}</Text>
          <Text variant="body" color="textMuted" style={styles.tagline}>{profile.tagline}</Text>
          <View style={styles.metaLine}>
            <Ionicons name="location-outline" size={12} color={color.textFaint} />
            <Text variant="metaStrong" color="textMuted">
              {profile.city}, {profile.state} · Founded {profile.founded}
            </Text>
          </View>
        </View>

        <View style={styles.stats}>
          <StatCell value={profile.liveProjects} label="LIVE PROJECTS" />
          <StatCell value={profile.completedProjects} label="COMPLETED" />
          <StatCell value={profile.teamSize} label="TEAM" />
          <StatCell value={profile.cities} label="CITIES" last />
        </View>

        <Section title="CONTACT">
          <FieldRow icon="mail-outline" label="PRIMARY EMAIL" value={profile.email} action="Copy" />
          <FieldRow icon="mail-outline" label="ACCOUNTS EMAIL" value={profile.altEmail} />
          <FieldRow icon="call-outline" label="MOBILE" value={profile.phone} action="Call" />
          <FieldRow icon="call-outline" label="STUDIO LINE" value={profile.altPhone} />
          <FieldRow icon="globe-outline" label="WEBSITE" value={profile.website} action="Open" last />
        </Section>

        <Section title="STUDIO ADDRESS">
          <View style={styles.addressRow}>
            <View style={styles.fieldIcon}>
              <Ionicons name="location-outline" size={14} color={color.textMuted} />
            </View>
            <View style={styles.fieldBody}>
              <Text variant="body" color="text">
                {profile.address1}{'\n'}
                {profile.address2}{'\n'}
                {profile.city}, {profile.state} {profile.pincode}{'\n'}
                {profile.country}
              </Text>
            </View>
            <Pressable style={styles.actionBtn}>
              <Text variant="metaStrong" color="primary">Map</Text>
            </Pressable>
          </View>
        </Section>

        <Section title="COMPLIANCE & REGISTRATION">
          <FieldRow icon="archive-outline" label="GSTIN" value={profile.gst} mono />
          <FieldRow icon="shield-outline" label="PAN" value={profile.pan} mono />
          <FieldRow icon="shield-checkmark-outline" label="RERA REGISTRATION" value={profile.rera} mono last />
        </Section>

        <Section title="BANKING">
          <FieldRow icon="business-outline" label="BANK" value={profile.bankName} />
          <FieldRow icon="card-outline" label="ACCOUNT" value={profile.bankAccount} mono />
          <FieldRow icon="key-outline" label="IFSC" value={profile.bankIFSC} mono />
          <FieldRow icon="location-outline" label="BRANCH" value={profile.bankBranch} />
          <FieldRow icon="flash-outline" label="UPI" value={profile.upi} mono last />
        </Section>

        <Section title="SOCIAL & LINKS">
          <FieldRow icon="logo-instagram" label="INSTAGRAM" value={profile.instagram} />
          <FieldRow icon="logo-linkedin" label="LINKEDIN" value={profile.linkedin} last />
        </Section>

        <Section title={`TEAM · ${profile.teamSize}`}>
          <FieldRow icon="person-outline" label="LEAD" value={profile.ownerName} />
          <FieldRow icon="people-outline" label="ROLE" value={profile.ownerTitle} />
          <FieldRow icon="people-circle-outline" label="ACTIVE TEAM" value={`${profile.teamSize} members`} last />
        </Section>

        <Pressable
          onPress={async () => {
            try {
              await auth.signOut();
            } catch (err) {
              Alert.alert('Error', (err as Error).message);
            }
          }}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="log-out-outline" size={16} color={color.danger} />
          <Text variant="bodyStrong" color="danger">Sign out</Text>
        </Pressable>

        <Text variant="caption" color="textMuted" style={styles.footerId}>
          STUDIO ID · {profile.gst.slice(0, 8)} · v1.0
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: screenInset,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1 },
  editBtn: {
    minHeight: 32,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 8,
    backgroundColor: color.bg,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scroll: {
    paddingBottom: 28,
    backgroundColor: color.bg,
  },
  coverWrap: { height: 130, position: 'relative' },
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: color.primary,
  },
  coverBars: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    opacity: 0.2,
  },
  bar: { flex: 1, backgroundColor: '#fff' },
  logoRow: {
    marginTop: -42,
    paddingHorizontal: screenInset,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },
  logoOuter: {
    width: 84,
    height: 84,
    borderRadius: 18,
    backgroundColor: color.bg,
    borderWidth: 3,
    borderColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoInner: {
    width: 56,
    height: 56,
    borderWidth: 1.5,
    borderColor: color.text,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
  },
  ownerPill: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
    marginBottom: 6,
  },
  identity: { paddingHorizontal: screenInset, paddingTop: 10 },
  name: { letterSpacing: -0.5 },
  tagline: { marginTop: 4 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  stats: {
    marginHorizontal: screenInset,
    marginTop: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    backgroundColor: color.surface,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  statCellBorder: { borderRightWidth: 1, borderRightColor: color.borderStrong },
  statLabel: { marginTop: 2, letterSpacing: 0.4 },
  sectionWrap: { marginTop: 18 },
  sectionTitle: { letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: screenInset },
  sectionCard: {
    marginHorizontal: screenInset,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 12,
    backgroundColor: color.bg,
    overflow: 'hidden',
  },
  fieldRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fieldDivider: { borderBottomWidth: 1, borderBottomColor: color.borderStrong },
  fieldIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldBody: { flex: 1, minWidth: 0 },
  fieldLabel: { letterSpacing: 0.4, marginBottom: 2 },
  mono: { letterSpacing: 0.4 },
  actionBtn: {
    minHeight: 28,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 7,
    backgroundColor: color.bg,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  signOut: {
    marginHorizontal: screenInset,
    marginTop: 18,
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
  footerId: {
    marginTop: 12,
    textAlign: 'center',
    letterSpacing: 1,
  },
});
