/**
 * Curtain / Drapery Fabric Calculator.
 *
 * Two ratios drive everything:
 *   • Fullness — finished_width = window_width × fullness_factor
 *     (1.5× tab top, 2× standard pleat, 2.5× pinch, 3× sheers)
 *   • Roll width — fabric is sold in fixed-width rolls (54″ standard
 *     in India), so multiple "drops" are stitched side-by-side to
 *     reach the finished width.
 *
 * Output: total metres of fabric to buy (length × number of drops).
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, space } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import {
  CURTAIN_FULLNESS,
  CURTAIN_HEM_ALLOWANCE_IN,
  CURTAIN_ROLL_WIDTH_IN_DEFAULT,
  LENGTH,
} from '../constants';

export function CurtainCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [windowW, setWindowW] = useState('6');
  const [drop, setDrop] = useState('8');
  const [fullness, setFullness] = useState<number>(2);
  const [rollW, setRollW] = useState(String(CURTAIN_ROLL_WIDTH_IN_DEFAULT));

  const result = useMemo(() => {
    const W = parseNum(windowW) ?? 0;
    const D = parseNum(drop) ?? 0;
    const Rw = parseNum(rollW) ?? 0;
    if (W <= 0 || D <= 0 || Rw <= 0 || fullness <= 0) return null;

    const finishedWidthFt = W * fullness;
    const rollWidthFt = Rw / 12;
    const dropsNeeded = Math.ceil(finishedWidthFt / rollWidthFt);
    const perDropFt = D + CURTAIN_HEM_ALLOWANCE_IN / 12;
    const totalFt = dropsNeeded * perDropFt;
    const totalMeters = (totalFt * LENGTH.ftToMm) / 1000; // ft → mm → m

    return {
      finishedWidthFt,
      dropsNeeded,
      perDropFt,
      totalFt,
      totalMeters,
    };
  }, [windowW, drop, fullness, rollW]);

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Curtain Fabric"
      eyebrow="SOFT FINISHES"
    >
      <Section title="Window">
        <View style={styles.row2}>
          <View style={styles.col}>
            <NumberField
              label="Window width"
              unit="ft"
              value={windowW}
              onChangeText={setWindowW}
              size="lg"
            />
          </View>
          <View style={styles.col}>
            <NumberField
              label="Drop length"
              unit="ft"
              value={drop}
              onChangeText={setDrop}
              size="lg"
              hint="Sill ≈ 4 ft, floor ≈ 8 ft, puddle ≈ 8.5 ft."
            />
          </View>
        </View>
      </Section>

      <Section title="Header style (fullness)">
        <View style={styles.fullnessRow}>
          {CURTAIN_FULLNESS.map((opt) => {
            const active = opt.value === fullness;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setFullness(opt.value)}
                style={[styles.fullnessChip, active ? styles.fullnessChipActive : null]}
              >
                <Text
                  style={
                    active
                      ? { ...styles.fullnessLabel, color: '#fff' }
                      : styles.fullnessLabel
                  }
                >
                  {opt.label}
                </Text>
                <Text
                  style={
                    active
                      ? { ...styles.fullnessDesc, color: '#fff' }
                      : styles.fullnessDesc
                  }
                  numberOfLines={2}
                >
                  {opt.desc}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Fabric">
        <NumberField
          label="Roll width"
          unit="in"
          value={rollW}
          onChangeText={setRollW}
          hint="Standard 54″ for most upholstery / drapery fabric in India."
        />
      </Section>

      <Section title="Fabric required">
        <ResultRow
          label="Drops needed"
          value={result ? String(result.dropsNeeded) : ''}
          unit={result?.dropsNeeded === 1 ? 'drop' : 'drops'}
          sub={
            result
              ? `Finished curtain width: ${result.finishedWidthFt.toFixed(1)} ft (window × ${fullness}×).`
              : undefined
          }
        />
        <ResultRow
          label="Total fabric"
          value={result ? result.totalMeters.toFixed(2) : ''}
          unit="m"
          tone="primary"
          sub={
            result
              ? `${result.dropsNeeded} drops × ${result.perDropFt.toFixed(1)} ft (incl. ${CURTAIN_HEM_ALLOWANCE_IN}″ hem) = ${result.totalFt.toFixed(1)} ft.`
              : undefined
          }
        />
        <Text style={styles.note}>
          Add 0.5 m extra per pair if the fabric has a horizontal pattern
          repeat that needs matching across the joins.
        </Text>
      </Section>
    </ToolModal>
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: space.sm },
  col: { flex: 1 },
  fullnessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fullnessChip: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    gap: 2,
  },
  fullnessChipActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  fullnessLabel: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '700',
    color: color.text,
    letterSpacing: -0.2,
  },
  fullnessDesc: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: color.textMuted,
    lineHeight: 14,
  },
  note: {
    fontSize: 11,
    color: color.textFaint,
    lineHeight: 16,
    marginTop: 4,
    fontFamily: fontFamily.sans,
  },
});
