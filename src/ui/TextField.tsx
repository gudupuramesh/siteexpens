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
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, leading, error, containerStyle, onFocus, onBlur, ...rest },
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
          style={styles.input}
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
    height: minTouchTarget + 4, // 48pt
    borderRadius: radius.md,
    backgroundColor: color.bgGrouped,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  fieldFocused: {
    borderColor: color.primary,
    backgroundColor: color.bg,
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
  error: {
    marginTop: space.sm,
  },
});
