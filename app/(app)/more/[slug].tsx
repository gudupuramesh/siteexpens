import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '@/src/ui/Screen';
import { Text } from '@/src/ui/Text';
import { color, radius, screenInset, space } from '@/src/theme';

export default function MoreSectionPlaceholderScreen() {
  const { title } = useLocalSearchParams<{ slug: string; title?: string }>();
  const resolvedTitle = title || 'Section';

  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.navBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.navBtn}>
          <Ionicons name="arrow-back" size={20} color={color.text} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text variant="caption" color="textMuted" style={styles.navEyebrow}>MORE</Text>
          <Text variant="bodyStrong" color="text" numberOfLines={1}>{resolvedTitle}</Text>
        </View>
        <View style={styles.navBtn} />
      </View>

      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text variant="bodyStrong" color="text">{resolvedTitle}</Text>
          <Text variant="meta" color="textMuted" style={styles.sub}>
            This section is now scaffolded and ready. We can implement its full workflow next.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: 2,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.borderStrong,
    backgroundColor: color.bgGrouped,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.none,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
  navCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  navEyebrow: { letterSpacing: 1.2, marginBottom: 2 },
  wrap: { flex: 1, padding: screenInset },
  card: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: radius.none,
    backgroundColor: color.bg,
    padding: space.md,
  },
  sub: { marginTop: 6 },
});
