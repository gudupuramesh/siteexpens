/**
 * Edit studio profile — v2 design.
 *
 * Two modes (driven by `?section=` param):
 *   - HUB (no param): list of section cards. Tap a card to open that
 *     section's spoke. Each card has a tinted IconTile, title +
 *     subtitle, and a chevron — same vocabulary as the More tab.
 *   - SPOKE (param set): SheetHeader with Cancel/Save + grouped
 *     InputRows for that section's fields. Save submits the WHOLE
 *     form (every section's fields are loaded into RHF on mount, so
 *     untouched fields flow through unchanged).
 *
 * Saves org document + user doc (work email, owner name, title) via
 * the existing `updateStudioProfile` Cloud-Function-style path. The
 * 300 ms snapshot-buffer pause before `router.back()` is preserved
 * so the next screen sees fresh data instead of the prior snapshot.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { updateStudioProfile } from '@/src/features/org/organizations';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { firestore } from '@/src/lib/firebase';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const schema = z.object({
  name: z.string().trim().min(1, 'Studio name is required'),
  email: z.string().trim().email('Valid work email required'),
  displayName: z.string(),
  role: z.string(),
  tagline: z.string(),
  founded: z.string(),
  website: z.string(),
  instagram: z.string(),
  linkedin: z.string(),
  altEmail: z.string(),
  altPhone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  country: z.string(),
  gstin: z.string(),
  pan: z.string(),
  rera: z.string(),
  bankName: z.string(),
  bankAccount: z.string(),
  bankIFSC: z.string(),
  bankBranch: z.string(),
  upi: z.string(),
});

type FormValues = z.infer<typeof schema>;

function foundedFromInput(raw: string): number | ReturnType<typeof firestore.FieldValue.delete> {
  const t = raw.trim();
  if (t === '') return firestore.FieldValue.delete();
  const n = Number(t);
  if (!Number.isFinite(n) || n < 1900 || n > 2100) {
    throw new Error('Enter a valid founding year (1900–2100)');
  }
  return Math.floor(n);
}

type SectionKey =
  | 'identity'
  | 'owner'
  | 'contact'
  | 'address'
  | 'compliance'
  | 'banking'
  | 'social';

/** Section list — all icons render as neutral grey tiles. The
 *  shape (square IconTile) + glyph + section title carry the
 *  meaning; per-section color was reading as decorative noise.
 *  Reserve color for things that demand action (status pills,
 *  errors, primary CTAs). */
type SectionMeta = {
  key: SectionKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const SECTION_LIST: SectionMeta[] = [
  { key: 'identity',   title: 'Identity',   subtitle: 'Studio name, tagline, founded',    icon: 'sparkles-outline' },
  { key: 'owner',      title: 'Owner',      subtitle: 'Your name and title',              icon: 'person-outline' },
  { key: 'contact',    title: 'Contact',    subtitle: 'Phone, emails, landline, website', icon: 'mail-outline' },
  { key: 'address',    title: 'Address',    subtitle: 'Studio address',                   icon: 'location-outline' },
  { key: 'compliance', title: 'Compliance', subtitle: 'GSTIN, PAN, RERA',                 icon: 'shield-checkmark-outline' },
  { key: 'banking',    title: 'Banking',    subtitle: 'Bank account and UPI',             icon: 'card-outline' },
  { key: 'social',     title: 'Social',     subtitle: 'Instagram and LinkedIn',           icon: 'globe-outline' },
];

function isSectionKey(v: string | undefined): v is SectionKey {
  return !!v && SECTION_LIST.some((s) => s.key === v);
}

export default function EditStudioProfileScreen() {
  const t = useThemeV2();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const sectionParam = Array.isArray(params.section) ? params.section[0] : params.section;
  const activeSection: SectionKey | null = isSectionKey(sectionParam) ? sectionParam : null;
  const isHub = activeSection === null;

  const { user, loading: authLoading } = useAuth();
  const { data: userDoc, loading: userLoading } = useCurrentUserDoc();
  const { data: org, loading: orgLoading } = useCurrentOrganization();
  const [submitError, setSubmitError] = useState<string | undefined>();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      email: '',
      displayName: '',
      role: '',
      tagline: '',
      founded: '',
      website: '',
      instagram: '',
      linkedin: '',
      altEmail: '',
      altPhone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      pincode: '',
      country: '',
      gstin: '',
      pan: '',
      rera: '',
      bankName: '',
      bankAccount: '',
      bankIFSC: '',
      bankBranch: '',
      upi: '',
    },
  });

  // Pre-fill the form ONCE per org. Same reasoning as edit-transaction:
  // `org` and `userDoc` come from Firestore subscriptions and re-emit with
  // new object references on every snapshot. Without the hydration guard,
  // every snapshot wipes the user's mid-edit input. Keyed on `org.id`
  // since switching workspaces is the only time we want to re-hydrate.
  const hydratedForOrgId = useRef<string | null>(null);
  useEffect(() => {
    if (!org || !userDoc) return;
    if (hydratedForOrgId.current === org.id) return;
    hydratedForOrgId.current = org.id ?? null;
    reset({
      name: org.name ?? '',
      email: (userDoc.email ?? org.email ?? '').trim(),
      displayName: userDoc.displayName ?? '',
      role: userDoc.role ?? '',
      tagline: org.tagline ?? '',
      founded: org.founded != null ? String(org.founded) : '',
      website: org.website ?? '',
      instagram: org.instagram ?? '',
      linkedin: org.linkedin ?? '',
      altEmail: (userDoc.altEmail ?? org.altEmail ?? '').trim(),
      altPhone: (userDoc.altPhone ?? org.altPhone ?? '').trim(),
      addressLine1: org.addressLine1 ?? '',
      addressLine2: org.addressLine2 ?? '',
      city: org.city ?? '',
      state: org.state ?? '',
      pincode: org.pincode ?? '',
      country: org.country ?? '',
      gstin: org.gstin ?? '',
      pan: org.pan ?? '',
      rera: org.rera ?? '',
      bankName: org.bankName ?? '',
      bankAccount: org.bankAccount ?? '',
      bankIFSC: org.bankIFSC ?? '',
      bankBranch: org.bankBranch ?? '',
      upi: org.upi ?? '',
    });
  }, [org?.id, org, userDoc, reset]);

  async function onSubmit(values: FormValues) {
    if (!user || !org) return;
    setSubmitError(undefined);
    try {
      const email = values.email.trim().toLowerCase();
      const orgPayload: Record<string, unknown> = {
        name: values.name.trim(),
        email,
        tagline: values.tagline.trim(),
        website: values.website.trim(),
        instagram: values.instagram.trim(),
        linkedin: values.linkedin.trim(),
        altEmail: values.altEmail.trim(),
        altPhone: values.altPhone.trim(),
        addressLine1: values.addressLine1.trim(),
        addressLine2: values.addressLine2.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        pincode: values.pincode.trim(),
        country: values.country.trim(),
        gstin: values.gstin.trim(),
        pan: values.pan.trim(),
        rera: values.rera.trim(),
        bankName: values.bankName.trim(),
        bankAccount: values.bankAccount.trim(),
        bankIFSC: values.bankIFSC.trim(),
        bankBranch: values.bankBranch.trim(),
        upi: values.upi.trim(),
        founded: foundedFromInput(values.founded),
      };

      const userPayload: Record<string, unknown> = {
        displayName: values.displayName.trim(),
        email,
        role: values.role.trim(),
        altEmail: values.altEmail.trim(),
        altPhone: values.altPhone.trim(),
      };

      await updateStudioProfile({
        orgId: org.id,
        uid: user.uid,
        org: orgPayload,
        user: userPayload,
      });
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (e) {
      setSubmitError((e as Error).message);
    }
  }

  if (authLoading || userLoading || orgLoading) {
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

  if (!user || !userDoc?.primaryOrgId) {
    return <Redirect href="/(onboarding)/organization" />;
  }

  if (!org) {
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

  const verifiedPhone = user.phoneNumber ?? '';
  const screenTitle = isHub
    ? 'Edit studio'
    : `Edit ${SECTION_LIST.find((s) => s.key === activeSection)!.title.toLowerCase()}`;

  // ── HUB MODE ───────────────────────────────────────────────────
  if (isHub) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <AmbientBackground />

        {/* Header (no Save) — transparent so the AmbientBackground flows through */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: t.colors.fill3, borderRadius: 999 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="chevron-back" size={18} color={t.colors.label} />
          </Pressable>
          <Text variant="headline" color="label" style={styles.headerTitle}>
            {screenTitle}
          </Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            variant="footnote"
            color="secondary"
            style={{
              paddingHorizontal: 24,
              paddingTop: 18,
              paddingBottom: 6,
            }}
          >
            Pick a section to edit. Changes save once you tap Save in
            the section.
          </Text>

          <FormGroup>
            {SECTION_LIST.map((s, idx) => {
              return (
                <Row
                  key={s.key}
                  leading={
                    <View
                      style={[
                        styles.tile,
                        {
                          backgroundColor: t.colors.fill3,
                          borderRadius: t.radii.tile,
                        },
                      ]}
                    >
                      <Ionicons name={s.icon} size={16} color={t.colors.secondary} />
                    </View>
                  }
                  label={s.title}
                  subtitle={s.subtitle}
                  chevron
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/edit-studio-profile',
                      params: { section: s.key },
                    })
                  }
                  divider={idx < SECTION_LIST.length - 1}
                />
              );
            })}
          </FormGroup>
        </ScrollView>
      </View>
    );
  }

  // ── SPOKE MODE ─────────────────────────────────────────────────
  const wrappedSubmit = handleSubmit(onSubmit);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title={screenTitle}
        cancelLabel="Cancel"
        saveLabel="Save"
        saveLoading={isSubmitting}
        saveDisabled={!isValid}
        onCancel={() => router.back()}
        onSave={() => void wrappedSubmit()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {activeSection === 'identity' ? (
            <FormGroup header="Identity">
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Studio"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Your studio name"
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="tagline"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Tagline"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Short description"
                    autoCapitalize="sentences"
                  />
                )}
              />
              <Controller
                control={control}
                name="founded"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Founded"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="2018"
                    keyboardType="number-pad"
                    divider={false}
                  />
                )}
              />
            </FormGroup>
          ) : null}
          {activeSection === 'identity' && errors.name?.message ? (
            <FieldNote text={errors.name.message} />
          ) : null}

          {activeSection === 'owner' ? (
            <FormGroup header="Owner">
              <Controller
                control={control}
                name="displayName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Name"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Full name"
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="role"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Title"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="e.g. Principal Designer"
                    autoCapitalize="words"
                    divider={false}
                  />
                )}
              />
            </FormGroup>
          ) : null}

          {activeSection === 'contact' ? (
            <>
              <FormGroup
                header="Contact"
                footer="Mobile is your verified sign-in number. Changing it requires a fresh OTP flow."
              >
                <Row
                  label="Mobile"
                  value={verifiedPhone || 'Not set'}
                  valueColor={verifiedPhone ? undefined : t.colors.tertiary}
                />
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <InputRow
                      label="Email"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="you@studio.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="altEmail"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <InputRow
                      label="Accounts"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="Optional"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="altPhone"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <InputRow
                      label="Studio line"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="Optional"
                      keyboardType="phone-pad"
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="website"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <InputRow
                      label="Website"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="example.com"
                      autoCapitalize="none"
                      keyboardType="url"
                      divider={false}
                    />
                  )}
                />
              </FormGroup>
              {errors.email?.message ? (
                <FieldNote text={errors.email.message} />
              ) : null}
            </>
          ) : null}

          {activeSection === 'address' ? (
            <FormGroup header="Address">
              <Controller
                control={control}
                name="addressLine1"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Line 1"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Building, street"
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="addressLine2"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Line 2"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Area, landmark"
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="city"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="City"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder=""
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="state"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="State"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder=""
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="pincode"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="PIN"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder=""
                    keyboardType="number-pad"
                  />
                )}
              />
              <Controller
                control={control}
                name="country"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Country"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder=""
                    autoCapitalize="words"
                    divider={false}
                  />
                )}
              />
            </FormGroup>
          ) : null}

          {activeSection === 'compliance' ? (
            <FormGroup header="Compliance">
              <Controller
                control={control}
                name="gstin"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="GSTIN"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="29AAAAA1234A1Z5"
                    autoCapitalize="characters"
                  />
                )}
              />
              <Controller
                control={control}
                name="pan"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="PAN"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="AAAAA1234A"
                    autoCapitalize="characters"
                  />
                )}
              />
              <Controller
                control={control}
                name="rera"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="RERA"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Registration number"
                    autoCapitalize="characters"
                    divider={false}
                  />
                )}
              />
            </FormGroup>
          ) : null}

          {activeSection === 'banking' ? (
            <FormGroup header="Banking">
              <Controller
                control={control}
                name="bankName"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Bank"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="e.g. HDFC Bank"
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="bankAccount"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Account"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Account number"
                    keyboardType="number-pad"
                  />
                )}
              />
              <Controller
                control={control}
                name="bankIFSC"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="IFSC"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="HDFC0000123"
                    autoCapitalize="characters"
                  />
                )}
              />
              <Controller
                control={control}
                name="bankBranch"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Branch"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Branch name"
                    autoCapitalize="words"
                  />
                )}
              />
              <Controller
                control={control}
                name="upi"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="UPI"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="name@bank"
                    autoCapitalize="none"
                    divider={false}
                  />
                )}
              />
            </FormGroup>
          ) : null}

          {activeSection === 'social' ? (
            <FormGroup header="Social">
              <Controller
                control={control}
                name="instagram"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="Instagram"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="@handle"
                    autoCapitalize="none"
                  />
                )}
              />
              <Controller
                control={control}
                name="linkedin"
                render={({ field: { onChange, onBlur, value } }) => (
                  <InputRow
                    label="LinkedIn"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="company-or-profile"
                    autoCapitalize="none"
                    divider={false}
                  />
                )}
              />
            </FormGroup>
          ) : null}

          {submitError ? <FieldNote text={submitError} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function FieldNote({ text }: { text: string }) {
  const t = useThemeV2();
  return (
    <Text
      variant="caption2"
      style={{
        color: t.palette.red.base,
        paddingHorizontal: 32,
        marginTop: 8,
      }}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  tile: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
