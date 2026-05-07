/**
 * ImageViewer — single point for full-screen image preview across the app.
 *
 * Wraps `react-native-image-viewing` (pure JS, gesture-handler based,
 * no native module). Supports:
 *   - Single image OR array (with swipe between them)
 *   - Pinch to zoom + pan
 *   - Tap close button (top-right) or swipe down to dismiss
 *
 * Use it any time we render an uploaded photo and want the user to
 * be able to see it big + zoomed in:
 *
 *   const [open, setOpen] = useState(false);
 *   ...
 *   <Pressable onPress={() => setOpen(true)}>
 *     <Image source={{ uri }} ... />
 *   </Pressable>
 *   <ImageViewer
 *     images={[uri]}
 *     visible={open}
 *     onClose={() => setOpen(false)}
 *   />
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import RNImageViewing from 'react-native-image-viewing';

export type ImageViewerProps = {
  /** Image URLs to show. The viewer swipes between them in order. */
  images: string[];
  /** Index of the image to open first. Default 0. */
  index?: number;
  visible: boolean;
  onClose: () => void;
};

export function ImageViewer({
  images,
  index = 0,
  visible,
  onClose,
}: ImageViewerProps) {
  // The library expects `{ uri }[]`. Memoised so identity is stable
  // across renders — otherwise the viewer thinks the source changed
  // and resets zoom level mid-pinch.
  const imageObjects = useMemo(
    () => images.map((uri) => ({ uri })),
    [images],
  );

  return (
    <RNImageViewing
      images={imageObjects}
      imageIndex={Math.min(Math.max(0, index), Math.max(0, images.length - 1))}
      visible={visible}
      onRequestClose={onClose}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      backgroundColor="rgba(0,0,0,0.96)"
      // The library doesn't ship a close button, so we provide one in
      // the top-right via HeaderComponent. Bigger hit-target than
      // tapping & holding to close, and friendlier on Android where
      // swipe-down can collide with system gestures.
      HeaderComponent={() => (
        <View style={styles.headerWrap} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            hitSlop={20}
            style={styles.closeBtn}
            accessibilityLabel="Close preview"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 50,
    paddingHorizontal: 18,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
