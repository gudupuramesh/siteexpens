import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import type { SubmitIntent } from './submitProgressCatalog';
import { submitProgressFor } from './submitProgressCatalog';
import { SubmitLoaderPrimitives } from './SubmitLoaderPrimitives';
import { Text } from './Text';
import { color, radius, space } from '@/src/theme';

type SubmitProgressOverlayProps = {
  visible: boolean;
  intent: SubmitIntent;
  // Optional phase label from existing forms (e.g. Uploading 2 of 4...).
  phaseLabel?: string;
};

export function SubmitProgressOverlay({
  visible,
  intent,
  phaseLabel,
}: SubmitProgressOverlayProps) {
  const [lineIndex, setLineIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  const descriptor = useMemo(() => submitProgressFor(intent), [intent]);
  const activeLine = phaseLabel?.trim()
    ? phaseLabel.trim()
    : descriptor.creativeLines[lineIndex % descriptor.creativeLines.length];
  const activeIcon = descriptor.icons[lineIndex % descriptor.icons.length];

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLineIndex(0);
    const t = setInterval(() => setLineIndex((n) => n + 1), 1600);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const fadeIn = Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    fadeIn.start();
    return () => {
      fade.stopAnimation();
      fade.setValue(0);
    };
  }, [visible, fade]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: fade }]}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          {reduceMotion ? (
            <Feather name={activeIcon} size={20} color={color.primary} />
          ) : (
            <SubmitLoaderPrimitives descriptor={descriptor} reduceMotion={false} />
          )}
        </View>

        <Text variant="bodyStrong" color="text" align="center">
          {descriptor.title}
        </Text>
        <Text variant="caption" color="textMuted" align="center" style={styles.sub}>
          {activeLine}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.12)',
    zIndex: 20,
  },
  card: {
    width: '82%',
    maxWidth: 340,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    gap: space.xs,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.primarySoft,
    marginBottom: 2,
  },
  sub: {
    marginTop: 2,
  },
});
