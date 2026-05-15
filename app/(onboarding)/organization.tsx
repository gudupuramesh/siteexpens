/**
 * First-time studio setup — v2 design.
 *
 * This is the very first authenticated screen a new signup ever sees.
 * It needs to feel welcoming and premium without making the user
 * read a wall of text.
 *
 * Layout (top → bottom):
 *   1. Optional Cancel button (only when ?mode=add — the user came
 *      here from "Create your studio" while owning none)
 *   2. Hero — gradient brand mark + "Welcome to Interior OS" / "Add a
 *      studio" + helper line
 *   3. FormGroup "Your studio" — verified mobile (read-only) + studio
 *      name + work email
 *   4. "What you get" benefit strip — 3 tone-tinted bullet rows
 *   5. Footer with full-width blue Continue button
 *
 * Behavior preserved:
 *   • `createOrganization({ uid, name, email })` write
 *   • Onboarding layout watches the user doc and auto-redirects to
 *     `/(app)` once `primaryOrgId` is set — no manual nav here
 *   • Schema validation untouched (zod min/max/email)
 *   • Submit-error surfaces under the email field
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { createOrganization } from '@/src/features/org/organizations';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Studio name is too short')
    .max(80, 'Studio name is too long'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

export default function OrganizationOnboardingScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isAddMode = mode === 'add';
  const [submitError, setSubmitError] = useState<string | undefined>();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { name: '', email: '' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(undefined);
    if (!user) {
      setSubmitError('You need to be signed in.');
      return;
    }
    try {
      await createOrganization({ uid: user.uid, ...values });
      // The onboarding layout listens to the user doc and redirects to
      // /(app) as soon as primaryOrgId is set — no manual navigation.
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  const heroTitle = isAddMode ? 'Add a studio' : 'Welcome to Interior OS';
  const heroSubtitle = isAddMode
    ? "Each user can own one studio — tag this one with a name and a work email."
    : 'Your mobile is verified. Add a studio name and a work email — the rest can be filled in from Studio profile later.';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <AmbientBackground />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar — only renders Cancel when in add-mode */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          {isAddMode ? (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(app)' as never);
              }}
              hitSlop={10}
              style={({ pressed }) => [
                styles.cancelBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 0,
            paddingTop: 12,
            paddingBottom: 32 + insets.bottom,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <LinearGradient
              colors={['#FF9F0A', '#FF453A', '#BF5AF2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandTile}
            >
              <Ionicons
                name="business"
                size={28}
                color="#FFFFFF"
              />
            </LinearGradient>
            <Text
              variant="title1"
              color="label"
              style={styles.title}
            >
              {heroTitle}
            </Text>
            <Text
              variant="callout"
              color="secondary"
              style={styles.subtitle}
            >
              {heroSubtitle}
            </Text>
          </View>

          {/* Studio details */}
          <FormGroup header="Your studio">
            {/* Verified mobile — read-only with green check trailing */}
            <Row
              label="Mobile"
              value={user?.phoneNumber ?? '—'}
              valueColor={user?.phoneNumber ? undefined : t.colors.tertiary}
              trailing={
                user?.phoneNumber ? (
                  <View
                    style={[
                      styles.verifiedPill,
                      {
                        backgroundColor:
                          t.mode === 'dark' ? t.palette.green.softDark : t.palette.green.soft,
                        borderRadius: 999,
                        marginLeft: 8,
                      },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={11}
                      color={t.palette.green.base}
                    />
                    <Text
                      variant="caption2"
                      style={{
                        color: t.palette.green.base,
                        fontWeight: '700',
                        letterSpacing: 0.4,
                        marginLeft: 3,
                      }}
                    >
                      VERIFIED
                    </Text>
                  </View>
                ) : undefined
              }
            />
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Studio"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="e.g. Studio Vastra Interiors"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <InputRow
                  label="Work email"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="you@studio.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onSubmit)}
                  divider={false}
                />
              )}
            />
          </FormGroup>

          {/* Field-level errors */}
          {errors.name?.message ? <FieldNote text={errors.name.message} /> : null}
          {errors.email?.message ? <FieldNote text={errors.email.message} /> : null}
          {submitError ? <FieldNote text={submitError} /> : null}

          {/* Benefit strip */}
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
            WHAT YOU'LL GET
          </Text>
          <View style={{ paddingHorizontal: 16 }}>
            <View
              style={[
                styles.benefitsCard,
                {
                  backgroundColor: t.colors.surface,
                  borderRadius: t.radii.group,
                  borderColor:
                    t.mode === 'dark'
                      ? 'rgba(255,255,255,0.05)'
                      : 'rgba(0,0,0,0.04)',
                  borderWidth: t.hairline,
                },
              ]}
            >
              <Benefit
                icon="briefcase"
                tone="blue"
                title="Project workspaces"
                subtitle="Track expenses, designs, attendance per site"
                divider
              />
              <Benefit
                icon="people"
                tone="green"
                title="Team & client access"
                subtitle="Invite team members and clients with the right roles"
                divider
              />
              <Benefit
                icon="receipt"
                tone="orange"
                title="Money & material flow"
                subtitle="Payments in / out, material requests, vendor parties"
              />
            </View>
          </View>
        </ScrollView>

        {/* Footer CTA */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={handleSubmit(onSubmit)}
            disabled={!isValid || isSubmitting}
            style={({ pressed }) => [
              styles.continueBtn,
              {
                backgroundColor: t.palette.blue.base,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
              (!isValid || isSubmitting) && { opacity: 0.5 },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text
                  variant="callout"
                  style={{ color: '#fff', fontWeight: '700' }}
                >
                  {isAddMode ? 'Create studio' : 'Continue'}
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color="#fff"
                  style={{ marginLeft: 8 }}
                />
              </>
            )}
          </Pressable>
          <Text
            variant="caption2"
            color="tertiary"
            style={{
              textAlign: 'center',
              marginTop: 10,
              letterSpacing: 0.2,
            }}
          >
            By continuing you agree to use your verified mobile as the primary
            contact for this studio.
          </Text>
        </View>
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

function Benefit({
  icon,
  tone,
  title,
  subtitle,
  divider,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'blue' | 'green' | 'orange' | 'red' | 'yellow';
  title: string;
  subtitle: string;
  divider?: boolean;
}) {
  const t = useThemeV2();
  const toneColors = t.palette[tone];
  return (
    <View style={[styles.benefitRow, { position: 'relative' }]}>
      <View
        style={[
          styles.benefitIcon,
          {
            backgroundColor:
              t.mode === 'dark' ? toneColors.softDark : toneColors.soft,
            borderRadius: t.radii.tile,
          },
        ]}
      >
        <Ionicons name={icon} size={16} color={toneColors.base} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text variant="body" color="label">
          {title}
        </Text>
        <Text
          variant="caption1"
          color="secondary"
          style={{ marginTop: 2 }}
        >
          {subtitle}
        </Text>
      </View>
      {divider ? (
        <View
          style={[
            styles.benefitDivider,
            { backgroundColor: t.colors.separator, left: 56 },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    minHeight: 44,
  },
  cancelBtn: { paddingVertical: 6, paddingRight: 6 },

  // Hero
  hero: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  brandTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: {
    marginTop: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 21,
  },

  // Verified pill
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },

  // Benefits
  benefitsCard: {
    overflow: 'hidden',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 60,
  },
  benefitIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitDivider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
});
