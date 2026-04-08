/**
 * Entry redirect. Decides where the user should land based on auth state:
 *   - still checking -> render a centered spinner
 *   - signed in      -> /(app)
 *   - signed out     -> /(auth)/sign-in
 */
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/src/features/auth/useAuth';
import { color } from '@/src/theme';

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={color.primary} />
      </View>
    );
  }

  return <Redirect href={user ? '/(app)' : '/(auth)/sign-in'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg,
  },
});
