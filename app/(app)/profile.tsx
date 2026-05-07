import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { db, firestore } from '@/src/lib/firebase';
import { guessImageMimeType, uploadToR2 } from '@/src/lib/r2Upload';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { usePermissions } from '@/src/features/org/usePermissions';
import { useSubscription } from '@/src/features/billing/useSubscription';
import { PlanBadge } from '@/src/ui/PlanBadge';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, screenInset, space } from '@/src/theme';

/** "3 of 5 filled" summary for collapsed accordion sections.
 *  Returns undefined when the values aren't a meaningful preview
 *  source so the header just shows the title. */
function summarizeFilled(values: string[], total: number): string | undefined {
  const filled = values.filter((v) => typeof v === 'string' && v.trim().length > 0).length;
  if (total === 0) return undefined;
  if (filled === 0) return 'Not set';
  if (filled === total) return `${total} of ${total} filled`;
  return `${filled} of ${total} filled`;
}

/**
 * Section — collapsible accordion. Header is a single tappable
 * row (section title + preview + chevron). When expanded the
 * children render flat below the header — no surrounding
 * bounded card, just plain rows separated by hairlines. The
 * caller passes the matching `editKey` so a small pencil button
 * in the header can deep-link into the corresponding edit form
 * section (`/(app)/edit-studio-profile?section={editKey}`).
 *
 * Why flat-on-expand: an extra bounded card inside the section
 * header made the rows feel doubly-boxed — title row, then a
 * card under it, then rows inside the card. Dropping the inner
 * card gives a single visual rhythm: header row → divider →
 * data row → divider → data row.
 */
function Section({
  title,
  preview,
  editKey,
  canEdit,
  children,
  initiallyOpen,
}: {
  title: string;
  /** One-line summary shown beside the title when collapsed. */
  preview?: string;
  /** When set + canEdit is true, the header shows a pencil button
   *  that deep-links into the matching edit-form section. */
  editKey?: string;
  canEdit?: boolean;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <View style={styles.sectionWrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && { backgroundColor: color.surfaceAlt },
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${preview ? ' — ' + preview : ''}`}
      >
        <View style={styles.sectionHeaderText}>
          <Text variant="caption" color="textMuted" style={styles.sectionTitle}>
            {title}
          </Text>
          {preview ? (
            <Text variant="meta" color="textFaint" numberOfLines={1} style={styles.sectionPreview}>
              {preview}
            </Text>
          ) : null}
        </View>
        {open && canEdit && editKey ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              router.push({
                pathname: '/(app)/edit-studio-profile',
                params: { section: editKey },
              });
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.sectionEditBtn,
              pressed && { opacity: 0.6 },
            ]}
            accessibilityLabel={`Edit ${title}`}
          >
            <Ionicons name="create-outline" size={16} color={color.primary} />
          </Pressable>
        ) : null}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={color.textMuted}
        />
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

/**
 * FieldRow — flat row showing a label + value, with an optional
 * inline action button (Copy / Call / Open). No icon disc, no
 * surrounding card. Each row's only structural decoration is a
 * hairline divider on its bottom edge (suppressed by `last`).
 *
 * The leading icon parameter is accepted for API compatibility
 * with existing call sites but no longer rendered — the LABEL
 * caps already explain what each row is and the disc was making
 * sections feel cluttered.
 */
function FieldRow({
  // icon is intentionally accepted but unused — see jsdoc above.
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
  const { user } = useAuth();
  const { data: userDoc, loading: userLoading } = useCurrentUserDoc();
  const { data: org, loading: orgLoading } = useCurrentOrganization();
  const { can } = usePermissions();
  const { effectiveTier } = useSubscription();
  const canEditStudio = can('studio.edit');
  const [uploading, setUploading] = useState<null | 'cover' | 'logo'>(null);

  /** Stable org id for uploads — available from user doc before org snapshot resolves. */
  const orgId = org?.id ?? userDoc?.primaryOrgId ?? null;

  const runImagePick = useCallback(
    async (source: 'camera' | 'library') => {
      if (source === 'library') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Allow photo access to set studio images.');
          return null;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
        });
        return result.canceled ? null : result.assets[0] ?? null;
      }
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to take a photo.');
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      return result.canceled ? null : result.assets[0] ?? null;
    },
    [],
  );

  const uploadCover = useCallback(
    async (source: 'camera' | 'library') => {
      if (!orgId || !user) return;
      const asset = await runImagePick(source);
      if (!asset?.uri) return;
      setUploading('cover');
      try {
        const contentType = asset.mimeType || guessImageMimeType(asset.uri);
        // Use `project_cover` kind so uploads work with older deployed functions.
        // refId suffix keeps studio assets distinct under `project_cover/{refId}/`.
        const { publicUrl, key } = await uploadToR2({
          localUri: asset.uri,
          contentType,
          kind: 'project_cover',
          refId: `${orgId}_studio_cover`,
          compress: 'high',
        });
        await db.collection('organizations').doc(orgId).update({
          coverPhotoUrl: publicUrl,
          coverPhotoR2Key: key,
        });
      } catch (e) {
        Alert.alert('Cover upload failed', (e as Error).message);
      } finally {
        setUploading(null);
      }
    },
    [orgId, user, runImagePick],
  );

  const uploadLogo = useCallback(
    async (source: 'camera' | 'library') => {
      if (!orgId || !user) return;
      const asset = await runImagePick(source);
      if (!asset?.uri) return;
      setUploading('logo');
      try {
        const contentType = asset.mimeType || guessImageMimeType(asset.uri);
        const { publicUrl, key } = await uploadToR2({
          localUri: asset.uri,
          contentType,
          kind: 'project_cover',
          refId: `${orgId}_studio_logo`,
          compress: 'aggressive',
        });
        await db.collection('organizations').doc(orgId).update({
          logoUrl: publicUrl,
          logoR2Key: key,
        });
      } catch (e) {
        Alert.alert('Icon upload failed', (e as Error).message);
      } finally {
        setUploading(null);
      }
    },
    [orgId, user, runImagePick],
  );

  const removeCover = useCallback(() => {
    if (!orgId) return;
    Alert.alert('Remove cover photo?', 'Your studio profile will show the default header.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.collection('organizations').doc(orgId).update({
              coverPhotoUrl: firestore.FieldValue.delete(),
              coverPhotoR2Key: firestore.FieldValue.delete(),
            });
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  }, [orgId]);

  const removeLogo = useCallback(() => {
    if (!orgId) return;
    Alert.alert('Remove profile icon?', 'Initials will show until you add a new icon.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.collection('organizations').doc(orgId).update({
              logoUrl: firestore.FieldValue.delete(),
              logoR2Key: firestore.FieldValue.delete(),
            });
          } catch (e) {
            Alert.alert('Error', (e as Error).message);
          }
        },
      },
    ]);
  }, [orgId]);

  // Whether the signed-in user owns the active workspace. Drives the
  // small "Your studio" / "Team workspace" pill on the cover row —
  // the only mention of workspace ownership on this screen now that
  // the in-profile org switcher is gone (org-switching lives on the
  // universal chip + the Select Company screen).
  const youOwnActiveOrg = !!(user && org?.ownerId === user.uid);

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
  const str = (v: unknown) =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : '';

  const foundedYear =
    typeof orgAny.founded === 'number' && Number.isFinite(orgAny.founded)
      ? orgAny.founded
      : null;

  const profile = {
    name: str(org?.name),
    tagline: str(orgAny.tagline),
    ownerName: str(userDoc?.displayName),
    ownerTitle: str(userAny.role),
    email: str(userDoc?.email ?? org?.email),
    altEmail: str(userAny.altEmail ?? orgAny.altEmail),
    phone: str(userDoc?.phoneNumber),
    altPhone: str(userAny.altPhone ?? orgAny.altPhone),
    website: str(orgAny.website),
    instagram: str(orgAny.instagram),
    linkedin: str(orgAny.linkedin),
    address1: str(orgAny.addressLine1),
    address2: str(orgAny.addressLine2),
    city: str(orgAny.city),
    state: str(orgAny.state),
    pincode: str(orgAny.pincode),
    country: str(orgAny.country),
    gst: str(orgAny.gstin),
    pan: str(orgAny.pan),
    rera: str(orgAny.rera),
    bankName: str(orgAny.bankName),
    bankAccount: str(orgAny.bankAccount),
    bankIFSC: str(orgAny.bankIFSC),
    bankBranch: str(orgAny.bankBranch),
    upi: str(orgAny.upi),
  };

  const coverUrl = str(orgAny.coverPhotoUrl);
  const logoUrl = str(orgAny.logoUrl);
  const initials = (profile.name.slice(0, 2) || '?').toUpperCase();

  function openCoverOptions() {
    if (!orgId || uploading) return;
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      { text: 'Choose from library', onPress: () => void uploadCover('library') },
      { text: 'Take photo', onPress: () => void uploadCover('camera') },
    ];
    if (coverUrl) {
      buttons.push({ text: 'Remove cover', style: 'destructive', onPress: removeCover });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Cover photo', undefined, buttons);
  }

  function openLogoOptions() {
    if (!orgId || uploading) return;
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive' | 'default';
      onPress?: () => void;
    }[] = [
      { text: 'Choose from library', onPress: () => void uploadLogo('library') },
      { text: 'Take photo', onPress: () => void uploadLogo('camera') },
    ];
    if (logoUrl) {
      buttons.push({ text: 'Remove icon', style: 'destructive', onPress: removeLogo });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile icon', undefined, buttons);
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={18} color={color.textMuted} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.headerTitle}>Studio profile</Text>
        {canEditStudio ? (
          <Pressable
            onPress={() => router.push('/(app)/edit-studio-profile')}
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="create-outline" size={13} color={color.text} />
            <Text variant="metaStrong" color="text">Edit</Text>
          </Pressable>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable
          style={styles.coverWrap}
          onPress={openCoverOptions}
          disabled={uploading !== null}
        >
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
          ) : (
            <>
              <View style={styles.cover} />
              <View style={styles.coverBars}>
                <View style={[styles.bar, { height: 42 }]} />
                <View style={[styles.bar, { height: 58 }]} />
                <View style={[styles.bar, { height: 46 }]} />
                <View style={[styles.bar, { height: 52 }]} />
                <View style={[styles.bar, { height: 38 }]} />
              </View>
            </>
          )}
          <View style={styles.coverDim} pointerEvents="none" />
          <View style={styles.coverChip} pointerEvents="none">
            <Ionicons name="image-outline" size={14} color="#fff" />
            <Text variant="metaStrong" style={styles.coverChipText}>
              {uploading === 'cover' ? 'Uploading…' : 'Cover'}
            </Text>
          </View>
          {uploading === 'cover' ? (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.logoRow}>
          <Pressable
            style={styles.logoOuter}
            onPress={openLogoOptions}
            disabled={uploading !== null}
          >
            <View style={styles.logoInner}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="cover" />
              ) : (
                <Text variant="title" color="primary">{initials}</Text>
              )}
            </View>
            <View style={styles.logoChip}>
              <Ionicons name="camera-outline" size={12} color={color.text} />
            </View>
            {uploading === 'logo' ? (
              <View style={styles.logoUploadOverlay}>
                <ActivityIndicator color={color.primary} />
              </View>
            ) : null}
          </Pressable>
          <View style={[styles.ownerPill, !youOwnActiveOrg && styles.ownerPillMember]}>
            <Text variant="caption" color={youOwnActiveOrg ? 'success' : 'textMuted'}>
              {youOwnActiveOrg ? 'Your studio' : 'Team workspace'}
            </Text>
          </View>
        </View>

        <View style={styles.identity}>
          <Text
            variant="largeTitle"
            color={profile.name ? 'text' : 'textMuted'}
            style={styles.name}
          >
            {profile.name || 'Add studio name'}
          </Text>
          {/* Plan badge — sits directly under the studio name so the
              studio's tier is visible at a glance from the header,
              and visually rhymes with the same badge shown in the
              Select Company list and More-tab hero card. */}
          <View style={styles.planBadgeRow}>
            <PlanBadge tier={effectiveTier} size="md" />
          </View>
          {profile.tagline ? (
            <Text variant="body" color="textMuted" style={styles.tagline}>
              {profile.tagline}
            </Text>
          ) : null}
          {(profile.city || profile.state || foundedYear != null) ? (
            <View style={styles.metaLine}>
              <Ionicons name="location-outline" size={12} color={color.textFaint} />
              <Text variant="metaStrong" color="textMuted">
                {[profile.city, profile.state].filter(Boolean).join(', ') || '—'}
                {foundedYear != null ? ` · Founded ${foundedYear}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        <Section
          title="CONTACT"
          editKey="contact"
          canEdit={canEditStudio}
          initiallyOpen
          preview={summarizeFilled([
            profile.email,
            profile.altEmail,
            profile.phone,
            profile.altPhone,
            profile.website,
          ], 5)}
        >
          <FieldRow icon="mail-outline" label="PRIMARY EMAIL" value={profile.email} action="Copy" />
          <FieldRow icon="mail-outline" label="ACCOUNTS EMAIL" value={profile.altEmail} />
          <FieldRow icon="call-outline" label="MOBILE" value={profile.phone} action="Call" />
          <FieldRow icon="call-outline" label="STUDIO LINE" value={profile.altPhone} />
          <FieldRow icon="globe-outline" label="WEBSITE" value={profile.website} action="Open" last />
        </Section>

        <Section
          title="STUDIO ADDRESS"
          editKey="address"
          canEdit={canEditStudio}
          preview={
            [profile.city, profile.state, profile.country]
              .filter(Boolean)
              .join(', ') || 'Not set'
          }
        >
          <View style={styles.addressRow}>
            <View style={styles.fieldBody}>
              <Text variant="body" color="text">
                {[
                  profile.address1,
                  profile.address2,
                  [profile.city, profile.state, profile.pincode]
                    .filter(Boolean)
                    .join(', '),
                  profile.country,
                ]
                  .filter((line) => line && line.trim().length > 0)
                  .join('\n') || '—'}
              </Text>
            </View>
            <Pressable style={styles.actionBtn}>
              <Text variant="metaStrong" color="primary">Map</Text>
            </Pressable>
          </View>
        </Section>

        <Section
          title="COMPLIANCE & REGISTRATION"
          editKey="compliance"
          canEdit={canEditStudio}
          preview={summarizeFilled([profile.gst, profile.pan, profile.rera], 3)}
        >
          <FieldRow icon="archive-outline" label="GSTIN" value={profile.gst} mono />
          <FieldRow icon="shield-outline" label="PAN" value={profile.pan} mono />
          <FieldRow icon="shield-checkmark-outline" label="RERA REGISTRATION" value={profile.rera} mono last />
        </Section>

        <Section
          title="BANKING"
          editKey="banking"
          canEdit={canEditStudio}
          preview={summarizeFilled(
            [
              profile.bankName,
              profile.bankAccount,
              profile.bankIFSC,
              profile.bankBranch,
              profile.upi,
            ],
            5,
          )}
        >
          <FieldRow icon="business-outline" label="BANK" value={profile.bankName} />
          <FieldRow icon="card-outline" label="ACCOUNT" value={profile.bankAccount} mono />
          <FieldRow icon="key-outline" label="IFSC" value={profile.bankIFSC} mono />
          <FieldRow icon="location-outline" label="BRANCH" value={profile.bankBranch} />
          <FieldRow icon="flash-outline" label="UPI" value={profile.upi} mono last />
        </Section>

        <Section
          title="SOCIAL & LINKS"
          editKey="social"
          canEdit={canEditStudio}
          preview={summarizeFilled([profile.instagram, profile.linkedin], 2)}
        >
          <FieldRow icon="logo-instagram" label="INSTAGRAM" value={profile.instagram} />
          <FieldRow icon="logo-linkedin" label="LINKEDIN" value={profile.linkedin} last />
        </Section>

        {(profile.ownerName || profile.ownerTitle) ? (
          <Section
            title="OWNER"
            editKey="owner"
            canEdit={canEditStudio}
            preview={profile.ownerName || profile.ownerTitle || undefined}
          >
            {profile.ownerName ? (
              <FieldRow icon="person-outline" label="NAME" value={profile.ownerName} last={!profile.ownerTitle} />
            ) : null}
            {profile.ownerTitle ? (
              <FieldRow icon="briefcase-outline" label="TITLE" value={profile.ownerTitle} last />
            ) : null}
          </Section>
        ) : null}

        <Text variant="caption" color="textMuted" style={styles.footerId}>
          STUDIO ID · {(org?.id ?? '').slice(0, 8) || '—'} · v1.0
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
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  coverDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  coverChip: {
    position: 'absolute',
    right: screenInset,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  coverChipText: { color: '#fff' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
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
    position: 'relative',
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
    overflow: 'visible',
  },
  logoInner: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.text,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  logoImage: {
    width: 56,
    height: 56,
  },
  logoChip: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerPill: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.successSoft,
    marginBottom: 6,
  },
  ownerPillMember: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  identity: { paddingHorizontal: screenInset, paddingTop: 14, paddingBottom: 4 },
  name: { letterSpacing: -0.5 },
  planBadgeRow: { marginTop: space.xs },
  tagline: { marginTop: 4 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  // Section rhythm — accordion. Each section is a tappable header
  // row that toggles a body card below. Tight gap between sections
  // so the closed list reads as a coherent menu, not as cards
  // floating on islands.
  sectionWrap: { marginTop: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
    backgroundColor: color.bg,
    gap: 8,
  },
  sectionHeaderText: { flex: 1, minWidth: 0 },
  sectionTitle: {
    letterSpacing: 0.8,
  },
  sectionPreview: {
    marginTop: 2,
  },
  sectionEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
  },
  // Expanded body — flat, no card border. Just rows on the canvas
  // separated by hairlines. Inset matches the header so labels
  // line up.
  sectionBody: {
    paddingHorizontal: screenInset,
    paddingTop: 4,
    paddingBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  fieldDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  fieldBody: { flex: 1, minWidth: 0 },
  fieldLabel: { letterSpacing: 0.6, marginBottom: 2 },
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
    paddingVertical: 12,
  },
  footerId: {
    marginTop: 12,
    textAlign: 'center',
    letterSpacing: 1,
  },
});
