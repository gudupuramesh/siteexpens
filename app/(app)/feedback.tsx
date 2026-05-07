/**
 * Feedback form — full-screen submission flow.
 *
 * Layout (top → bottom):
 *   1. Custom nav header with back chevron
 *   2. Type selector — 3-way segmented control (Bug / Feature / General)
 *   3. Module dropdown — opens a sheet picker with all app modules
 *      plus an "Other" option that reveals a free-text label input
 *   4. Description — multiline text area
 *   5. Screenshot grid — up to 4 thumbnails; tap empty slot to add
 *   6. Device info card — read-only, shows what we'll attach
 *   7. Submit button — disabled until type + module + description are present
 *
 * On submit: uploads screenshots to R2, writes `feedback/{id}` doc,
 * shows a success Alert, navigates back. Errors surface as Alerts —
 * the form preserves the user's input so they can retry without
 * re-typing.
 */
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/src/features/auth/useAuth';
import { useCurrentOrganization } from '@/src/features/org/useCurrentOrganization';
import { useCurrentUserDoc } from '@/src/features/org/useCurrentUserDoc';
import { useTokenClaims } from '@/src/features/org/useTokenClaims';
import { ROLE_LABELS } from '@/src/features/org/permissions';
import type { RoleKey } from '@/src/features/org/types';
import { useDeviceInfo } from '@/src/features/feedback/useDeviceInfo';
import { submitFeedback } from '@/src/features/feedback/submitFeedback';
import {
  FEEDBACK_MODULES,
  type FeedbackModuleKey,
  type FeedbackType,
} from '@/src/features/feedback/types';
import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, screenInset, space } from '@/src/theme';

const MAX_SCREENSHOTS = 4;
const MAX_DESCRIPTION = 4000;

const TYPE_OPTIONS: ReadonlyArray<{
  key: FeedbackType;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}> = [
  { key: 'bug', label: 'Bug', icon: 'bug-outline' },
  { key: 'feature', label: 'Feature', icon: 'bulb-outline' },
  { key: 'general', label: 'Feedback', icon: 'chatbubble-outline' },
];

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const { data: org } = useCurrentOrganization();
  const { claims } = useTokenClaims();
  const device = useDeviceInfo();

  // Form state
  const [type, setType] = useState<FeedbackType>('general');
  const [moduleKey, setModuleKey] = useState<FeedbackModuleKey | null>(null);
  const [moduleCustom, setModuleCustom] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]); // local URIs
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Resolve user role for the active org so the admin portal sees
  // "Manager in Happy Interior" not just a uid.
  const roleLabel = useMemo(() => {
    if (!org?.id) return '';
    const roleKey = (claims.orgs?.[org.id] ?? null) as RoleKey | null;
    return roleKey ? ROLE_LABELS[roleKey] : '';
  }, [claims.orgs, org?.id]);

  const moduleLabel = useMemo(() => {
    if (!moduleKey) return null;
    return FEEDBACK_MODULES.find((m) => m.key === moduleKey)?.label ?? null;
  }, [moduleKey]);

  const canSubmit =
    !submitting &&
    !!moduleKey &&
    description.trim().length > 0 &&
    (moduleKey !== 'other' || moduleCustom.trim().length > 0);

  // ── Image picker ──────────────────────────────────────────────────

  const addScreenshot = useCallback(async () => {
    if (screenshots.length >= MAX_SCREENSHOTS) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_SCREENSHOTS} screenshots.`);
      return;
    }
    Alert.alert('Add screenshot', undefined, [
      {
        text: 'Choose from library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Allow photo access to attach screenshots.');
            return;
          }
          // allowsMultipleSelection = true so the user can pick the
          // remaining N slots in one shot. Cap at the remaining count.
          const remaining = MAX_SCREENSHOTS - screenshots.length;
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.9,
            allowsMultipleSelection: remaining > 1,
            selectionLimit: remaining,
          });
          if (result.canceled) return;
          const uris = result.assets.map((a) => a.uri).filter(Boolean);
          setScreenshots((prev) => [...prev, ...uris].slice(0, MAX_SCREENSHOTS));
        },
      },
      {
        text: 'Take photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Allow camera access to take a screenshot.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
          if (result.canceled || !result.assets[0]?.uri) return;
          setScreenshots((prev) => [...prev, result.assets[0].uri].slice(0, MAX_SCREENSHOTS));
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [screenshots.length]);

  const removeScreenshot = useCallback((uri: string) => {
    setScreenshots((prev) => prev.filter((u) => u !== uri));
  }, []);

  // ── Submit ────────────────────────────────────────────────────────

  const onSubmit = useCallback(async () => {
    if (!canSubmit || !user || !moduleKey) return;
    setSubmitting(true);
    try {
      await submitFeedback({
        type,
        module: moduleKey,
        moduleCustom,
        description,
        screenshotUris: screenshots,
        userId: user.uid,
        userPhone: userDoc?.phoneNumber ?? user.phoneNumber ?? '',
        userDisplayName: userDoc?.displayName ?? '',
        userRole: roleLabel,
        orgId: org?.id ?? null,
        orgName: org?.name ?? null,
        device,
      });
      Alert.alert(
        'Thanks!',
        "Your feedback was submitted. We read every report — we'll get back to you if we need more details.",
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err) {
      Alert.alert(
        'Could not send',
        (err as Error)?.message ?? 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit, user, moduleKey, type, moduleCustom, description, screenshots,
    userDoc?.phoneNumber, userDoc?.displayName, roleLabel, org?.id, org?.name, device,
  ]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={color.primary} />
          <Text variant="body" color="primary">Back</Text>
        </Pressable>
        <Text variant="rowTitle" color="text" style={styles.headerTitle}>
          Send feedback
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Intro */}
          <Text variant="caption" color="textMuted" style={styles.intro}>
            Found a bug, missing a feature, or have a suggestion? Tell us — every
            submission goes straight to the team.
          </Text>

          {/* Type selector */}
          <Text style={styles.sectionLabel}>WHAT KIND OF FEEDBACK?</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => {
              const active = type === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setType(opt.key)}
                  style={[styles.typeBtn, active && styles.typeBtnActive]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={active ? '#fff' : color.text}
                  />
                  <Text
                    style={
                      active
                        ? [styles.typeLabel, styles.typeLabelActive]
                        : styles.typeLabel
                    }
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Module dropdown */}
          <Text style={styles.sectionLabel}>WHICH SCREEN?</Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [
              styles.dropdown,
              pressed && { opacity: 0.85 },
              !moduleLabel && styles.dropdownPlaceholder,
            ]}
          >
            <Text
              variant="body"
              color={moduleLabel ? 'text' : 'textMuted'}
              style={{ flex: 1 }}
              numberOfLines={1}
            >
              {moduleLabel ?? 'Pick the affected screen…'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={color.textMuted} />
          </Pressable>

          {moduleKey === 'other' ? (
            <TextInput
              value={moduleCustom}
              onChangeText={setModuleCustom}
              placeholder="Describe the screen (e.g. 'Add Material modal')"
              placeholderTextColor={color.textFaint}
              style={[styles.input, { marginTop: 8 }]}
              maxLength={60}
              accessibilityLabel="Describe the screen"
            />
          ) : null}

          {/* Description */}
          <Text style={styles.sectionLabel}>DESCRIPTION</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={
              type === 'bug'
                ? 'Steps to reproduce, what happened vs. what you expected.'
                : type === 'feature'
                ? 'What would you like the app to do, and why is it useful?'
                : 'Tell us what’s on your mind.'
            }
            placeholderTextColor={color.textFaint}
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.inputMultiline]}
            maxLength={MAX_DESCRIPTION}
            accessibilityLabel="Feedback description"
          />
          <Text variant="caption" color="textFaint" style={styles.charCount}>
            {description.length} / {MAX_DESCRIPTION}
          </Text>

          {/* Screenshots */}
          <Text style={styles.sectionLabel}>
            SCREENSHOTS{' '}
            <Text variant="caption" color="textFaint">
              ({screenshots.length}/{MAX_SCREENSHOTS}, optional)
            </Text>
          </Text>
          <View style={styles.shotsRow}>
            {screenshots.map((uri) => (
              <View key={uri} style={styles.shotTile}>
                <Image source={{ uri }} style={styles.shotImage} />
                <Pressable
                  onPress={() => removeScreenshot(uri)}
                  style={styles.shotRemove}
                  hitSlop={8}
                  accessibilityLabel="Remove screenshot"
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {screenshots.length < MAX_SCREENSHOTS ? (
              <Pressable
                onPress={addScreenshot}
                style={[styles.shotTile, styles.shotAdd]}
                accessibilityLabel="Add screenshot"
              >
                <Ionicons name="add" size={24} color={color.primary} />
                <Text variant="caption" color="primary">
                  Add
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Device info — read-only, transparency about what we send */}
          <Text style={styles.sectionLabel}>DEVICE INFO (auto)</Text>
          <View style={styles.deviceCard}>
            <DeviceRow label="Device" value={device.modelName || 'Unknown'} />
            <DeviceRow label="Model id" value={device.modelId || '—'} />
            <DeviceRow
              label="OS"
              value={`${device.platform.toUpperCase()} ${device.osVersion || ''}`.trim()}
            />
            <DeviceRow
              label="App"
              value={`${device.appVersion} (build ${device.appBuildNumber})`}
            />
            {org?.name ? <DeviceRow label="Studio" value={org.name} /> : null}
            {roleLabel ? <DeviceRow label="Your role" value={roleLabel} /> : null}
          </View>

          {/* Submit */}
          <Pressable
            onPress={() => void onSubmit()}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.submit,
              !canSubmit && styles.submitDisabled,
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitLabel}>Submit feedback</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Module picker modal */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerOpen(false)}
        />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.modalHandle} />
          <Text variant="rowTitle" color="text" style={styles.modalTitle}>
            Pick a screen
          </Text>
          <FlatList
            data={FEEDBACK_MODULES}
            keyExtractor={(item) => item.key}
            ItemSeparatorComponent={() => <View style={styles.modalSep} />}
            renderItem={({ item }) => {
              const active = item.key === moduleKey;
              return (
                <Pressable
                  onPress={() => {
                    setModuleKey(item.key);
                    setPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.modalRow,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    variant="body"
                    color={active ? 'primary' : 'text'}
                    style={{ flex: 1 }}
                  >
                    {item.label}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark" size={18} color={color.primary} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function DeviceRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.deviceRow}>
      <Text variant="caption" color="textMuted" style={styles.deviceLabel}>
        {label}
      </Text>
      <Text variant="metaStrong" color="text" style={{ flex: 1 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgGrouped },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bg,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 80 },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerSpacer: { minWidth: 80 },

  scroll: {
    paddingHorizontal: screenInset,
    paddingTop: space.md,
    paddingBottom: space.huge,
  },

  intro: { lineHeight: 17, marginBottom: space.lg },

  sectionLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    marginTop: space.lg,
    marginBottom: 8,
  },

  // Type selector
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  typeBtnActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  typeLabel: { fontSize: 13, fontWeight: '600', color: color.text },
  typeLabelActive: { color: '#fff' },

  // Dropdown
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  dropdownPlaceholder: {},

  // Inputs
  input: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    color: color.text,
    backgroundColor: color.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: 12,
  },
  inputMultiline: { minHeight: 140, textAlignVertical: 'top' },
  charCount: { textAlign: 'right', marginTop: 4 },

  // Screenshots
  shotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shotTile: {
    width: 80,
    height: 80,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: color.surface,
  },
  shotImage: { width: '100%', height: '100%' },
  shotAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.primary,
    borderStyle: 'dashed',
    backgroundColor: color.primarySoft,
    gap: 2,
  },
  shotRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Device card
  deviceCard: {
    backgroundColor: color.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  deviceLabel: { width: 88, letterSpacing: 0.6 },

  // Submit
  submit: {
    marginTop: space.xl,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70%',
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: 8,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.borderStrong,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    paddingHorizontal: screenInset,
    paddingVertical: 8,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: 14,
  },
  modalSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.borderStrong,
    marginLeft: screenInset,
  },
});
