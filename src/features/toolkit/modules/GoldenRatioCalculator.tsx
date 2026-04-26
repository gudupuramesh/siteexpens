/**
 * Proportion Calculator — splits a length using two rules designers
 * actually use:
 *
 *   • 60 / 30 / 10  — the classic interior colour-block split, also
 *                     handy for paneling, wainscoting heights, and
 *                     dado/picture/cornice band layouts.
 *   • Golden ratio  — small : large = 1 : φ. Used for vertical
 *                     proportioning, wall paneling pairs, archway
 *                     placement.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, space } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import { PHI } from '../constants';

export function GoldenRatioCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [total, setTotal] = useState('120'); // arbitrary unit (in / cm / mm)
  const [unit, setUnit] = useState('in');

  const result = useMemo(() => {
    const T = parseNum(total) ?? 0;
    if (T <= 0) return null;
    return {
      sixty: T * 0.6,
      thirty: T * 0.3,
      ten: T * 0.1,
      goldenSmall: T / (1 + PHI),
      goldenLarge: T - T / (1 + PHI),
    };
  }, [total]);

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Proportion Calculator"
      eyebrow="LAYOUT"
    >
      <Section title="Total dimension">
        <View style={styles.row}>
          <View style={{ flex: 3 }}>
            <NumberField
              label="Wall length / ceiling height"
              value={total}
              onChangeText={setTotal}
              size="lg"
            />
          </View>
          <View style={{ flex: 1 }}>
            <UnitToggle value={unit} onChange={setUnit} />
          </View>
        </View>
      </Section>

      <Section title="60 / 30 / 10 split">
        <ResultRow
          label="Dominant zone (60%)"
          value={result ? result.sixty.toFixed(2) : ''}
          unit={unit}
          tone="primary"
        />
        <ResultRow
          label="Secondary zone (30%)"
          value={result ? result.thirty.toFixed(2) : ''}
          unit={unit}
        />
        <ResultRow
          label="Accent zone (10%)"
          value={result ? result.ten.toFixed(2) : ''}
          unit={unit}
        />
        <ProportionBar
          fractions={[0.6, 0.3, 0.1]}
          colors={[color.primary, color.primarySoft, color.surfaceAlt]}
        />
      </Section>

      <Section title="Golden ratio (1 : φ)">
        <ResultRow
          label="Smaller part"
          value={result ? result.goldenSmall.toFixed(2) : ''}
          unit={unit}
          sub={`φ ≈ ${PHI.toFixed(6)}. Used for wall paneling, archways, mantel placement.`}
        />
        <ResultRow
          label="Larger part"
          value={result ? result.goldenLarge.toFixed(2) : ''}
          unit={unit}
          tone="primary"
        />
        <ProportionBar
          fractions={[1 / (1 + PHI), PHI / (1 + PHI)]}
          colors={[color.surfaceAlt, color.primary]}
        />
      </Section>
    </ToolModal>
  );
}

function UnitToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const opts = ['in', 'ft', 'cm', 'mm', 'm'];
  return (
    <View style={styles.unitWrap}>
      <Text style={styles.label}>UNIT</Text>
      <View style={styles.unitRow}>
        {opts.map((o) => (
          <Text
            key={o}
            onPress={() => onChange(o)}
            style={value === o ? { ...styles.unitBtn, ...styles.unitBtnActive } : styles.unitBtn}
          >
            {o}
          </Text>
        ))}
      </View>
    </View>
  );
}

function ProportionBar({
  fractions,
  colors,
}: {
  fractions: number[];
  colors: string[];
}) {
  return (
    <View style={styles.bar}>
      {fractions.map((f, i) => (
        <View
          key={i}
          style={{ flex: f, backgroundColor: colors[i] ?? color.surface }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  unitWrap: { gap: 6 },
  label: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    fontWeight: '600',
    color: color.textMuted,
    letterSpacing: 1.2,
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  unitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '600',
    color: color.textMuted,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  unitBtnActive: {
    backgroundColor: color.primary,
    color: '#fff',
    borderColor: color.primary,
  },
  bar: {
    flexDirection: 'row',
    height: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    overflow: 'hidden',
    marginTop: 4,
  },
});
