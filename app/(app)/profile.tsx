/**
 * Studio profile — v2 design.
 *
 * Layout (top → bottom):
 *   1. v2 header (back · "Studio profile" · Edit pen)
 *   2. Hero card: cover image + overlapping logo tile + studio name + tagline + meta
 *   3. PlanBadge row (subscription tier)
 *   4. FormGroup CONTACT (email · accounts email · mobile · landline · website)
 *   5. FormGroup ADDRESS (full address + Map button)
 *   6. FormGroup COMPLIANCE (GST · PAN · RERA — mono)
 *   7. FormGroup BANKING (bank · account · IFSC · branch · UPI)
 *   8. FormGroup SOCIAL (Instagram · LinkedIn)
 *   9. FormGroup OWNER (when filled)
 *  10. Footer studio id
 *
 * Cover + logo upload paths preserved exactly: tap cover or logo →
 * Alert.alert with options → uploadToR2 + Firestore update. Remove
 * options use the same FieldValue.delete pipeline.
 */
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { Row } from '@/src/ui/v2/Row';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export default function ProfileScreen() {
  const t = useThemeV2();
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

  const youOwnActiveOrg = !!(user && org?.ownerId === user.uid);

  if (userLoading || orgLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />
        <View style={styles.loading}>
          <ActivityIndicator color={t.palette.blue.base} />
        </View>
      </View>
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
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

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

  function openMaps() {
    const q = [profile.address1, profile.address2, profile.city, profile.state, profile.pincode, profile.country]
      .filter(Boolean)
      .join(', ');
    if (!q) return;
    const url = `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
    void Linking.openURL(url);
  }

  function openUrl(raw: string, scheme?: 'mailto' | 'tel') {
    const v = raw.trim();
    if (!v) return;
    let url = v;
    if (scheme === 'mailto') url = `mailto:${v}`;
    else if (scheme === 'tel') url = `tel:${v}`;
    else if (!/^https?:\/\//i.test(v)) url = `https://${v}`;
    void Linking.openURL(url);
  }

  const addressLines = [
    profile.address1,
    profile.address2,
    [profile.city, profile.state, profile.pincode].filter(Boolean).join(', '),
    profile.country,
  ].filter((line) => line && line.trim().length > 0);

  const hasContact =
    profile.email || profile.altEmail || profile.phone || profile.altPhone || profile.website;
  const hasAddress = addressLines.length > 0;
  const hasCompliance = profile.gst || profile.pan || profile.rera;
  const hasBanking =
    profile.bankName || profile.bankAccount || profile.bankIFSC || profile.bankBranch || profile.upi;
  const hasSocial = profile.instagram || profile.linkedin;
  const hasOwner = profile.ownerName || profile.ownerTitle;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      {/* v2 header — transparent so the AmbientBackground flows through */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              backgroundColor: t.colors.fill3,
              borderRadius: 999,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={t.colors.label} />
        </Pressable>
        <Text variant="headline" color="label" style={styles.headerTitle}>
          Studio profile
        </Text>
        {canEditStudio ? (
          <Pressable
            onPress={() => router.push('/(app)/edit-studio-profile')}
            hitSlop={10}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="create-outline" size={16} color={t.palette.blue.base} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card — cover + overlap logo + name + tagline + meta */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: cardBg,
                borderRadius: t.radii.card,
                borderColor: cardBorder,
                borderWidth: t.hairline,
              },
            ]}
          >
            {/* Cover */}
            <Pressable
              onPress={openCoverOptions}
              disabled={uploading !== null || !canEditStudio}
              style={({ pressed }) => [styles.coverWrap, pressed && { opacity: 0.95 }]}
            >
              {coverUrl ? (
                <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
              ) : (
                <View
                  style={[
                    styles.coverPlaceholder,
                    {
                      backgroundColor:
                        t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                    },
                  ]}
                >
                  <Ionicons
                    name="image-outline"
                    size={28}
                    color={t.palette.blue.base}
                  />
                  {canEditStudio ? (
                    <Text
                      variant="caption1"
                      style={{
                        color: t.palette.blue.base,
                        marginTop: 6,
                        fontWeight: '600',
                      }}
                    >
                      Add cover photo
                    </Text>
                  ) : null}
                </View>
              )}
              {coverUrl && canEditStudio ? (
                <View style={styles.coverChip}>
                  <Ionicons name="camera-outline" size={11} color="#fff" />
                  <Text
                    variant="caption2"
                    style={{ color: '#fff', marginLeft: 4, fontWeight: '700' }}
                  >
                    {uploading === 'cover' ? 'UPLOADING…' : 'EDIT'}
                  </Text>
                </View>
              ) : null}
              {uploading === 'cover' ? (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
            </Pressable>

            {/* Identity row — overlapping logo + name + ownership pill */}
            <View style={styles.identityRow}>
              <Pressable
                onPress={openLogoOptions}
                disabled={uploading !== null || !canEditStudio}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              >
                <View
                  style={[
                    styles.logoOuter,
                    {
                      backgroundColor: cardBg,
                      borderColor: cardBg,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.logoInner,
                      {
                        backgroundColor: t.colors.fill3,
                        borderRadius: t.radii.tile,
                      },
                    ]}
                  >
                    {logoUrl ? (
                      <Image source={{ uri: logoUrl }} style={styles.logoImage} />
                    ) : (
                      <Text
                        variant="title3"
                        style={{
                          color: t.palette.blue.base,
                          fontWeight: '700',
                          letterSpacing: -0.3,
                        }}
                      >
                        {initials}
                      </Text>
                    )}
                  </View>
                  {canEditStudio ? (
                    <View
                      style={[
                        styles.logoChip,
                        {
                          backgroundColor: t.palette.blue.base,
                          borderColor: cardBg,
                          borderWidth: 2,
                        },
                      ]}
                    >
                      <Ionicons name="camera" size={11} color="#fff" />
                    </View>
                  ) : null}
                  {uploading === 'logo' ? (
                    <View
                      style={[
                        styles.logoUploadOverlay,
                        { borderRadius: t.radii.tile + 4 },
                      ]}
                    >
                      <ActivityIndicator color={t.palette.blue.base} />
                    </View>
                  ) : null}
                </View>
              </Pressable>

              <View
                style={[
                  styles.ownerPill,
                  {
                    backgroundColor: youOwnActiveOrg
                      ? t.mode === 'dark'
                        ? t.palette.green.softDark
                        : t.palette.green.soft
                      : t.colors.fill3,
                    borderRadius: 999,
                  },
                ]}
              >
                <View
                  style={[
                    styles.ownerDot,
                    {
                      backgroundColor: youOwnActiveOrg
                        ? t.palette.green.base
                        : t.colors.tertiary,
                    },
                  ]}
                />
                <Text
                  variant="caption2"
                  style={{
                    color: youOwnActiveOrg ? t.palette.green.base : t.colors.secondary,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                    marginLeft: 5,
                  }}
                >
                  {youOwnActiveOrg ? 'YOUR STUDIO' : 'TEAM WORKSPACE'}
                </Text>
              </View>
            </View>

            {/* Name + tagline + meta */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <Text
                variant="title2"
                color={profile.name ? 'label' : 'tertiary'}
                style={{ fontWeight: '700', letterSpacing: -0.4 }}
              >
                {profile.name || 'Add studio name'}
              </Text>
              <View style={styles.planRow}>
                <PlanBadge tier={effectiveTier} size="sm" />
              </View>
              {profile.tagline ? (
                <Text
                  variant="callout"
                  color="secondary"
                  style={{ marginTop: 8 }}
                >
                  {profile.tagline}
                </Text>
              ) : null}
              {(profile.city || profile.state || foundedYear != null) ? (
                <View style={styles.metaLine}>
                  <Ionicons name="location-outline" size={13} color={t.colors.tertiary} />
                  <Text variant="footnote" color="secondary" style={{ marginLeft: 4 }}>
                    {[profile.city, profile.state].filter(Boolean).join(', ') || '—'}
                    {foundedYear != null ? ` · Founded ${foundedYear}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* CONTACT */}
        {hasContact ? (
          <FormGroup header="Contact">
            {profile.email ? (
              <Row
                label="Email"
                value={profile.email}
                onPress={() => openUrl(profile.email, 'mailto')}
                divider={!!(profile.altEmail || profile.phone || profile.altPhone || profile.website)}
              />
            ) : null}
            {profile.altEmail ? (
              <Row
                label="Accounts"
                value={profile.altEmail}
                onPress={() => openUrl(profile.altEmail, 'mailto')}
                divider={!!(profile.phone || profile.altPhone || profile.website)}
              />
            ) : null}
            {profile.phone ? (
              <Row
                label="Mobile"
                value={profile.phone}
                onPress={() => openUrl(profile.phone, 'tel')}
                divider={!!(profile.altPhone || profile.website)}
              />
            ) : null}
            {profile.altPhone ? (
              <Row
                label="Studio line"
                value={profile.altPhone}
                onPress={() => openUrl(profile.altPhone, 'tel')}
                divider={!!profile.website}
              />
            ) : null}
            {profile.website ? (
              <Row
                label="Website"
                value={profile.website}
                onPress={() => openUrl(profile.website)}
                divider={false}
              />
            ) : null}
          </FormGroup>
        ) : (
          <EmptySection
            label="Contact"
            note={canEditStudio ? 'Add email, phone, and website' : 'No contact details'}
            canEdit={canEditStudio}
            onEdit={() =>
              router.push({
                pathname: '/(app)/edit-studio-profile',
                params: { section: 'contact' },
              })
            }
          />
        )}

        {/* ADDRESS */}
        {hasAddress ? (
          <View>
            <Text
              variant="caption2"
              color="secondary"
              style={{
                paddingHorizontal: 32,
                paddingTop: 24,
                paddingBottom: 7,
                letterSpacing: 0.4,
              }}
            >
              ADDRESS
            </Text>
            <View
              style={[
                styles.addressCard,
                {
                  backgroundColor: cardBg,
                  borderRadius: t.radii.group,
                  borderColor: cardBorder,
                  borderWidth: t.hairline,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                {addressLines.map((line, idx) => (
                  <Text
                    key={idx}
                    variant="callout"
                    color="label"
                    style={{ marginTop: idx === 0 ? 0 : 2 }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
              <Pressable
                onPress={openMaps}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.mapBtn,
                  {
                    backgroundColor:
                      t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                    borderRadius: 999,
                  },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="map-outline" size={13} color={t.palette.blue.base} />
                <Text
                  variant="caption1"
                  style={{
                    color: t.palette.blue.base,
                    fontWeight: '700',
                    marginLeft: 4,
                  }}
                >
                  Map
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <EmptySection
            label="Address"
            note={canEditStudio ? 'Add studio address' : 'No address on file'}
            canEdit={canEditStudio}
            onEdit={() =>
              router.push({
                pathname: '/(app)/edit-studio-profile',
                params: { section: 'address' },
              })
            }
          />
        )}

        {/* COMPLIANCE */}
        {hasCompliance ? (
          <FormGroup header="Compliance & registration">
            {profile.gst ? (
              <Row
                label="GSTIN"
                value={profile.gst}
                divider={!!(profile.pan || profile.rera)}
              />
            ) : null}
            {profile.pan ? (
              <Row label="PAN" value={profile.pan} divider={!!profile.rera} />
            ) : null}
            {profile.rera ? <Row label="RERA" value={profile.rera} divider={false} /> : null}
          </FormGroup>
        ) : (
          <EmptySection
            label="Compliance"
            note={canEditStudio ? 'Add GST, PAN and RERA numbers' : 'No compliance details'}
            canEdit={canEditStudio}
            onEdit={() =>
              router.push({
                pathname: '/(app)/edit-studio-profile',
                params: { section: 'compliance' },
              })
            }
          />
        )}

        {/* BANKING */}
        {hasBanking ? (
          <FormGroup header="Banking">
            {profile.bankName ? (
              <Row
                label="Bank"
                value={profile.bankName}
                divider={!!(profile.bankAccount || profile.bankIFSC || profile.bankBranch || profile.upi)}
              />
            ) : null}
            {profile.bankAccount ? (
              <Row
                label="Account"
                value={profile.bankAccount}
                divider={!!(profile.bankIFSC || profile.bankBranch || profile.upi)}
              />
            ) : null}
            {profile.bankIFSC ? (
              <Row
                label="IFSC"
                value={profile.bankIFSC}
                divider={!!(profile.bankBranch || profile.upi)}
              />
            ) : null}
            {profile.bankBranch ? (
              <Row
                label="Branch"
                value={profile.bankBranch}
                divider={!!profile.upi}
              />
            ) : null}
            {profile.upi ? <Row label="UPI" value={profile.upi} divider={false} /> : null}
          </FormGroup>
        ) : (
          <EmptySection
            label="Banking"
            note={canEditStudio ? 'Add bank account and UPI' : 'No banking details'}
            canEdit={canEditStudio}
            onEdit={() =>
              router.push({
                pathname: '/(app)/edit-studio-profile',
                params: { section: 'banking' },
              })
            }
          />
        )}

        {/* SOCIAL */}
        {hasSocial ? (
          <FormGroup header="Social & links">
            {profile.instagram ? (
              <Row
                label="Instagram"
                value={profile.instagram}
                onPress={() =>
                  openUrl(
                    profile.instagram.startsWith('http')
                      ? profile.instagram
                      : `https://instagram.com/${profile.instagram.replace(/^@/, '')}`,
                  )
                }
                divider={!!profile.linkedin}
              />
            ) : null}
            {profile.linkedin ? (
              <Row
                label="LinkedIn"
                value={profile.linkedin}
                onPress={() =>
                  openUrl(
                    profile.linkedin.startsWith('http')
                      ? profile.linkedin
                      : `https://linkedin.com/${profile.linkedin}`,
                  )
                }
                divider={false}
              />
            ) : null}
          </FormGroup>
        ) : null}

        {/* OWNER */}
        {hasOwner ? (
          <FormGroup header="Owner">
            {profile.ownerName ? (
              <Row label="Name" value={profile.ownerName} divider={!!profile.ownerTitle} />
            ) : null}
            {profile.ownerTitle ? (
              <Row label="Title" value={profile.ownerTitle} divider={false} />
            ) : null}
          </FormGroup>
        ) : null}

        <Text
          variant="caption2"
          color="tertiary"
          style={{
            marginTop: 24,
            textAlign: 'center',
            letterSpacing: 1,
          }}
        >
          STUDIO ID · {(org?.id ?? '').slice(0, 8) || '—'}
        </Text>
      </ScrollView>
    </View>
  );
}

function EmptySection({
  label,
  note,
  canEdit,
  onEdit,
}: {
  label: string;
  note: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useThemeV2();
  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  return (
    <View>
      <Text
        variant="caption2"
        color="secondary"
        style={{
          paddingHorizontal: 32,
          paddingTop: 24,
          paddingBottom: 7,
          letterSpacing: 0.4,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <View
        style={[
          styles.emptyRow,
          {
            backgroundColor: cardBg,
            borderRadius: t.radii.group,
            borderColor: cardBorder,
            borderWidth: t.hairline,
          },
        ]}
      >
        <Text variant="callout" color="secondary" style={{ flex: 1 }}>
          {note}
        </Text>
        {canEdit ? (
          <Pressable
            onPress={onEdit}
            hitSlop={6}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor:
                  t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="add" size={14} color={t.palette.blue.base} />
            <Text
              variant="caption1"
              style={{
                color: t.palette.blue.base,
                fontWeight: '700',
                marginLeft: 2,
              }}
            >
              Add
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
  headerTitle: { flex: 1, fontWeight: '600' },

  // Hero card
  heroCard: {
    overflow: 'hidden',
  },
  coverWrap: {
    height: 130,
    width: '100%',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  coverPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverChip: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginTop: -28,
    gap: 12,
    marginBottom: 12,
  },
  logoOuter: {
    width: 68,
    height: 68,
    borderRadius: 14 + 4,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  logoInner: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: 56, height: 56 },
  logoChip: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  ownerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  planRow: { marginTop: 6, alignSelf: 'flex-start' },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  // Address card
  addressCard: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  // Empty section row
  emptyRow: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
