/**
 * v2 NumberField — labelled numeric input card.
 *
 * Visual: surface card (radii.field, hairline border, surface bg) with a
 * caption label up top, a callout/title-sized number input in the middle,
 * a tertiary unit chip pinned right, and an optional secondary hint
 * caption below.
 *
 * Keeps its own raw string value so the user can type "0.", "12.",
 * clear it, etc. without React stomping on the caret. Empty input → emits
 * `null` via the centralised `parseNum` helper so callers can decide
 * whether to show a blank result or 0.
 */
import { StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

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
  const t = useThemeV2();

  function sanitize(raw: string) {
    let cleaned = raw.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
    if (decimal) {
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
    <View>
      <View
        style={[
          styles.card,
          {
            backgroundColor: t.colors.surface,
            borderRadius: t.radii.field,
            borderColor:
              t.mode === 'dark'
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(0,0,0,0.04)',
            borderWidth: t.hairline,
            paddingVertical: size === 'lg' ? 12 : 10,
            paddingHorizontal: 14,
          },
        ]}
      >
        <Text
          variant="caption2"
          color="tertiary"
          style={{ letterSpacing: 0.5 }}
        >
          {label.toUpperCase()}
        </Text>

        <View style={styles.row}>
          <TextInput
            value={value}
            onChangeText={sanitize}
            placeholder={placeholder}
            placeholderTextColor={t.colors.tertiary}
            keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
            style={[
              styles.input,
              size === 'lg' ? t.type.title2 : t.type.headline,
              {
                color: t.colors.label,
                fontVariant: ['tabular-nums'],
                fontWeight: '700',
              },
            ]}
          />
          {unit ? (
            <Text
              variant="footnote"
              color="tertiary"
              style={{ marginLeft: 6, fontWeight: '600' }}
            >
              {unit}
            </Text>
          ) : null}
        </View>
      </View>

      {hint ? (
        <Text
          variant="caption1"
          color="secondary"
          style={styles.hint}
        >
          {hint}
        </Text>
      ) : null}
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
  card: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  input: {
    flex: 1,
    paddingVertical: 4,
    margin: 0,
  },
  hint: {
    marginTop: 6,
    paddingHorizontal: 4,
  },
});
