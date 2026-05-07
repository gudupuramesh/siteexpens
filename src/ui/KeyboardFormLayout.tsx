/**
 * Standard keyboard-safe form region: KeyboardAvoidingView + ScrollView with
 * sane defaults for iOS/Android. Use scroll={false} when children include a
 * FlatList/SectionList (wrap list only in KeyboardAvoidingView via export).
 */
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useKeyboardVerticalOffset(headerInset = 0, extra = 0): number {
  const insets = useSafeAreaInsets();
  return insets.top + headerInset + extra;
}

type Props = {
  children: ReactNode;
  /** Height of custom nav/header below status bar (when headerShown: false). */
  headerInset?: number;
  /** Extra pixels added to keyboardVerticalOffset. */
  keyboardVerticalOffsetExtra?: number;
  /** Default true. Set false when children are a FlatList/SectionList. */
  scroll?: boolean;
  behavior?: 'padding' | 'height' | 'position' | undefined;
  scrollViewProps?: Omit<ScrollViewProps, 'children' | 'keyboardShouldPersistTaps'>;
  contentContainerStyle?: ViewStyle;
  /** Optional footer pinned inside ScrollView (scrolls with content). */
  footer?: ReactNode;
};

export function KeyboardFormLayout({
  children,
  headerInset = 0,
  keyboardVerticalOffsetExtra = 0,
  scroll = true,
  behavior,
  scrollViewProps,
  contentContainerStyle,
  footer,
}: Props) {
  const keyboardVerticalOffset =
    useKeyboardVerticalOffset(headerInset, keyboardVerticalOffsetExtra);

  const resolvedBehavior =
    behavior !== undefined
      ? behavior
      : Platform.OS === 'ios'
        ? 'padding'
        : 'padding';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={resolvedBehavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollViewProps}
          keyboardDismissMode={scrollViewProps?.keyboardDismissMode ?? 'on-drag'}
          contentContainerStyle={[
            styles.scrollContent,
            contentContainerStyle,
            scrollViewProps?.contentContainerStyle,
          ]}
        >
          {children}
          {footer}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

/** KeyboardAvoidingView only — use around FlatList/SectionList as sibling wrapper. */
export function KeyboardAvoidingShell({
  children,
  headerInset = 0,
  keyboardVerticalOffsetExtra = 0,
  behavior,
}: Omit<Props, 'scroll' | 'scrollViewProps' | 'contentContainerStyle' | 'footer'> & {
  children: ReactNode;
}) {
  const keyboardVerticalOffset =
    useKeyboardVerticalOffset(headerInset, keyboardVerticalOffsetExtra);
  const resolvedBehavior =
    behavior !== undefined
      ? behavior
      : Platform.OS === 'ios'
        ? 'padding'
        : 'padding';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={resolvedBehavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
});
