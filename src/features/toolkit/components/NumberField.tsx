/**
 * Numeric input field. Keeps its own raw string value (so the user can
 * type "0.", "12.", clear it, etc. without React stomping on caret),
 * and reports parsed numbers via `onChangeNumber`.
 *
 * Empty input → emits `null` so callers can decide whether to show a
 * blank result or 0.
 */
import { StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, space } from '@/src/theme';

export type NumberFieldProps = {
  label: string;
  /** Right-side unit chip — e.g. "ft", "m²". Optional. */
  unit?: string;
  /** Controlled raw text value. */
  value: string;
  onChangeText: (text: string) => void;
  /** Optional helper text under the input (hint or validation). */
  hint?: string;
  /** Visual emphasis — bigger text for "hero" inputs in the converter. */
  size?: 'md' | 'lg';
  placeholder?: string;
  /** Allow decimal point. Default true. */
  decimal?: boolean;
};

export function NumberField({
  label,
  unit,
  value,
  onChangeText,
  hint,
  size = 'md',
  placeholder = '0',
  decimal = true,
}: NumberFieldProps) {
  function sanitize(t: string) {
    // Strip everything that isn't a digit or (optionally) one dot.
    let cleaned = t.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
    if (decimal) {
      // Collapse multiple dots to the first one.
      const firstDot = cleaned.indexOf('.');
      if (firstDot !== -1) {
        cleaned =
          cleaned.slice(0, firstDot + 1) +
          cleaned.slice(firstDot + 1).replace(/\./g, '');
      }
    }
    onChangeText(cleaned);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, size === 'lg' && styles.inputRowLg]}>
        <TextInput
          value={value}
          onChangeText={sanitize}
          placeholder={placeholder}
          placeholderTextColor={color.textFaint}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          style={[styles.input, size === 'lg' && styles.inputLg]}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Parse a raw input string into a finite number, or null if blank /
 * not a valid number. Centralised so every module handles "" the same.
 */
export function parseNum(s: string): number | null {
  if (!s || s === '.' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    paddingHorizontal: space.sm,
  },
  inputRowLg: { paddingHorizontal: space.md },
  input: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '600',
    color: color.text,
    paddingVertical: 12,
  },
  inputLg: {
    fontSize: 22,
    paddingVertical: 16,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontFamily: fontFamily.mono,
    fontSize: 12,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 0.6,
    marginLeft: 8,
  },
  hint: {
    fontSize: 11,
    color: color.textFaint,
    marginTop: 2,
  },
});
