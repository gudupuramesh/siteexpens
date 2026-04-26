/**
 * TextField primitive. 48pt tall, flat #F7F8FA background, no heavy
 * border. Focus state darkens the bottom edge to primary. Optional
 * leading adornment (e.g. "+91" for phone input) and label above.
 */
import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { color, radius, space, minTouchTarget, type } from '@/src/theme';

import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  /** Label rendered above the input (caption variant). Optional. */
  label?: string;
  /** Inline content rendered to the left of the input — e.g. "+91". */
  leading?: string;
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
        {leading ? (
          <Text variant="body" color="textMuted" style={styles.leading}>
            {leading}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          {...rest}
          placeholderTextColor={color.textFaint}
          style={[styles.input, rest.multiline && styles.inputMultiline]}
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
    marginBottom: space.sm,
    letterSpacing: 0.4,
  },
  field: {
    minHeight: minTouchTarget + 4, // 48pt
    borderRadius: radius.md,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: color.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  fieldSurface: {
    backgroundColor: color.surface,
  },
  fieldSquare: {
    borderRadius: radius.none,
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
    lineHeight: type.body.fontSize, // tighter than the variant lineHeight to vertically center
    color: color.text,
    padding: 0,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  error: {
    marginTop: space.sm,
  },
});
