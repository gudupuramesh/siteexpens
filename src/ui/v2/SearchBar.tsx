/**
 * v2 SearchBar — DESIGN.md §9.5.5.
 *
 * Compact filled-style search field with leading magnifying-glass icon
 * and an optional clear (X) button when there's text. Matches the
 * visual rhythm of the design's `screen-leads.jsx > search` block.
 */
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useThemeV2 } from '@/src/theme/v2';

export type SearchBarProps = Omit<TextInputProps, 'style'> & {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  ...rest
}: SearchBarProps) {
  const t = useThemeV2();

  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: t.colors.fill2,
          borderRadius: t.radii.field,
        },
      ]}
    >
      <Ionicons name="search" size={16} color={t.colors.secondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.secondary}
        style={[
          styles.input,
          { color: t.colors.label, ...t.type.subhead },
        ]}
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCorrect={false}
        autoCapitalize="none"
        {...rest}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={16} color={t.colors.tertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 0,
    margin: 0,
  },
});
