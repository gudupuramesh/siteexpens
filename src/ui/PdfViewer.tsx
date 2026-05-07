/**
 * PdfViewer — full-screen in-app PDF preview.
 *
 * RN doesn't have a built-in PDF renderer. Two cross-platform paths
 * worth considering:
 *   - `react-native-pdf` — native module, requires dev-client rebuild,
 *     ~3MB to bundle, gives best UX (true pinch-zoom, page jump).
 *   - WebView + Google Docs viewer URL trick — no extra deps (we
 *     already use react-native-webview), works for any public URL,
 *     decent UX (pinch-zoom + scroll work natively), no rebuild.
 *
 * We go with the WebView path so this ships immediately. If the team
 * later wants offline or password-protected PDFs, swap in
 * `react-native-pdf` behind the same `<PdfViewer />` interface.
 *
 * Caveat: the Google Docs viewer requires the PDF URL to be publicly
 * fetchable. Our R2 public-dev URL satisfies that — the bucket's
 * Public Development URL was enabled as part of the R2 setup.
 */
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { Text } from './Text';
import { color, fontFamily, screenInset } from '@/src/theme';

export type PdfViewerProps = {
  /** Public PDF URL. */
  url: string;
  /** Filename / label shown in the top bar. */
  title?: string;
  visible: boolean;
  onClose: () => void;
};

export function PdfViewer({ url, title, visible, onClose }: PdfViewerProps) {
  // Wrap the source URL in Google Docs viewer's embedded mode. Works
  // on iOS + Android WebView, no plugin required. The inner viewer
  // handles its own pinch / pan / page-jump UI.
  const viewerUri = useMemo(() => {
    if (!url) return '';
    const enc = encodeURIComponent(url);
    return `https://docs.google.com/viewer?url=${enc}&embedded=true`;
  }, [url]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color={color.textMuted} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>PDF</Text>
            <Text variant="bodyStrong" numberOfLines={1}>
              {title || 'Document'}
            </Text>
          </View>
          <View style={styles.headerBtn} />
        </View>

        {url ? (
          <WebView
            source={{ uri: viewerUri }}
            style={styles.web}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color={color.primary} />
                <Text variant="meta" color="textMuted" style={{ marginTop: 6 }}>
                  Loading PDF…
                </Text>
              </View>
            )}
            // Block any navigation away from the viewer host; users
            // shouldn't accidentally land on a Google sign-in page.
            onShouldStartLoadWithRequest={(req) => {
              return req.url.startsWith('https://docs.google.com/viewer')
                || req.url === viewerUri
                || req.url === url;
            }}
          />
        ) : (
          <View style={styles.loading}>
            <Text variant="meta" color="textMuted">No PDF URL provided.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenInset,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.borderStrong,
    gap: 8,
  },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, alignItems: 'center' },
  eyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.textFaint,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  web: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
