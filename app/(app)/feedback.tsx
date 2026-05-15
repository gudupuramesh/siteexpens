/**
 * Send Feedback — v2 design.
 *
 * Layout (top → bottom):
 *   1. SheetHeader: Cancel · "Send feedback" · Send
 *   2. Intro hint
 *   3. FormGroup "Type" — 3-up tone-tinted segmented control (Bug · Feature · General)
 *   4. FormGroup "Screen" — Row that opens a bottom-sheet picker; when
 *      "Other" is picked an extra InputRow appears for free-text label
 *   5. FormGroup "Description" — multiline InputRow + char counter
 *   6. Screenshot grid — up to 4 thumbnails + dashed "Add" tile
 *   7. FormGroup "Device info" — read-only Rows (transparent disclosure)
 *
 * On submit: uploads screenshots to R2, writes `feedback/{id}` doc, shows
 * a success Alert, navigates back. Errors surface as Alerts — the form
 * preserves the user's input so they can retry without re-typing.
 */
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { FormGroup } from '@/src/ui/v2/FormGroup';
import { InputRow } from '@/src/ui/v2/InputRow';
import { Row } from '@/src/ui/v2/Row';
import { SheetHeader } from '@/src/ui/v2/SheetHeader';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

const MAX_SCREENSHOTS = 4;
const MAX_DESCRIPTION = 4000;

const TYPE_OPTIONS: ReadonlyArray<{
  key: FeedbackType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'red' | 'yellow' | 'blue';
}> = [
  { key: 'bug', label: 'Bug', icon: 'bug-outline', tone: 'red' },
  { key: 'feature', label: 'Feature', icon: 'bulb-outline', tone: 'yellow' },
  { key: 'general', label: 'General', icon: 'chatbubble-outline', tone: 'blue' },
];

export default function FeedbackScreen() {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: userDoc } = useCurrentUserDoc();
  const { data: org } = useCurrentOrganization();
  const { claims } = useTokenClaims();
  const device = useDeviceInfo();

  const [type, setType] = useState<FeedbackType>('general');
  const [moduleKey, setModuleKey] = useState<FeedbackModuleKey | null>(null);
  const [moduleCustom, setModuleCustom] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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
          setScreenshots((prev) =>
            [...prev, result.assets[0].uri].slice(0, MAX_SCREENSHOTS),
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [screenshots.length]);

  const removeScreenshot = useCallback((uri: string) => {
    setScreenshots((prev) => prev.filter((u) => u !== uri));
  }, []);

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
    userDoc?.phoneNumber, userDoc?.displayName, userDoc?.phoneNumber, roleLabel,
    org?.id, org?.name, device,
  ]);

  const cardBg = t.colors.surface;
  const cardBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';

  const descriptionPlaceholder =
    type === 'bug'
      ? 'Steps to reproduce, what happened vs. what you expected.'
      : type === 'feature'
        ? 'What would you like the app to do, and why is it useful?'
        : "Tell us what's on your mind.";

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientBackground />

      <SheetHeader
        title="Send feedback"
        cancelLabel="Cancel"
        saveLabel="Send"
        saveLoading={submitting}
        saveDisabled={!canSubmit}
        onCancel={() => router.back()}
        onSave={() => void onSubmit()}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Intro */}
          <Text
            variant="footnote"
            color="secondary"
            style={{
              paddingHorizontal: 24,
              paddingTop: 18,
            }}
          >
            Found a bug, missing a feature, or have a suggestion? Every
            submission lands directly with the team.
          </Text>

          {/* Type */}
          <Text
            variant="caption2"
            color="secondary"
            style={{
              paddingHorizontal: 32,
              paddingTop: 24,
              paddingBottom: 8,
              letterSpacing: 0.4,
            }}
          >
            TYPE
          </Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => {
              const active = type === opt.key;
              const tone = t.palette[opt.tone];
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setType(opt.key)}
                  style={({ pressed }) => [
                    styles.typeBtn,
                    {
                      backgroundColor: active
                        ? t.mode === 'dark'
                          ? tone.softDark
                          : tone.soft
                        : cardBg,
                      borderRadius: t.radii.field,
                      borderColor: active ? tone.base + '55' : cardBorder,
                      borderWidth: active ? 1.5 : t.hairline,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={active ? tone.base : t.colors.tertiary}
                  />
                  <Text
                    variant="footnote"
                    style={{
                      color: active ? tone.base : t.colors.label,
                      fontWeight: active ? '700' : '500',
                      marginTop: 4,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Screen picker */}
          <FormGroup header="Affected screen">
            <Row
              label="Screen"
              value={moduleLabel ?? 'Pick one'}
              valueColor={moduleLabel ? undefined : t.colors.tertiary}
              chevron
              onPress={() => {
                Keyboard.dismiss();
                setPickerOpen(true);
              }}
              divider={moduleKey === 'other'}
            />
            {moduleKey === 'other' ? (
              <InputRow
                label="Detail"
                value={moduleCustom}
                onChangeText={setModuleCustom}
                placeholder="e.g. 'Add Material modal'"
                autoCapitalize="sentences"
                divider={false}
              />
            ) : null}
          </FormGroup>

          {/* Description */}
          <FormGroup
            header="Description"
            footer={`${description.length} / ${MAX_DESCRIPTION}`}
          >
            <InputRow
              label="What happened?"
              value={description}
              onChangeText={(v) => {
                if (v.length > MAX_DESCRIPTION) return;
                setDescription(v);
              }}
              placeholder={descriptionPlaceholder}
              multiline
              autoCapitalize="sentences"
              divider={false}
            />
          </FormGroup>

          {/* Screenshots */}
          <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <View style={styles.shotsHeader}>
              <Text
                variant="caption2"
                color="secondary"
                style={{ letterSpacing: 0.4 }}
              >
                SCREENSHOTS
              </Text>
              <Text variant="caption2" color="tertiary">
                {screenshots.length} / {MAX_SCREENSHOTS} · OPTIONAL
              </Text>
            </View>
            <View style={styles.shotsRow}>
              {screenshots.map((uri) => (
                <View key={uri} style={styles.shotTileWrap}>
                  <Image
                    source={{ uri }}
                    style={[
                      styles.shotImage,
                      { borderRadius: t.radii.tile },
                    ]}
                  />
                  <Pressable
                    onPress={() => removeScreenshot(uri)}
                    style={[
                      styles.shotRemove,
                      { backgroundColor: t.palette.red.base },
                    ]}
                    hitSlop={6}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {screenshots.length < MAX_SCREENSHOTS ? (
                <Pressable
                  onPress={() => void addScreenshot()}
                  style={({ pressed }) => [
                    styles.shotAdd,
                    {
                      backgroundColor:
                        t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
                      borderRadius: t.radii.tile,
                      borderColor: t.palette.blue.base + '33',
                      borderWidth: t.hairline,
                      borderStyle: 'dashed',
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Ionicons name="add" size={22} color={t.palette.blue.base} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Device info */}
          <FormGroup
            header="Device info (auto)"
            footer="We attach this so we can reproduce issues on the right device + app version."
          >
            <Row label="Device" value={device.modelName || 'Unknown'} />
            {device.modelId ? <Row label="Model id" value={device.modelId} /> : null}
            <Row
              label="OS"
              value={`${device.platform.toUpperCase()} ${device.osVersion || ''}`.trim()}
            />
            <Row
              label="App"
              value={`${device.appVersion} (build ${device.appBuildNumber})`}
              divider={!!org?.name || !!roleLabel}
            />
            {org?.name ? (
              <Row label="Studio" value={org.name} divider={!!roleLabel} />
            ) : null}
            {roleLabel ? <Row label="Your role" value={roleLabel} divider={false} /> : null}
          </FormGroup>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Module picker bottom sheet */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPickerOpen(false)}
          />
          <View
            style={[
              sheetStyles.sheet,
              {
                backgroundColor: t.colors.surface,
                borderTopLeftRadius: t.radii.sheet,
                borderTopRightRadius: t.radii.sheet,
                paddingBottom: insets.bottom + 8,
                maxHeight: '75%',
              },
            ]}
          >
            <View
              style={[sheetStyles.grabber, { backgroundColor: t.colors.tertiary }]}
            />
            <View
              style={[
                sheetStyles.header,
                {
                  borderBottomColor: t.colors.separator,
                  borderBottomWidth: t.hairline,
                },
              ]}
            >
              <Pressable
                onPress={() => setPickerOpen(false)}
                hitSlop={8}
                style={sheetStyles.sideBtn}
              >
                <Text variant="body" style={{ color: t.palette.blue.base }}>
                  Cancel
                </Text>
              </Pressable>
              <Text
                variant="headline"
                color="label"
                style={[sheetStyles.title, { fontWeight: '600' }]}
              >
                Pick a screen
              </Text>
              <View style={sheetStyles.sideBtn} />
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 12 }}
            >
              {FEEDBACK_MODULES.map((item, idx) => {
                const active = item.key === moduleKey;
                const last = idx === FEEDBACK_MODULES.length - 1;
                return (
                  <View key={item.key}>
                    <Pressable
                      onPress={() => {
                        setModuleKey(item.key);
                        setPickerOpen(false);
                      }}
                      style={({ pressed }) => [
                        sheetStyles.optionRow,
                        pressed && { backgroundColor: t.colors.fill3 },
                      ]}
                    >
                      <Text
                        variant="body"
                        color="label"
                        style={{ flex: 1, fontWeight: active ? '600' : '400' }}
                      >
                        {item.label}
                      </Text>
                      {active ? (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={t.palette.blue.base}
                        />
                      ) : null}
                    </Pressable>
                    {!last ? (
                      <View
                        style={{
                          height: t.hairline,
                          backgroundColor: t.colors.separator,
                          marginLeft: 16,
                        }}
                      />
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Type segmented control
  typeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },

  // Screenshots
  shotsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  shotsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shotTileWrap: {
    position: 'relative',
  },
  shotImage: {
    width: 80,
    height: 80,
  },
  shotRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotAdd: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const sheetStyles = StyleSheet.create({
  sheet: { paddingTop: 8 },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sideBtn: { minWidth: 70 },
  title: { flex: 1, textAlign: 'center' },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
  },
});
