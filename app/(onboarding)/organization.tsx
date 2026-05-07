/**
 * First-time studio setup: studio name, work email, and verified mobile
 * (read-only from phone auth). On submit we create the org and set
 * primaryOrgId on the user doc.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { z } from 'zod';

import { useAuth } from '@/src/features/auth/useAuth';
import { createOrganization } from '@/src/features/org/organizations';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { space } from '@/src/theme';

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
  const { user } = useAuth();
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

  return (
    <Screen bg="grouped">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <Text variant="largeTitle" color="text">
            Set up your studio
          </Text>
          <Text variant="body" color="textMuted" style={styles.subtitle}>
            Your mobile number is already verified. Add your studio name and
            work email — you can fill in the rest from Studio profile later.
          </Text>

          <View style={styles.field}>
            <TextField
              label="Mobile number"
              value={user?.phoneNumber ?? ''}
              editable={false}
              placeholder="—"
            />
          </View>

          <View style={styles.field}>
            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Studio name"
                  placeholder="e.g. Studio Vastra Interiors"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  error={errors.name?.message}
                  returnKeyType="next"
                />
              )}
            />
          </View>

          <View style={styles.field}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Work email"
                  placeholder="you@studio.com"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  error={errors.email?.message ?? submitError}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onSubmit)}
                />
              )}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            label="Continue"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isValid}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: space.md,
    marginBottom: space.xxl,
  },
  field: {
    marginBottom: space.xl,
  },
  footer: {
    paddingBottom: space.lg,
  },
});
