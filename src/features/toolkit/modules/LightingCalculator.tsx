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

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

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
    <ToolModal visible={visible} onClose={onClose} title="Lighting estimator">
      {/* ── Room type picker ─────────────────────────────────────────── */}
      <Section title="Room type">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {LIGHTING_ROOMS.map((r) => (
            <RoomChip
              key={r.key}
              label={r.label}
              meta={`${r.lux} lux`}
              active={r.key === room.key}
              onPress={() => setRoom(r)}
            />
          ))}
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

function RoomChip({
  label,
  meta,
  active,
  onPress,
}: {
  label: string;
  meta: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active
            ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
            : t.colors.surface,
          borderRadius: t.radii.field,
          borderColor: active
            ? t.palette.blue.base + '33'
            : (t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text
        variant="footnote"
        style={{
          color: active ? t.palette.blue.base : t.colors.label,
          fontWeight: '700',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
      <Text
        variant="caption2"
        style={{
          color: active ? t.palette.blue.base : t.colors.secondary,
          letterSpacing: 0.2,
          marginTop: 1,
        }}
      >
        {meta}
      </Text>
    </Pressable>
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
  const t = useThemeV2();
  const recommended =
    COLOR_TEMPS.find((c) => c.k === recommendedK) ?? COLOR_TEMPS[1];

  return (
    <View style={{ gap: 10 }}>
      <View
        style={[
          styles.gradientWrap,
          {
            backgroundColor: t.colors.surface,
            borderRadius: t.radii.field,
            borderColor:
              t.mode === 'dark'
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(0,0,0,0.04)',
            borderWidth: t.hairline,
          },
        ]}
      >
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
        <View
          style={[
            styles.gradientLabels,
            { borderTopColor: t.colors.separator, borderTopWidth: t.hairline },
          ]}
        >
          {COLOR_TEMPS.map((c) => (
            <View key={c.k} style={styles.gradientLabelCol}>
              <Text
                variant="caption2"
                style={{
                  color: c.k === recommendedK ? t.palette.blue.base : t.colors.secondary,
                  fontWeight: c.k === recommendedK ? '700' : '600',
                  letterSpacing: 0.3,
                }}
              >
                {c.k}K
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View
        style={[
          styles.recommendCard,
          {
            backgroundColor:
              t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
            borderRadius: t.radii.field,
            borderColor: t.palette.blue.base + '33',
            borderWidth: t.hairline,
          },
        ]}
      >
        <Text
          variant="caption2"
          style={{
            color: t.palette.blue.base,
            letterSpacing: 0.5,
          }}
        >
          {`RECOMMENDED FOR ${roomLabel.toUpperCase()}`}
        </Text>
        <View style={styles.recommendRow}>
          <View
            style={[
              styles.recommendSwatch,
              {
                backgroundColor: kelvinToHex(recommendedK),
                borderRadius: 8,
                borderColor:
                  t.mode === 'dark'
                    ? 'rgba(255,255,255,0.10)'
                    : 'rgba(0,0,0,0.06)',
                borderWidth: t.hairline,
              },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text variant="callout" color="label" style={{ fontWeight: '700' }}>
              {recommended.k}K · {recommended.label}
            </Text>
            <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
              {recommended.use}
            </Text>
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
  row2: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  chipsRow: { gap: 8, paddingRight: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'flex-start',
    minWidth: 110,
  },

  gradientWrap: {
    overflow: 'hidden',
  },
  gradientRow: { flexDirection: 'row', height: 36 },
  gradientLabels: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  gradientLabelCol: {
    flex: 1,
    alignItems: 'center',
  },

  recommendCard: {
    padding: 12,
    gap: 8,
  },
  recommendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recommendSwatch: {
    width: 32,
    height: 32,
  },
});
