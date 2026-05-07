/**
 * TrustBadge — credibility mark for auth screens.
 *
 * Replaces the plain "HYDERABAD · 2026" stamp with a compact trust
 * signal: a star icon, "#1 App for Interior Designers", and a subtle
 * "Trusted by 10,000+ designers" line below.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/src/ui/Text';
import { color, fontFamily } from '@/src/theme/tokens';

export function TrustBadge() {
  return (
    <View style={styles.root}>
      <View style={styles.badge}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill={color.primary}>
          <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </Svg>
        <Text style={styles.title}>#1 App for Interior Designers</Text>
      </View>
      <Text style={styles.sub}>Trusted by 10,000+ designers across India</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: color.primary,
    letterSpacing: 0.2,
    fontFamily: fontFamily.sans,
  },
  sub: {
    fontSize: 10,
    color: color.textFaint,
    letterSpacing: 0.3,
    fontFamily: fontFamily.sans,
  },
});
