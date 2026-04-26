/**
 * Lighting Estimator — three connected tools in one screen:
 *
 *   1. "How much light"      — room L×W + room type → total lumens
 *   2. Downlight quantity    — total lumens / per-bulb lumens → fixtures
 *   3. Colour temperature    — visual scale 2700K → 6500K with use cases
 *
 * Picking a room type also auto-highlights its recommended Kelvin band
 * on the colour-temperature guide so designers see all three answers
 * (lumens, fixtures, K) in a single glance.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, space } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import {
  AREA,
  COLOR_TEMPS,
  LIGHTING_ROOMS,
  type LightingRoom,
} from '../constants';

const DEFAULT_BULB_LUMENS = 800; // standard 9 W LED downlight

export function LightingCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [room, setRoom] = useState<LightingRoom>(LIGHTING_ROOMS[2]); // Kitchen
  const [length, setLength] = useState('12');
  const [width, setWidth] = useState('10');
  const [bulbLumens, setBulbLumens] = useState(String(DEFAULT_BULB_LUMENS));

  const result = useMemo(() => {
    const L = parseNum(length) ?? 0;
    const W = parseNum(width) ?? 0;
    const B = parseNum(bulbLumens) ?? 0;
    if (L <= 0 || W <= 0) return null;
    const areaSqft = L * W;
    const areaSqm = areaSqft * AREA.sqftToSqm;
    const totalLumens = areaSqm * room.lux;
    const fixtures = B > 0 ? Math.ceil(totalLumens / B) : 0;
    return { areaSqft, areaSqm, totalLumens, fixtures };
  }, [length, width, bulbLumens, room]);

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Lighting Estimator"
      eyebrow="LUMENS & LAYOUT"
    >
      {/* ── Room type picker ─────────────────────────────────────────── */}
      <Section title="Room type">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {LIGHTING_ROOMS.map((r) => {
            const active = r.key === room.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setRoom(r)}
                style={[styles.chip, active ? styles.chipActive : null]}
              >
                <Text
                  style={
                    active
                      ? { ...styles.chipLabel, ...styles.chipLabelActive }
                      : styles.chipLabel
                  }
                >
                  {r.label.toUpperCase()}
                </Text>
                <Text
                  style={
                    active
                      ? { ...styles.chipMeta, color: '#fff' }
                      : styles.chipMeta
                  }
                >
                  {r.lux} lux
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Section>

      {/* ── Section 1: how much light ────────────────────────────────── */}
      <Section title="Room dimensions">
        <View style={styles.row2}>
          <View style={styles.col}>
            <NumberField
              label="Length"
              unit="ft"
              value={length}
              onChangeText={setLength}
              size="lg"
            />
          </View>
          <View style={styles.col}>
            <NumberField
              label="Width"
              unit="ft"
              value={width}
              onChangeText={setWidth}
              size="lg"
            />
          </View>
        </View>
        <ResultRow
          label={`Total lumens needed (${room.label})`}
          value={result ? Math.round(result.totalLumens).toLocaleString('en-IN') : ''}
          unit="lm"
          tone="primary"
          sub={
            result
              ? `${result.areaSqft.toFixed(0)} sq ft (${result.areaSqm.toFixed(2)} m²) × ${room.lux} lux target.`
              : 'Enter room dimensions above.'
          }
        />
      </Section>

      {/* ── Section 2: fixture count ─────────────────────────────────── */}
      <Section title="Downlight quantity">
        <NumberField
          label="Per-bulb output"
          unit="lm"
          value={bulbLumens}
          onChangeText={setBulbLumens}
          hint="Standard 9 W LED ≈ 800 lm. 12 W ≈ 1100 lm. 15 W ≈ 1400 lm."
        />
        <ResultRow
          label="Fixtures required"
          value={result && result.fixtures ? String(result.fixtures) : ''}
          unit={result?.fixtures === 1 ? 'light' : 'lights'}
          sub="Round up — fewer fixtures means dim corners."
        />
      </Section>

      {/* ── Section 3: colour temperature guide ──────────────────────── */}
      <Section title="Colour temperature">
        <ColorTempGuide recommendedK={room.k} roomLabel={room.label} />
      </Section>
    </ToolModal>
  );
}

/** Visual guide for Kelvin colour temperature. Highlights the band that
 *  matches the currently-selected room. Renders six chips on a gradient
 *  background that goes from warm orange (2700K) to cool blue (6500K). */
function ColorTempGuide({
  recommendedK,
  roomLabel,
}: {
  recommendedK: number;
  roomLabel: string;
}) {
  // Find the recommendation entry to surface the use case copy.
  const recommended =
    COLOR_TEMPS.find((c) => c.k === recommendedK) ?? COLOR_TEMPS[1];

  return (
    <View style={{ gap: space.sm }}>
      {/* The gradient bar — emulated with a row of coloured strips so we
          don't pull in expo-linear-gradient just for this. */}
      <View style={styles.gradientWrap}>
        <View style={styles.gradientRow}>
          {COLOR_TEMPS.map((c, i) => (
            <View
              key={c.k}
              style={{
                flex: 1,
                backgroundColor: kelvinToHex(c.k),
                borderRightWidth: i < COLOR_TEMPS.length - 1 ? 1 : 0,
                borderRightColor: 'rgba(0,0,0,0.05)',
              }}
            />
          ))}
        </View>
        <View style={styles.gradientLabels}>
          {COLOR_TEMPS.map((c) => (
            <View key={c.k} style={styles.gradientLabelCol}>
              <Text
                style={
                  c.k === recommendedK
                    ? { ...styles.gradientK, ...styles.gradientKActive }
                    : styles.gradientK
                }
              >
                {c.k}K
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.recommendCard}>
        <Text style={styles.recommendEyebrow}>
          RECOMMENDED FOR {roomLabel.toUpperCase()}
        </Text>
        <View style={styles.recommendRow}>
          <View
            style={[
              styles.recommendSwatch,
              { backgroundColor: kelvinToHex(recommendedK) },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.recommendTitle}>
              {recommended.k}K · {recommended.label}
            </Text>
            <Text style={styles.recommendUse}>{recommended.use}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Approximate Kelvin → hex mapping for the visual guide. Hand-tuned to
 *  read warm-amber → neutral-white → cool-blue across the 2700–6500K
 *  range. Not photometrically accurate; just a visual cue. */
function kelvinToHex(k: number): string {
  const map: Record<number, string> = {
    2700: '#FFB870',
    3000: '#FFD09A',
    3500: '#FFE4B8',
    4000: '#FFF4D9',
    5000: '#F2F4FF',
    6500: '#CDDDFF',
  };
  return map[k] ?? '#FFFFFF';
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: space.sm },
  col: { flex: 1 },

  chipsRow: { gap: 8, paddingRight: space.md },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    alignItems: 'flex-start',
    gap: 2,
    minWidth: 100,
  },
  chipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  chipLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '700',
    color: color.text,
    letterSpacing: 0.8,
  },
  chipLabelActive: { color: '#fff' },
  chipMeta: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textMuted,
    letterSpacing: 0.4,
  },

  gradientWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  gradientRow: { flexDirection: 'row', height: 34 },
  gradientLabels: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderStrong,
  },
  gradientLabelCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  gradientK: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '600',
    color: color.textMuted,
    letterSpacing: 0.4,
  },
  gradientKActive: {
    color: color.primary,
    fontSize: 10,
  },

  recommendCard: {
    backgroundColor: color.primarySoft,
    borderRadius: radius.md,
    padding: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.primary,
    gap: 6,
  },
  recommendEyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    fontWeight: '700',
    color: color.primary,
    letterSpacing: 1.2,
  },
  recommendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recommendSwatch: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  recommendTitle: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '700',
    color: color.text,
  },
  recommendUse: {
    fontSize: 12,
    color: color.textMuted,
    marginTop: 2,
  },
});
