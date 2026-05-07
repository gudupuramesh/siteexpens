/**
 * Cross-platform date picker.
 *
 * - **iOS:** Full-screen modal with spinner + explicit Cancel / Done (avoids
 *   embedded spinners in ScrollViews closing unpredictably and no confirm UX).
 * - **Android:** System dialog (`display="default"`); closes on pick or dismiss.
 */
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

export type DatePickerModalProps = {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
};

export function DatePickerModal({
  visible,
  value,
  onClose,
  onConfirm,
  maximumDate,
  minimumDate,
}: DatePickerModalProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  if (!visible) return null;

  if (Platform.OS === 'android') {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        maximumDate={maximumDate}
        minimumDate={minimumDate}
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          onClose();
          if (event.type !== 'dismissed' && date) {
            onConfirm(date);
          }
        }}
      />
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.iosRoot}>
        <Pressable style={styles.iosBackdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={styles.iosSheet}>
          <View style={styles.toolbar}>
            <Pressable onPress={onClose} hitSlop={16} style={styles.toolbarBtn}>
              <Text variant="body" color="primary">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onConfirm(draft);
                onClose();
              }}
              hitSlop={16}
              style={styles.toolbarBtn}
            >
              <Text variant="bodyStrong" color="primary">
                Done
              </Text>
            </Pressable>
          </View>
          <DateTimePicker
            value={draft}
            mode="date"
            display="spinner"
            themeVariant="light"
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            onChange={(_: DateTimePickerEvent, date?: Date) => {
              if (date) setDraft(date);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iosRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  iosSheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.lg,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  toolbarBtn: {
    minWidth: 72,
  },
});
