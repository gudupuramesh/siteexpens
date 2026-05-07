import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import type { SubmitProgressDescriptor } from './submitProgressCatalog';
import { color } from '@/src/theme';

type LoaderProps = { reduceMotion: boolean };

function BlueprintLoader({ reduceMotion }: LoaderProps) {
  const d = useRef(new Animated.Value(reduceMotion ? 0 : 80)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(
      Animated.timing(d, { toValue: 0, duration: 1400, easing: Easing.linear, useNativeDriver: false }),
    );
    anim.start();
    return () => anim.stop();
  }, [reduceMotion, d]);
  return (
    <Animated.View style={{ transform: [{ rotate: reduceMotion ? '0deg' : '0deg' }] }}>
      <Svg width={46} height={46} viewBox="0 0 24 24">
        <Rect x="2" y="2" width="20" height="20" stroke={color.text} strokeWidth="1" fill="none" strokeDasharray="80" strokeDashoffset={d as any} />
        <Line x1="2" y1="12" x2="22" y2="12" stroke={color.textMuted} strokeWidth="1" />
        <Line x1="12" y1="2" x2="12" y2="22" stroke={color.textMuted} strokeWidth="1" />
      </Svg>
    </Animated.View>
  );
}

function IsometricRoomLoader({ reduceMotion }: LoaderProps) {
  const p = useRef(new Animated.Value(reduceMotion ? 0 : 100)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const anim = Animated.loop(Animated.timing(p, { toValue: 0, duration: 1800, easing: Easing.linear, useNativeDriver: false }));
    anim.start();
    return () => anim.stop();
  }, [reduceMotion, p]);
  return (
    <Svg width={48} height={48} viewBox="0 0 24 24">
      <Path d="M12 2L2 7v10l10 5 10-5V7L12 2z" stroke={color.text} strokeWidth="1" fill="none" strokeDasharray="100" strokeDashoffset={p as any} />
      <Path d="M12 22V12M2 7l10 5 10-5" stroke={color.textMuted} strokeWidth="1" fill="none" />
    </Svg>
  );
}

function DraftingTraceLoader({ reduceMotion }: LoaderProps) {
  const tx = useRef(new Animated.Value(-14)).current;
  const ty = useRef(new Animated.Value(-14)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const seq = Animated.loop(
      Animated.sequence([
        Animated.parallel([Animated.timing(tx, { toValue: 14, duration: 350, useNativeDriver: true }), Animated.timing(ty, { toValue: -14, duration: 350, useNativeDriver: true })]),
        Animated.parallel([Animated.timing(tx, { toValue: 14, duration: 350, useNativeDriver: true }), Animated.timing(ty, { toValue: 14, duration: 350, useNativeDriver: true })]),
        Animated.parallel([Animated.timing(tx, { toValue: -14, duration: 350, useNativeDriver: true }), Animated.timing(ty, { toValue: 14, duration: 350, useNativeDriver: true })]),
        Animated.parallel([Animated.timing(tx, { toValue: -14, duration: 350, useNativeDriver: true }), Animated.timing(ty, { toValue: -14, duration: 350, useNativeDriver: true })]),
      ]),
    );
    seq.start();
    return () => seq.stop();
  }, [reduceMotion, tx, ty]);
  return (
    <View style={styles.traceWrap}>
      <View style={styles.traceH} />
      <View style={styles.traceV} />
      <Animated.View style={[styles.traceDot, !reduceMotion && { transform: [{ translateX: tx }, { translateY: ty }] }]} />
    </View>
  );
}

function ScaleTicksLoader({ reduceMotion }: LoaderProps) {
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 450, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [reduceMotion, pulse]);
  return (
    <View style={styles.tickRow}>
      {Array.from({ length: 8 }).map((_, i) => {
        const h = i % 4 === 0 ? 18 : 10;
        const op = reduceMotion
          ? 0.65
          : pulse.interpolate({
              inputRange: [0.3, 1],
              outputRange: [0.25 + i * 0.04, 0.7 + i * 0.03],
            });
        return (
          <Animated.View
            key={i}
            style={[
              styles.tick,
              { height: h, opacity: op },
            ]}
          />
        );
      })}
    </View>
  );
}

function ModularJointLoader({ reduceMotion }: LoaderProps) {
  const left = useRef(new Animated.Value(-10)).current;
  const right = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(left, { toValue: -1, duration: 450, useNativeDriver: true }),
          Animated.timing(right, { toValue: 1, duration: 450, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(left, { toValue: -10, duration: 450, useNativeDriver: true }),
          Animated.timing(right, { toValue: 10, duration: 450, useNativeDriver: true }),
        ]),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [reduceMotion, left, right]);
  return (
    <View style={styles.modWrap}>
      <Animated.View style={[styles.modSq, !reduceMotion && { transform: [{ translateX: left }] }]} />
      <Animated.View style={[styles.modSq, !reduceMotion && { transform: [{ translateX: right }] }]} />
    </View>
  );
}

function MaterialStackLoader({ reduceMotion }: LoaderProps) {
  return (
    <View style={styles.stackWrap}>
      {[0, 1, 2].map((i) => {
        const v = useRef(new Animated.Value(0)).current;
        useEffect(() => {
          if (reduceMotion) return;
          const a = Animated.loop(
            Animated.sequence([
              Animated.delay(i * 220),
              Animated.timing(v, { toValue: 1, duration: 750, useNativeDriver: true }),
              Animated.timing(v, { toValue: 0, duration: 750, useNativeDriver: true }),
            ]),
          );
          a.start();
          return () => a.stop();
        }, [reduceMotion, v, i]);
        return (
          <Animated.View
            key={i}
            style={[
              styles.stackCard,
              {
                zIndex: 5 - i,
                opacity: reduceMotion ? 0.8 - i * 0.2 : v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
                transform: [
                  { translateX: reduceMotion ? i * 3 : v.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
                  { translateY: reduceMotion ? -i * 3 : v.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function LaserCrossLoader({ reduceMotion }: LoaderProps) {
  const x = useRef(new Animated.Value(-18)).current;
  const y = useRef(new Animated.Value(-18)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(x, { toValue: 18, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(x, { toValue: -18, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(y, { toValue: 18, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(y, { toValue: -18, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [reduceMotion, x, y]);
  return (
    <View style={styles.laserWrap}>
      <Animated.View style={[styles.laserH, !reduceMotion && { transform: [{ translateY: y }] }]} />
      <Animated.View style={[styles.laserV, !reduceMotion && { transform: [{ translateX: x }] }]} />
      <View style={styles.laserDot} />
    </View>
  );
}

function PlumbBobLoader({ reduceMotion }: LoaderProps) {
  const rot = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(rot, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(rot, { toValue: -1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [reduceMotion, rot]);
  const deg = rot.interpolate({ inputRange: [-1, 1], outputRange: ['-10deg', '10deg'] });
  return (
    <Animated.View style={[styles.plumbWrap, !reduceMotion && { transform: [{ rotate: deg }] }]}>
      <View style={styles.plumbLine} />
      <View style={styles.plumbTip} />
    </Animated.View>
  );
}

function FrameAssemblerLoader({ reduceMotion }: LoaderProps) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(p, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [reduceMotion, p]);
  return (
    <View style={styles.frameWrap}>
      <Animated.View style={[styles.frameCornerTL, !reduceMotion && { transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }, { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }]} />
      <Animated.View style={[styles.frameCornerBR, !reduceMotion && { transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }, { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]} />
    </View>
  );
}

export function SubmitLoaderPrimitives({
  descriptor,
  reduceMotion,
}: {
  descriptor: SubmitProgressDescriptor;
  reduceMotion: boolean;
}) {
  switch (descriptor.loaderKind) {
    case 'isometricRoom':
      return <IsometricRoomLoader reduceMotion={reduceMotion} />;
    case 'draftingTrace':
      return <DraftingTraceLoader reduceMotion={reduceMotion} />;
    case 'scaleTicks':
      return <ScaleTicksLoader reduceMotion={reduceMotion} />;
    case 'modularJoint':
      return <ModularJointLoader reduceMotion={reduceMotion} />;
    case 'materialStack':
      return <MaterialStackLoader reduceMotion={reduceMotion} />;
    case 'laserCross':
      return <LaserCrossLoader reduceMotion={reduceMotion} />;
    case 'plumbBob':
      return <PlumbBobLoader reduceMotion={reduceMotion} />;
    case 'frameAssembler':
      return <FrameAssemblerLoader reduceMotion={reduceMotion} />;
    case 'blueprint':
    default:
      return <BlueprintLoader reduceMotion={reduceMotion} />;
  }
}

const styles = StyleSheet.create({
  traceWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  traceH: { position: 'absolute', width: 40, height: 1, backgroundColor: color.borderStrong },
  traceV: { position: 'absolute', width: 1, height: 40, backgroundColor: color.borderStrong },
  traceDot: { width: 4, height: 4, borderRadius: 3, backgroundColor: color.text },
  tickRow: { height: 22, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  tick: { width: 1, backgroundColor: color.text },
  modWrap: { width: 48, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  modSq: { width: 14, height: 14, borderWidth: 1, borderColor: color.text, marginHorizontal: 1 },
  stackWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stackCard: { position: 'absolute', width: 22, height: 22, borderWidth: 1, borderColor: color.text, backgroundColor: color.bg },
  laserWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  laserH: { position: 'absolute', width: 42, height: 1, backgroundColor: 'rgba(220,38,38,0.4)' },
  laserV: { position: 'absolute', width: 1, height: 42, backgroundColor: 'rgba(220,38,38,0.4)' },
  laserDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#dc2626' },
  plumbWrap: { width: 22, alignItems: 'center', justifyContent: 'center' },
  plumbLine: { width: 1, height: 32, backgroundColor: color.textFaint },
  plumbTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: color.text,
  },
  frameWrap: { width: 42, height: 42, borderWidth: 1, borderStyle: 'dashed', borderColor: color.borderStrong },
  frameCornerTL: { position: 'absolute', top: 0, left: 0, width: 14, height: 14, borderTopWidth: 2, borderLeftWidth: 2, borderColor: color.text },
  frameCornerBR: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderBottomWidth: 2, borderRightWidth: 2, borderColor: color.text },
});
