/**
 * Add MOM (Minutes of Meeting) form.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useState } from 'react';
import {
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
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { createMOM } from '@/src/features/mom/mom';
import { Button } from '@/src/ui/Button';
import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { TextField } from '@/src/ui/TextField';
import { color, radius, screenInset, space } from '@/src/theme';

const schema = z.object({
  title: z.string().trim().min(2, 'Title required'),
  notes: z.string().trim().min(5, 'Add meeting notes'),
  attendees: z.string().optional(),
  actionItems: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function AddMOMScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const orgId = userDoc?.primaryOrgId ?? '';
  const [submitError, setSubmitError] = useState<string>();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', notes: '', attendees: '', actionItems: '' },
    mode: 'onChange',
  });

  async function onSubmit(data: FormData) {
    if (!user || !orgId || !projectId) return;
    setSubmitError(undefined);
    try {
      const attendees = (data.attendees ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const actionItems = (data.actionItems ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
      await createMOM({
        orgId,
        projectId,
        title: data.title,
        notes: data.notes,
        date: new Date(),
        attendees,
        actionItems,
        createdBy: user.uid,
      });
      router.back();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.surface }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="close" size={22} color={color.text} />
        </Pressable>
        <Text variant="bodyStrong" color="text" style={styles.navTitle}>New MOM</Text>
        <View style={styles.navBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Controller
            control={control}
            name="title"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Meeting Title"
                placeholder="e.g. Client review meeting"
                autoCapitalize="sentences"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.title?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="attendees"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Attendees (comma separated)"
                placeholder="e.g. Ramesh, Suresh, Client"
                autoCapitalize="words"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          <Controller
            control={control}
            name="notes"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Meeting Notes"
                placeholder="Key discussion points, decisions taken..."
                multiline
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.notes?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="actionItems"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Action Items (one per line)"
                placeholder="Complete flooring by Monday&#10;Order tiles from supplier"
                multiline
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />

          {submitError && (
            <Text variant="caption" color="danger" style={{ marginTop: space.xs }}>
              {submitError}
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Save MOM"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            disabled={!isValid || !orgId}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingBottom: space.xs,
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.separator,
  },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center' },
  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  footer: {
    paddingHorizontal: screenInset,
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.separator,
  },
});
