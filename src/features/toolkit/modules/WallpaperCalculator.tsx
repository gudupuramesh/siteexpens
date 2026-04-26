/**
 * Wallpaper Calculator — accounts for pattern repeat (the killer
 * variable that designers forget). Pattern matching means each strip
 * needs extra height equal to the pattern repeat distance, so a roll
 * yields fewer strips than naïve roll_length / wall_height suggests.
 *
 * Formula:
 *   strip_height_ft = wall_height_ft + pattern_repeat_in / 12
 *   strips_per_roll = floor(roll_length_ft / strip_height_ft)
 *   strips_needed   = ceil(wall_width_ft / (roll_width_in / 12))
 *   rolls_needed    = ceil(strips_needed / strips_per_roll)
 *
 * We add +1 roll as a safety buffer (industry rule of thumb).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, space } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import { WALLPAPER_ROLL_DEFAULT } from '../constants';

export function WallpaperCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [wallW, setWallW] = useState('20');
  const [wallH, setWallH] = useState('9');
  const [rollWIn, setRollWIn] = useState(String(WALLPAPER_ROLL_DEFAULT.widthIn));
  const [rollLFt, setRollLFt] = useState(String(WALLPAPER_ROLL_DEFAULT.lengthFt));
  const [patternIn, setPatternIn] = useState('0');

  const result = useMemo(() => {
    const W = parseNum(wallW) ?? 0;
    const H = parseNum(wallH) ?? 0;
    const rW = parseNum(rollWIn) ?? 0;
    const rL = parseNum(rollLFt) ?? 0;
    const P = parseNum(patternIn) ?? 0;

    if (W <= 0 || H <= 0 || rW <= 0 || rL <= 0) return null;

    const stripHeightFt = H + P / 12;
    if (stripHeightFt > rL) {
      return {
        warn: `Roll length (${rL} ft) is shorter than one strip (${stripHeightFt.toFixed(1)} ft after pattern repeat). Choose a longer roll.`,
      } as const;
    }

    const stripsPerRoll = Math.floor(rL / stripHeightFt);
    const rollWidthFt = rW / 12;
    const stripsNeeded = Math.ceil(W / rollWidthFt);
    const rollsExact = stripsPerRoll > 0 ? Math.ceil(stripsNeeded / stripsPerRoll) : 0;
    const rollsRecommended = rollsExact + 1; // +1 safety buffer

    return {
      stripHeightFt,
      stripsPerRoll,
      stripsNeeded,
      rollsExact,
      rollsRecommended,
      wasteFt: stripsPerRoll * stripHeightFt < rL ? rL - stripsPerRoll * stripHeightFt : 0,
    } as const;
  }, [wallW, wallH, rollWIn, rollLFt, patternIn]);

  const isWarn = result && 'warn' in result;
  const ok = result && !('warn' in result);

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Wallpaper Calculator"
      eyebrow="SOFT FINISHES"
    >
      <Section title="Wall">
        <View style={styles.row2}>
          <View style={styles.col}>
            <NumberField
              label="Wall width"
              unit="ft"
              value={wallW}
              onChangeText={setWallW}
              size="lg"
            />
          </View>
          <View style={styles.col}>
            <NumberField
              label="Wall height"
              unit="ft"
              value={wallH}
              onChangeText={setWallH}
              size="lg"
            />
          </View>
        </View>
      </Section>

      <Section title="Roll specifications">
        <View style={styles.row2}>
          <View style={styles.col}>
            <NumberField
              label="Roll width"
              unit="in"
              value={rollWIn}
              onChangeText={setRollWIn}
              hint="Standard 20.5″ ≈ 53 cm."
            />
          </View>
          <View style={styles.col}>
            <NumberField
              label="Roll length"
              unit="ft"
              value={rollLFt}
              onChangeText={setRollLFt}
              hint="Standard 33 ft ≈ 10 m."
            />
          </View>
        </View>
        <NumberField
          label="Pattern repeat"
          unit="in"
          value={patternIn}
          onChangeText={setPatternIn}
          hint="Distance the design repeats vertically. Plain wallpaper = 0. Bold prints often 12–24″."
        />
      </Section>

      <Section title="Order quantity">
        {isWarn && result && 'warn' in result ? (
          <Text style={styles.warn}>{result.warn}</Text>
        ) : ok && result && !('warn' in result) ? (
          <>
            <ResultRow
              label="Exact rolls"
              value={String(result.rollsExact)}
              unit={result.rollsExact === 1 ? 'roll' : 'rolls'}
              sub={`${result.stripsNeeded} strips needed · ${result.stripsPerRoll} strips per roll · ${result.stripHeightFt.toFixed(1)} ft per strip.`}
            />
            <ResultRow
              label="Order (incl. +1 safety roll)"
              value={String(result.rollsRecommended)}
              unit={result.rollsRecommended === 1 ? 'roll' : 'rolls'}
              tone="primary"
              sub="One extra roll covers misprints, mis-cuts, and future patching."
            />
          </>
        ) : (
          <Text style={styles.warn}>
            Enter wall and roll dimensions to compute.
          </Text>
        )}
      </Section>
    </ToolModal>
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: space.sm },
  col: { flex: 1 },
  warn: {
    fontSize: 13,
    color: color.warning,
    fontFamily: fontFamily.sans,
    padding: space.sm,
    backgroundColor: color.warningSoft,
    borderRadius: 8,
    lineHeight: 18,
  },
});
