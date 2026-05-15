/**
 * v2 SheetHeader — DESIGN.md §3.13.
 *
 * Top bar for sheet-style forms: Cancel · centered title · Save.
 * Includes a 36×5 grabber pip when `grabber` is true (used when the
 * screen is presented as a bottom sheet).
 *
 * For full-screen pushed forms (most of our forms today), pass
 * `grabber={false}` — only the Cancel/Title/Save row renders.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeV2 } from '@/src/theme/v2';
import { haptic } from '@/src/lib/haptics';

import { Text } from './Text';

export type SheetHeaderProps = {
  title: string;
  cancelLabel?: string;
  saveLabel?: string;
  saveDisabled?: boolean;
  saveLoading?: boolean;
  /** Render the 36×5 grabber pip at the top (for bottom-sheet presentations). */
  grabber?: boolean;
  /** Use safe-area top inset (true for full-screen pushed forms). Default true. */
  respectSafeArea?: boolean;
  onCancel: () => void;
  onSave: () => void;
};

export function SheetHeader({
  title,
  cancelLabel = 'Cancel',
  saveLabel = 'Save',
  saveDisabled = false,
  saveLoading = false,
  grabber = false,
  respectSafeArea = true,
  onCancel,
  onSave,
}: SheetHeaderProps) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();

  const topPad = respectSafeArea ? insets.top + 6 : 6;

  // Transparent header — the AmbientBackground (or whatever sits
  // behind the parent screen) flows through. Sheet-style screens
  // pushed via Stack used to render a white surface slab here that
  // visually broke the ambient gradient — a hairline + surface fill
  // told the eye "this is a different layer" even when the content
  // below was the same surface. Letting the bg flow through keeps
  // the screen reading as a single page; the form-group cards
  // inside still provide the surface contrast where it matters.
  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: topPad },
      ]}
    >
      {grabber ? (
        <View
          style={[
            styles.grabber,
            { backgroundColor: t.colors.tertiary },
          ]}
        />
      ) : null}

      <View style={styles.row}>
        <Pressable
          onPress={() => {
            haptic.selection();
            onCancel();
          }}
          hitSlop={8}
          style={styles.sideBtn}
        >
          <Text variant="body" style={{ color: t.palette.blue.base }}>
            {cancelLabel}
          </Text>
        </Pressable>

        <Text
          variant="headline"
          color="label"
          style={styles.title}
          numberOfLines={1}
        >
          {title}
        </Text>

        <Pressable
          onPress={() => {
            // Success haptic on the commit gesture — feels native iOS
            // (Mail "send", Notes "done"). If the upstream onSave
            // throws/validates-fails, the screen can fire haptic.error.
            haptic.success();
            onSave();
          }}
          disabled={saveDisabled || saveLoading}
          hitSlop={8}
          style={({ pressed }) => [
            styles.sideBtn,
            { alignItems: 'flex-end' },
            (saveDisabled || saveLoading || pressed) && { opacity: 0.5 },
          ]}
        >
          <Text
            variant="body"
            style={{
              color: saveDisabled
                ? t.colors.tertiary
                : t.palette.blue.base,
              fontWeight: '600',
            }}
          >
            {saveLoading ? 'Saving…' : saveLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 12,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 32,
  },
  sideBtn: {
    minWidth: 70,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
  },
});
