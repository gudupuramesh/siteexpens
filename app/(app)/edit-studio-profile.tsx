/**
 * Edit studio profile — mirrors preview sections on profile.tsx.
 * Saves org document + user doc (work email, owner name, title).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { Button } from '@/src/ui/Button';
import { KeyboardFormLayout } from '@/src/ui/KeyboardFormLayout';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, screenInset, space } from '@/src/theme';

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

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" color="textMuted" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** All sections, in render order. The hub renders one tappable
 *  card per row; each card pushes back into this same screen with
 *  `?section={key}` so only that section's fields show. Keeping it
 *  one file means one schema, one submit handler, one source of
 *  truth — no per-section files to maintain. */
type SectionKey =
  | 'identity'
  | 'owner'
  | 'contact'
  | 'address'
  | 'compliance'
  | 'banking'
  | 'social';

/** Sections are aligned 1:1 with the section-cards on the profile
 *  view (`profile.tsx`). The form section's field set MUST match
 *  what the user can see in the corresponding view card —
 *  otherwise tapping the pencil drops them into a form missing the
 *  fields they came in to edit, which is the bug we just fixed.
 *
 *  Identity = studio name + tagline + founding year (the hero
 *  block on the profile view).
 *  Contact = verified mobile (read-only) + work email + accounts
 *  email + studio landline + website. */
const SECTION_LIST: {
  key: SectionKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'identity',   title: 'Identity',   subtitle: 'Studio name, tagline, founded',   icon: 'sparkles-outline' },
  { key: 'owner',      title: 'Owner',      subtitle: 'Your name and title',             icon: 'person-outline' },
  { key: 'contact',    title: 'Contact',    subtitle: 'Phone, emails, landline, website', icon: 'mail-outline' },
  { key: 'address',    title: 'Address',    subtitle: 'Studio address',                  icon: 'location-outline' },
  { key: 'compliance', title: 'Compliance', subtitle: 'GSTIN, PAN, RERA',                icon: 'shield-checkmark-outline' },
  { key: 'banking',    title: 'Banking',    subtitle: 'Bank account and UPI',            icon: 'card-outline' },
  { key: 'social',     title: 'Social',     subtitle: 'Instagram and LinkedIn',          icon: 'globe-outline' },
];

function isSectionKey(v: string | undefined): v is SectionKey {
  return !!v && SECTION_LIST.some((s) => s.key === v);
}

/** Card row used in the hub list — section icon + title + subtitle
 *  + chevron. Visually identical vocabulary to the rest of the
 *  app's settings rows (see `chats.tsx > Row`). */
function HubCard({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.hubCard, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.hubCardIcon}>
        <Ionicons name={icon} size={18} color={color.primary} />
      </View>
      <View style={styles.hubCardBody}>
        <Text variant="bodyStrong" color="text">{title}</Text>
        <Text variant="caption" color="textMuted">{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={color.textFaint} />
    </Pressable>
  );
}

export default function EditStudioProfileScreen() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const sectionParam = Array.isArray(params.section) ? params.section[0] : params.section;
  const activeSection: SectionKey | null = isSectionKey(sectionParam)
    ? sectionParam
    : null;
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

  useEffect(() => {
    if (!org || !userDoc) return;
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
  }, [org, userDoc, reset]);

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
      // Snapshot-propagation buffer (see add-transaction.tsx).
      await new Promise((r) => setTimeout(r, 300));
      router.back();
    } catch (e) {
      setSubmitError((e as Error).message);
    }
  }

  if (authLoading || userLoading || orgLoading) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      </Screen>
    );
  }

  if (!user || !userDoc?.primaryOrgId) {
    return <Redirect href="/(onboarding)/organization" />;
  }

  if (!org) {
    return (
      <Screen bg="grouped" padded={false}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loading}>
          <ActivityIndicator color={color.primary} />
        </View>
      </Screen>
    );
  }

  const verifiedPhone = user.phoneNumber ?? '';
  const headerTitle = isHub
    ? 'Edit studio'
    : `Edit ${SECTION_LIST.find((s) => s.key === activeSection)!.title}`;

  // The Save handler saves the WHOLE form regardless of which
  // section the user opened — every section's fields stayed in
  // memory across navigation because the hub and the spoke share
  // one component instance per stack push. We chose
  // `<Stack.Screen ... />` per route, so opening "Contact" from
  // the hub mounts a fresh component instance with that section's
  // fields hydrated from the org doc — same behaviour, cleaner UX.
  const wrappedSubmit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={18} color={color.textMuted} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.headerTitle}>
          {headerTitle}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {/* Hub mode — no form fields, no save footer. Just a vertical
          stack of section cards. Tapping a card pushes back into
          this same screen with `?section={key}`. */}
      {isHub ? (
        <KeyboardFormLayout
          headerInset={52}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.hubList}>
            {SECTION_LIST.map((s) => (
              <HubCard
                key={s.key}
                title={s.title}
                subtitle={s.subtitle}
                icon={s.icon}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/edit-studio-profile',
                    params: { section: s.key },
                  })
                }
              />
            ))}
          </View>
        </KeyboardFormLayout>
      ) : (
        <KeyboardFormLayout
          headerInset={52}
          contentContainerStyle={styles.scrollContent}
          footer={
            <View style={styles.footer}>
              {submitError ? (
                <Text variant="caption" color="danger" style={{ marginBottom: space.sm }}>
                  {submitError}
                </Text>
              ) : null}
              <Button
                label="Save changes"
                onPress={wrappedSubmit}
                loading={isSubmitting}
                disabled={!isValid}
              />
            </View>
          }
        >
        {activeSection === 'owner' ? (
        <FormSection title="OWNER">
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Your name"
                placeholder="Full name"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="role"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Title"
                placeholder="e.g. Principal Designer"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
        </FormSection>
        ) : null}

        {activeSection === 'identity' ? (
        <FormSection title="IDENTITY">
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Studio name"
                placeholder="Your studio name"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.name?.message}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="tagline"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Tagline"
                placeholder="Short description"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="founded"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Founded year"
                placeholder="e.g. 2018"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="number-pad"
              />
            )}
          />
        </FormSection>
        ) : null}

        {activeSection === 'contact' ? (
        <FormSection title="CONTACT">
          {/* Verified mobile — same value the user signs in with.
              Read-only here because changing it requires a fresh
              OTP flow, which is a separate path. Shown so users
              can confirm at a glance which number is on file. */}
          <View style={styles.fieldGap}>
            <TextField
              label="Mobile (verified)"
              value={verifiedPhone}
              editable={false}
            />
          </View>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Primary email"
                placeholder="you@studio.com"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                error={errors.email?.message}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="altEmail"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Accounts email"
                placeholder="Optional"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="email-address"
                autoCapitalize="none"
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="altPhone"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Studio landline"
                placeholder="Optional"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                keyboardType="phone-pad"
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="website"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Website"
                placeholder="example.com"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                keyboardType="url"
              />
            )}
          />
        </FormSection>
        ) : null}

        {activeSection === 'address' ? (
        <FormSection title="ADDRESS">
          <Controller
            control={control}
            name="addressLine1"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Address line 1"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="addressLine2"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Address line 2"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="city"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="City"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="state"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="State"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="pincode"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="PIN code"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="country"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Country"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
        </FormSection>
        ) : null}

        {activeSection === 'compliance' ? (
        <FormSection title="COMPLIANCE">
          <Controller
            control={control}
            name="gstin"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="GSTIN"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="characters"
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="pan"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="PAN"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="characters"
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="rera"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="RERA"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="characters"
              />
            )}
          />
        </FormSection>
        ) : null}

        {activeSection === 'banking' ? (
        <FormSection title="BANKING">
          <Controller
            control={control}
            name="bankName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Bank name"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="bankAccount"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Account number"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="bankIFSC"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="IFSC"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="characters"
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="bankBranch"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Branch"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="upi"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="UPI ID"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
              />
            )}
          />
        </FormSection>
        ) : null}

        {activeSection === 'social' ? (
        <FormSection title="SOCIAL">
          <Controller
            control={control}
            name="instagram"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Instagram"
                placeholder="@handle"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
                containerStyle={styles.fieldGap}
              />
            )}
          />
          <Controller
            control={control}
            name="linkedin"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="LinkedIn"
                placeholder="Company or profile slug"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="none"
              />
            )}
          />
        </FormSection>
        ) : null}
        </KeyboardFormLayout>
      )}
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
  headerTitle: { flex: 1, textAlign: 'center' },
  scrollContent: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  section: { marginBottom: space.lg },
  sectionTitle: { letterSpacing: 0.5, marginBottom: space.sm },
  fieldGap: { marginBottom: space.md },
  footer: { marginTop: space.sm },

  // Hub list — vertical stack of section cards on the landing
  // page. Each card is bounded white with hairline border + 10 px
  // radius (same vocabulary as the rest of the app's settings
  // rows).
  hubList: {
    gap: 10,
  },
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: color.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    borderRadius: 10,
  },
  hubCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubCardBody: { flex: 1, minWidth: 0, gap: 2 },
});
