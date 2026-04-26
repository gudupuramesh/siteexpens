/**
 * Modal wrapper for every Toolkit module.
 *
 * One consistent shell — back/close header, scrollable body, optional
 * sticky footer — so each module focuses on its own form/output and
 * doesn't re-implement chrome.
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

import { Text } from '@/src/ui/Text';
import { color, fontFamily, space } from '@/src/theme';

export type ToolModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Optional small caps eyebrow above the title — e.g. "CONVERTER". */
  eyebrow?: string;
  /** Disable the inner ScrollView (e.g. for Bubble Level / Compass which
   *  fill the viewport with their own UI). */
  scroll?: boolean;
  children: ReactNode;
};

export function ToolModal({
  visible,
  onClose,
  title,
  eyebrow,
  scroll = true,
  children,
}: ToolModalProps) {
  const Body = scroll ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.root}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="close" size={22} color={color.textMuted} />
            </Pressable>
            <View style={styles.titleWrap}>
              {eyebrow ? (
                <Text style={styles.eyebrow}>{eyebrow}</Text>
              ) : null}
              <Text variant="title" numberOfLines={1}>
                {title}
              </Text>
            </View>
            <View style={styles.headerBtn} />
          </View>

          <Body
            style={styles.body}
            contentContainerStyle={scroll ? styles.scrollContent : undefined}
            keyboardShouldPersistTaps={scroll ? 'handled' : undefined}
          >
            {children}
          </Body>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingTop: 50,
    paddingBottom: space.sm,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    gap: space.xs,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1 },
  eyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  body: { flex: 1 },
  scrollContent: { padding: space.md, paddingBottom: 60, gap: space.md },
});
