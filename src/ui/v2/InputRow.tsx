/**
 * v2 InputRow — text-input variant of `Row`.
 *
 * Layout matches `Row`'s rhythm: optional leading icon · label (left) ·
 * editable input (right, right-aligned) · hairline divider at the bottom.
 *
 * Supports multiline (notes / brief). When multiline, the input wraps
 * below the label instead of sitting beside it (cleaner for longer text).
 */
import { forwardRef, type Ref } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';

import { Text } from './Text';

export type InputRowProps = {
  /** Optional leading slot — typically an <IconTile />. */
  leading?: React.ReactNode;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  /** Inputs that grow vertically (Notes, Brief). */
  multiline?: boolean;
  /** Numeric (decimal-pad) — for ₹ amounts. */
  keyboardType?: TextInputProps['keyboardType'];
  /** Auto-capitalize behavior. Default 'sentences' for normal text. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** Render the bottom divider. Default true; pass false for last row. */
  divider?: boolean;
  /** Optional override for row min height. Default 48 (single-line). */
  height?: number;
  /** Optional onBlur for react-hook-form integration. */
  onBlur?: () => void;
  /** Optional return-key behavior. */
  returnKeyType?: TextInputProps['returnKeyType'];
  blurOnSubmit?: boolean;
  onSubmitEditing?: () => void;
};

export const InputRow = forwardRef(function InputRow(
  {
    leading,
    label,
    value,
    onChangeText,
    placeholder,
    multiline = false,
    keyboardType,
    autoCapitalize = 'sentences',
    divider = true,
    height = 48,
    onBlur,
    returnKeyType,
    blurOnSubmit,
    onSubmitEditing,
  }: InputRowProps,
  ref: Ref<TextInput>,
) {
  const t = useThemeV2();
  const dividerLeft = leading ? 56 : 16;

  if (multiline) {
    // Multiline layout: label on top, input wraps below.
    return (
      <View style={[styles.multiWrap, { paddingHorizontal: 16, paddingVertical: 10 }]}>
        {leading ? <View style={styles.leadingTop}>{leading}</View> : null}
        <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Text>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={t.colors.tertiary}
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          blurOnSubmit={blurOnSubmit}
          onSubmitEditing={onSubmitEditing}
          style={[
            styles.multiInput,
            { color: t.colors.label, ...t.type.body },
          ]}
        />
        {divider ? (
          <View
            style={[
              styles.divider,
              { backgroundColor: t.colors.separator, left: 16 },
            ]}
          />
        ) : null}
      </View>
    );
  }

  // Single-line layout: label · input (right) · divider
  return (
    <View
      style={[
        styles.row,
        { minHeight: height },
      ]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}

      <Text variant="callout" color="label" style={styles.label}>
        {label}
      </Text>

      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={t.colors.tertiary}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        blurOnSubmit={blurOnSubmit}
        onSubmitEditing={onSubmitEditing}
        style={[
          styles.input,
          { color: t.colors.label, ...t.type.body },
        ]}
      />

      {divider ? (
        <View
          style={[
            styles.divider,
            { backgroundColor: t.colors.separator, left: dividerLeft },
          ]}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    position: 'relative',
  },
  leading: {
    marginRight: 12,
  },
  label: {
    flexShrink: 0,
    minWidth: 88,
  },
  input: {
    flex: 1,
    textAlign: 'right',
    paddingVertical: 0,
    margin: 0,
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    height: 0.5,
  },

  // Multiline layout
  multiWrap: {
    position: 'relative',
  },
  leadingTop: {
    marginBottom: 6,
  },
  multiInput: {
    minHeight: 60,
    paddingTop: 6,
    paddingBottom: 0,
    margin: 0,
  },
});
