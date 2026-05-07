/**
 * TextField primitive. ~48pt min row, flat background, no heavy
 * border. Focus state darkens the bottom edge to primary. Optional
 * leading adornment (e.g. "+91" for phone input) and label above.
 */
import { forwardRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  type TextInputProps,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { color, radius, space, minTouchTarget, type } from '@/src/theme';

import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  /** Label rendered above the input (caption variant). Optional. */
  label?: string;
  /** Inline content rendered to the left of the input — e.g. "+91". */
  /** Leading adornment. Pass a string ("+91") for the legacy
   *  rendering (slate-muted body text), or any ReactNode for a
   *  custom chip — e.g. an India-flag SVG + country code. */
  leading?: React.ReactNode;
  /** Error message rendered below the input. */
  error?: string;
  containerStyle?: ViewStyle;
  /**
   * Use white surface so fields stay visible on `Screen bg="grouped"` (same
   * gray as the canvas would otherwise hide the input well).
   */
  surface?: boolean;
  /** Optional square visual style for InteriorOS parity. */
  square?: boolean;
  /** Use stronger border (`hairline2`) for clearer field separation. */
  strongBorder?: boolean;
  /** Optional override of the inner `<TextInput>` text style. Use
   *  for cases like an OTP field that needs monospaced + heavily
   *  letter-spaced input text. Merged on top of the default. */
  inputStyle?: StyleProp<TextStyle>;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    leading,
    error,
    containerStyle,
    surface = true,
    square = false,
    strongBorder = false,
    inputStyle,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="caption" color="textMuted" style={styles.label}>
          {label.toUpperCase()}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          surface && styles.fieldSurface,
          square && styles.fieldSquare,
          strongBorder && styles.fieldStrongBorder,
          rest.multiline && styles.fieldMultiline,
          focused && styles.fieldFocused,
          error ? styles.fieldError : null,
        ]}
      >
        {leading != null ? (
          typeof leading === 'string' ? (
            <Text variant="body" color="textMuted" style={styles.leading}>
              {leading}
            </Text>
          ) : (
            // ReactNode adornment (e.g. flag + country code chip).
            // Caller is responsible for sizing/styling.
            <View style={styles.leading}>{leading}</View>
          )
        ) : null}
        <TextInput
          ref={ref}
          {...rest}
          placeholderTextColor={color.textFaint}
          style={[styles.input, rest.multiline && styles.inputMultiline, inputStyle]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    // Built-in top margin so consecutive `<TextField>`s on a form
    // don't glue the next field's caps label to the bottom of the
    // previous input. Each field reads as its own labelled block
    // — matches the Add File reference where NAME / NOTE both sit
    // a clear gap below the field above them. The very first
    // field in a form gets this gap too, which is fine — the form
    // header / page padding absorbs it.
    marginTop: space.md,
    marginBottom: space.sm,
    letterSpacing: 0.4,
  },
  field: {
    minHeight: minTouchTarget + 4,
    borderRadius: radius.lg2,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    // Default border bumped from `color.border` (#EEF2F7 — almost
    // invisible on white) to `color.borderStrong` (#E2E8F0). On a
    // white canvas the field reads as a discrete bounded box
    // instead of a faint phantom rectangle. Callers that want the
    // even stronger primary-toned border still pass `strongBorder`
    // to opt into focused styling.
    borderColor: color.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  fieldSurface: {
    backgroundColor: color.surface,
  },
  fieldSquare: {
    // "Square" variant — kept around for callers that want a
    // tighter look than the default 10px field, but never truly
    // flat. 8px keeps the field family consistent with the rest
    // of the app (chips/buttons at 8, cards at 10).
    borderRadius: radius.sm,
  },
  fieldStrongBorder: {
    borderColor: color.borderStrong,
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    paddingTop: space.sm,
    paddingBottom: space.sm,
    minHeight: 100,
  },
  fieldFocused: {
    borderColor: color.primary,
    backgroundColor: color.surface,
  },
  fieldError: {
    borderColor: color.danger,
  },
  leading: {
    marginRight: space.md,
  },
  input: {
    flex: 1,
    fontSize: type.body.fontSize,
    color: color.text,
    /**
     * iOS: tight lineHeight + modest padding — large lineHeight + heavy padding
     * leaves empty space above glyphs and looks “compressed” toward the bottom.
     * Android: full body lineHeight + textAlignVertical for Roboto.
     */
    ...Platform.select({
      ios: {
        lineHeight: type.bodyStrong.lineHeight, // 18 @ 14px — enough for ascenders, visually centered
        paddingTop: 9,
        paddingBottom: 10,
      },
      android: {
        lineHeight: type.body.lineHeight,
        paddingVertical: 10,
        textAlignVertical: 'center',
      },
    }),
  },
  inputMultiline: {
    minHeight: 88,
    lineHeight: type.body.lineHeight,
    paddingVertical: space.md,
    ...Platform.select({
      android: { textAlignVertical: 'top' },
    }),
  },
  error: {
    marginTop: space.sm,
  },
});
