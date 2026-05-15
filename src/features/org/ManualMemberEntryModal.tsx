/**
 * ManualMemberEntryModal — small two-field bottom sheet used by the
 * team-add screens (project members + org-wide team & roles) when
 * the user picks "+ New Member" in /select-party?mode=team for
 * someone not in their phonebook.
 *
 * Flow:
 *   /select-party → user taps "+ New Member" → outbox `manual`
 *     → calling screen opens this modal
 *     → user types name + phone
 *     → calling screen receives `(name, phoneE164)` via `onContinue`
 *       and hands off to its role picker / invite flow.
 *
 * Self-contained: holds its own name/phone/error state so the parent
 * doesn't re-render on every keystroke. Resets on each open via the
 * `state.open` flag.
 */
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { normalizeIndianPhoneE164 } from '@/src/lib/phone';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export type ManualMemberEntryState =
  | { open: false }
  | { open: true };

export type ManualMemberEntryModalProps = {
  state: ManualMemberEntryState;
  onClose: () => void;
  /** Receives the trimmed name and the normalized E.164 phone. */
  onContinue: (name: string, phoneE164: string) => void;
  /** Optional copy override — defaults match the project members
   *  screen. The team-roles screen wants a slightly different hint
   *  (mentions "organisation" instead of "project"). */
  hint?: string;
};

export function ManualMemberEntryModal({
  state,
  onClose,
  onContinue,
  hint,
}: ManualMemberEntryModalProps) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();

  // Reset whenever the modal opens — we keep state across renders so
  // the form doesn't lose user input on parent re-renders.
  useEffect(() => {
    if (state.open) {
      setName('');
      setPhone('');
      setError(undefined);
    }
  }, [state.open]);

  if (!state.open) return null;

  const handleContinue = () => {
    const trimmedName = name.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    if (!trimmedName) {
      setError('Enter a name.');
      return;
    }
    const e164 = normalizeIndianPhoneE164(phoneDigits);
    if (!e164) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    onContinue(trimmedName, e164);
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View
            style={[styles.grabber, { backgroundColor: t.colors.tertiary }]}
          />
          <View style={styles.headerRow}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>
            <Text
              variant="headline"
              color="label"
              style={{ flex: 1, textAlign: 'center', fontWeight: '700' }}
            >
              New team member
            </Text>
            <Pressable onPress={handleContinue} hitSlop={8}>
              <Text
                variant="body"
                style={{ color: t.palette.blue.base, fontWeight: '700' }}
              >
                Next
              </Text>
            </Pressable>
          </View>

          <Text
            variant="caption1"
            color="secondary"
            style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}
          >
            {hint ??
              "Type the person's name + phone. We'll send them an OTP invite after you pick their role."}
          </Text>

          <View style={styles.body}>
            <View
              style={[
                styles.field,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                },
              ]}
            >
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                NAME
              </Text>
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (error) setError(undefined);
                }}
                placeholder="e.g. Suresh Kumar"
                placeholderTextColor={t.colors.tertiary}
                style={[
                  styles.input,
                  { color: t.colors.label, ...t.type.callout },
                ]}
                autoCapitalize="words"
                autoFocus
                returnKeyType="next"
              />
            </View>

            <View
              style={[
                styles.field,
                {
                  backgroundColor: t.colors.fill3,
                  borderRadius: t.radii.field,
                },
              ]}
            >
              <Text
                variant="caption2"
                color="tertiary"
                style={{ letterSpacing: 0.5 }}
              >
                PHONE (+91)
              </Text>
              <TextInput
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (error) setError(undefined);
                }}
                placeholder="98765 43210"
                placeholderTextColor={t.colors.tertiary}
                keyboardType="phone-pad"
                maxLength={13}
                style={[
                  styles.input,
                  { color: t.colors.label, ...t.type.callout },
                ]}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
            </View>

            {error ? (
              <Text
                variant="caption1"
                style={{ color: t.palette.red.base, marginTop: 6 }}
              >
                {error}
              </Text>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingTop: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  body: {
    paddingHorizontal: 16,
    gap: 10,
  },
  field: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  input: {
    paddingVertical: 4,
    margin: 0,
  },
});
