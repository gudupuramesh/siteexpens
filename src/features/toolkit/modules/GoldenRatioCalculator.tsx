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
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

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
  const [total, setTotal] = useState('120');
  const [unit, setUnit] = useState('in');
  const t = useThemeV2();

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
    <ToolModal visible={visible} onClose={onClose} title="Proportion calculator">
      <Section title="Total dimension">
        <NumberField
          label="Wall length / ceiling height"
          unit={unit}
          value={total}
          onChangeText={setTotal}
          size="lg"
        />
        <UnitToggle value={unit} onChange={setUnit} />
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
          colors={[
            t.palette.blue.base,
            t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
            t.colors.fill3,
          ]}
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
          colors={[t.colors.fill3, t.palette.blue.base]}
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
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.unitRow,
        {
          backgroundColor: t.colors.fill3,
          borderRadius: t.radii.field,
          padding: 3,
        },
      ]}
    >
      {opts.map((o) => {
        const active = value === o;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={({ pressed }) => [
              styles.unitBtn,
              {
                backgroundColor: active ? t.colors.surface : 'transparent',
                borderRadius: t.radii.field - 2,
                ...(active ? t.shadows.resting : null),
              },
              pressed && !active && { opacity: 0.7 },
            ]}
          >
            <Text
              variant="footnote"
              color={active ? 'label' : 'secondary'}
              style={{ fontWeight: active ? '700' : '500' }}
            >
              {o}
            </Text>
          </Pressable>
        );
      })}
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
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.bar,
        {
          borderColor:
            t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
          borderRadius: 8,
        },
      ]}
    >
      {fractions.map((f, i) => (
        <View
          key={i}
          style={{ flex: f, backgroundColor: colors[i] ?? t.colors.surface }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  unitRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 0,
  },
  unitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    height: 28,
    overflow: 'hidden',
    marginTop: 4,
  },
});
