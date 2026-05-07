/**
 * TabLoadingSkeleton — full-screen loading state for tab roots.
 *
 * Why this exists: the bottom-tab screens use react-native-screens'
 * default behaviour where inactive tabs are detached from the native
 * view hierarchy. When the user taps a tab, the screen re-mounts from
 * scratch — Firestore hooks (org, projects, etc.) start fetching only
 * AFTER first paint. Without a loading state the user sees the empty
 * layout shell with blank space at the top until the snapshot arrives
 * (~100-500ms), which looks like the page is broken.
 *
 * This skeleton fills that gap: a centered themed loader on the
 * surface canvas, sized to match a tab's safe area. Each tab passes
 * its own loader (via the `loader` prop) so the cue is contextual:
 *   - Projects tab → BlueprintLoader (architectural)
 *   - More tab → SwatchesLoader (default)
 *   - Overview / CRM / Toolkit → SwatchesLoader (default)
 */
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from './Screen';
import { SwatchesLoader } from './loaders';
import { Text } from './Text';
import { color } from '@/src/theme';

type Props = {
  /** Optional override loader. Defaults to SwatchesLoader. */
  loader?: ReactNode;
  /** Optional caption shown beneath the loader. */
  label?: string;
};

export function TabLoadingSkeleton({ loader, label }: Props) {
  return (
    <Screen bg="grouped" padded={false} style={{ backgroundColor: color.bgGrouped }}>
      <View style={styles.center}>
        {loader ?? <SwatchesLoader />}
        {label ? (
          <Text variant="caption" color="textMuted" style={styles.label}>
            {label}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  label: {
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
