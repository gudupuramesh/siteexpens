/**
 * v2 DateTimeSheet — DESIGN.md §9.5.3 (date picker, bottom-sheet variant).
 *
 * Bottom sheet with: Cancel · Title · **Done** at the top, native iOS
 * spinner picker (or Android dialog) inside.
 *
 * Replaces the older inline `PlatformDateTimePicker` (now removed) which
 * showed the iOS spinner inline with NO Done button — once the user spun
 * the wheel there was no clear way to commit/dismiss. This sheet gives
 * the picker a proper modal frame with explicit Done/Cancel.
 *
 * Behavior:
 *   • Picking a value in the wheel updates a TEMP local copy
 *   • Done   → calls onChange(temp), then onClose()
 *   • Cancel → just calls onClose() (does NOT update the parent)
 *   • Tap backdrop = Cancel
 *
 * On Android, `DateTimePicker` shows a native dialog (no sheet needed),
 * but we still wrap so the API is identical from the call site.
 */
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeV2 } from '@/src/theme/v2';

import { Text } from './Text';

export type DateTimeSheetProps = {
  open: boolean;
  /** Current value. Pass `new Date()` if unset so the spinner has somewhere to start. */
  value: Date;
  /** Called with the picked value when the user taps Done. */
  onChange: (next: Date) => void;
  /** Called whenever the sheet should dismiss (Cancel, backdrop, Done). */
  onClose: () => void;
  /** Picker mode. Default 'datetime'. */
  mode?: 'date' | 'time' | 'datetime';
  /** Sheet title. Default depends on mode. */
  title?: string;
};

export function DateTimeSheet({
  open,
  value,
  onChange,
  onClose,
  mode = 'datetime',
  title,
}: DateTimeSheetProps) {
  const t = useThemeV2();
  const insets = useSafeAreaInsets();
  const [temp, setTemp] = useState<Date>(value);

  // Reset temp value whenever the sheet (re)opens.
  useEffect(() => {
    if (open) setTemp(value);
  }, [open, value]);

  const sheetTitle =
    title ??
    (mode === 'date' ? 'Select date' : mode === 'time' ? 'Select time' : 'Select date & time');

  // Android — native dialog. No sheet needed, but we still gate on `open`
  // and emit Done on first dialog confirm.
  if (Platform.OS === 'android') {
    if (!open) return null;
    return (
      <DateTimePicker
        value={value}
        mode={mode === 'datetime' ? 'date' : mode}
        onChange={(_: DateTimePickerEvent, d?: Date) => {
          if (d) onChange(d);
          onClose();
        }}
      />
    );
  }

  // iOS — bottom sheet with Cancel · Title · Done
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          // Stop tap propagation inside the sheet so it doesn't dismiss
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: t.colors.surface,
              borderTopLeftRadius: t.radii.sheet,
              borderTopRightRadius: t.radii.sheet,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          {/* Grabber */}
          <View style={[styles.grabber, { backgroundColor: t.colors.tertiary }]} />

          {/* Header — Cancel · Title · Done */}
          <View
            style={[
              styles.header,
              {
                borderBottomColor: t.colors.separator,
                borderBottomWidth: t.hairline,
              },
            ]}
          >
            <Pressable onPress={onClose} hitSlop={8} style={styles.sideBtn}>
              <Text variant="body" style={{ color: t.palette.blue.base }}>
                Cancel
              </Text>
            </Pressable>

            <Text
              variant="headline"
              color="label"
              style={styles.title}
              numberOfLines={1}
            >
              {sheetTitle}
            </Text>

            <Pressable
              onPress={() => {
                onChange(temp);
                onClose();
              }}
              hitSlop={8}
              style={[styles.sideBtn, { alignItems: 'flex-end' }]}
            >
              <Text
                variant="body"
                style={{ color: t.palette.blue.base, fontWeight: '700' }}
              >
                Done
              </Text>
            </Pressable>
          </View>

          {/* Picker — iOS spinner */}
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={temp}
              mode={mode}
              display="spinner"
              themeVariant={t.mode}
              onChange={(_: DateTimePickerEvent, d?: Date) => {
                if (d) setTemp(d);
              }}
              style={styles.picker}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sideBtn: {
    minWidth: 70,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
  },
  pickerWrap: {
    paddingHorizontal: 8,
  },
  picker: {
    height: 220,
  },
});
