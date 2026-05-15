/**
 * v2 modal wrapper for every Toolkit module.
 *
 * Pattern: native iOS page-sheet with v2 ambient background, single-line
 * header (title + close X on the right), KeyboardAvoidingView so the
 * keyboard never overlaps focused inputs, and a scrollable body that
 * children can pad freely.
 *
 * Drops the v1 eyebrow + left-close conventions in favour of the iOS-26
 * sheet vocabulary used by the rest of v2 (Account / CRM / Lead / Apt).
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmbientBackground } from '@/src/ui/v2/AmbientBackground';
import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

export type ToolModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Disable the inner ScrollView (e.g. for SectionList screens). */
  scroll?: boolean;
  children: ReactNode;
};

export function ToolModal({
  visible,
  onClose,
  title,
  scroll = true,
  children,
}: ToolModalProps) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
        <AmbientBackground />

        {/* Header — title (left) + close X (right). Hairline divider sits
            beneath so the body content reads as a separate plane. */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top > 0 ? insets.top + 6 : 14,
              borderBottomColor: t.colors.separator,
              borderBottomWidth: t.hairline,
            },
          ]}
        >
          <Text
            variant="headline"
            color="label"
            style={{ flex: 1, fontWeight: '700' }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [
              styles.closeBtn,
              {
                backgroundColor: t.colors.fill3,
                borderRadius: 999,
              },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={18} color={t.colors.secondary} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          {scroll ? (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.flex}>{children}</View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 60,
    gap: 22,
  },
});
