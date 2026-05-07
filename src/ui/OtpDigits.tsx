/**
 * OtpDigits — six-box one-time-code input.
 *
 * Six `<TextInput>`s in a row with refs for:
 *   - auto-advance (typing a digit jumps focus to the next box)
 *   - backspace-back (deleting an empty box jumps to the previous)
 *   - paste-fills-all (pasting "123456" anywhere fills every box)
 *   - SMS auto-fill (the first input carries `autoComplete="sms-otp"`
 *     + `textContentType="oneTimeCode"` — iOS / Android will route
 *     the full code into it, our paste handler then distributes it)
 *
 * Stays a controlled component — the parent owns the 6-char `value`
 * string and gets called back via `onChange(next)`. `onComplete` is
 * a convenience callback fired when the value reaches 6 digits, so
 * the verify screen can auto-submit on the last keystroke.
 */
import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type ViewStyle,
} from 'react-native';

import { color } from '@/src/theme/tokens';

const DIGIT_COUNT = 6;

export type OtpDigitsHandle = {
  /** Focus the next empty box (or the last box if all filled). */
  focus: () => void;
  /** Clear all boxes and focus the first. */
  clear: () => void;
};

export type OtpDigitsProps = {
  /** Current code — 0 to 6 digits. */
  value: string;
  /** Called with the new code after every keystroke / paste. */
  onChange: (next: string) => void;
  /** Fired once the code reaches 6 digits. */
  onComplete?: (code: string) => void;
  /** Show the boxes in an error state (red border). */
  error?: boolean;
  /** Disable input (used while submitting). */
  disabled?: boolean;
  /** Auto-focus the first box on mount. Default true. */
  autoFocus?: boolean;
  style?: ViewStyle;
};

export const OtpDigits = forwardRef<OtpDigitsHandle, OtpDigitsProps>(
  function OtpDigits(
    {
      value,
      onChange,
      onComplete,
      error,
      disabled,
      autoFocus = true,
      style,
    },
    ref,
  ) {
    const inputs = useRef<Array<TextInput | null>>([]);

    useImperativeHandle(ref, () => ({
      focus: () => {
        const idx = Math.min(value.length, DIGIT_COUNT - 1);
        inputs.current[idx]?.focus();
      },
      clear: () => {
        onChange('');
        inputs.current[0]?.focus();
      },
    }));

    /** Replace the code with `next` (digits only, capped at 6) and
     *  fire `onComplete` if it just reached full length. */
    function commit(next: string) {
      const digits = next.replace(/\D/g, '').slice(0, DIGIT_COUNT);
      onChange(digits);
      if (digits.length === DIGIT_COUNT) onComplete?.(digits);
    }

    function handleChange(idx: number, raw: string) {
      const cleaned = raw.replace(/\D/g, '');
      // Paste / SMS-autofill: if more than one digit lands in a
      // single box we treat it as the full code and distribute.
      if (cleaned.length > 1) {
        commit(cleaned);
        const target = Math.min(cleaned.length, DIGIT_COUNT - 1);
        setTimeout(() => inputs.current[target]?.focus(), 0);
        return;
      }
      // Single character — splice into the right slot of the
      // value string. (The TextInput's value is derived from
      // `value[idx]` so we always rebuild the canonical string.)
      const arr = value.split('');
      arr[idx] = cleaned;
      // Pad missing slots so the join doesn't drop trailing empties.
      for (let i = 0; i < DIGIT_COUNT; i++) if (arr[i] == null) arr[i] = '';
      const next = arr.join('').slice(0, DIGIT_COUNT);
      commit(next);
      // Advance to the next box on type, but only if we actually
      // wrote a digit (deleting via input shouldn't advance).
      if (cleaned && idx < DIGIT_COUNT - 1) {
        inputs.current[idx + 1]?.focus();
      }
    }

    function handleKeyPress(
      idx: number,
      e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    ) {
      if (e.nativeEvent.key !== 'Backspace') return;
      // If this box is already empty, jump back and clear that one.
      if (!value[idx] && idx > 0) {
        const arr = value.split('');
        arr[idx - 1] = '';
        for (let i = 0; i < DIGIT_COUNT; i++) if (arr[i] == null) arr[i] = '';
        commit(arr.join(''));
        inputs.current[idx - 1]?.focus();
      }
    }

    return (
      <View style={[styles.row, style]}>
        {Array.from({ length: DIGIT_COUNT }).map((_, idx) => {
          const ch = value[idx] ?? '';
          return (
            <TextInput
              key={idx}
              ref={(el) => {
                inputs.current[idx] = el;
              }}
              value={ch}
              onChangeText={(t) => handleChange(idx, t)}
              onKeyPress={(e) => handleKeyPress(idx, e)}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={DIGIT_COUNT /* allow paste of full code */}
              editable={!disabled}
              // Only the first input declares the OTP autofill hints —
              // paste handler routes the full code into all six.
              autoComplete={idx === 0 ? 'sms-otp' : 'off'}
              textContentType={idx === 0 ? 'oneTimeCode' : 'none'}
              autoFocus={autoFocus && idx === 0}
              selectionColor={color.primary}
              style={[
                styles.box,
                ch && styles.boxFilled,
                error && styles.boxError,
                disabled && styles.boxDisabled,
              ]}
            />
          );
        })}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  box: {
    width: 46,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '600',
    color: color.text,
    // RN-iOS quirk: setting a large fontSize without an explicit
    // padding sometimes vertically crops the glyph. paddingVertical
    // on a fixed-height box is fine because we control height.
    paddingVertical: 0,
  },
  boxFilled: {
    borderColor: color.primary,
    backgroundColor: color.lavenderWash,
  },
  boxError: {
    borderColor: color.danger,
  },
  boxDisabled: {
    opacity: 0.5,
  },
});
