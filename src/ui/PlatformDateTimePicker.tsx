/**
 * iOS: single spinner datetime picker. Android: `datetime` mode is not
 * supported — we chain date then time pickers to avoid
 * `pickers[mode].dismiss` crashing in @react-native-community/datetimepicker.
 */
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type Props = {
  value: Date;
  onChange: (next: Date) => void;
  /** When true, the picker UI is shown (iOS inline / Android dialogs). */
  open: boolean;
  /** Called when Android flow finishes or user dismisses. */
  onClose: () => void;
};

export function PlatformDateTimePicker({ value, onChange, open, onClose }: Props) {
  const [androidStep, setAndroidStep] = useState<'date' | 'time' | null>(null);

  useEffect(() => {
    if (open && Platform.OS === 'android') {
      setAndroidStep('date');
    }
    if (!open) {
      setAndroidStep(null);
    }
  }, [open]);

  if (!open) return null;

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="datetime"
        display="spinner"
        onChange={(_: DateTimePickerEvent, date?: Date) => {
          if (date) onChange(date);
        }}
      />
    );
  }

  if (androidStep === 'date') {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'dismissed') {
            onClose();
            setAndroidStep(null);
            return;
          }
          if (date) {
            const next = new Date(value);
            next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            onChange(next);
            setAndroidStep('time');
          }
        }}
      />
    );
  }

  if (androidStep === 'time') {
    return (
      <DateTimePicker
        value={value}
        mode="time"
        display="default"
        onChange={(event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'dismissed') {
            onClose();
            setAndroidStep(null);
            return;
          }
          if (date) {
            const next = new Date(value);
            next.setHours(date.getHours(), date.getMinutes(), 0, 0);
            onChange(next);
            onClose();
            setAndroidStep(null);
          }
        }}
      />
    );
  }

  return null;
}
