/**
 * Paint Calculator — wall area minus openings (doors / windows),
 * divided by the standard coverage rate. Returns litres needed for
 * one coat. The user can adjust the coverage constant in
 * `../constants.ts`.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/v2/Text';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import { AREA, PAINT_COVERAGE_M2_PER_LITER } from '../constants';

export function PaintCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  // Inputs are in feet because that's what site teams measure in.
  const [length, setLength] = useState('20');
  const [height, setHeight] = useState('10');
  const [openings, setOpenings] = useState('21'); // ~one door + one window default

  const result = useMemo(() => {
    const L = parseNum(length) ?? 0;
    const H = parseNum(height) ?? 0;
    const O = parseNum(openings) ?? 0;
    const grossSqft = Math.max(L * H, 0);
    const netSqft = Math.max(grossSqft - O, 0);
    const netSqm = netSqft * AREA.sqftToSqm;
    const litresOneCoat = netSqm / PAINT_COVERAGE_M2_PER_LITER;
    const litresTwoCoats = litresOneCoat * 2;
    return {
      grossSqft,
      netSqft,
      netSqm,
      litresOneCoat,
      litresTwoCoats,
    };
  }, [length, height, openings]);

  const okInputs = result.netSqft > 0;

  return (
    <ToolModal visible={visible} onClose={onClose} title="Paint calculator">
      <Section title="Wall dimensions">
        <View style={styles.row2}>
          <View style={styles.col}>
            <NumberField
              label="Wall length"
              unit="ft"
              value={length}
              onChangeText={setLength}
              size="lg"
            />
          </View>
          <View style={styles.col}>
            <NumberField
              label="Wall height"
              unit="ft"
              value={height}
              onChangeText={setHeight}
              size="lg"
            />
          </View>
        </View>
        <NumberField
          label="Subtract doors / windows"
          unit="sq ft"
          value={openings}
          onChangeText={setOpenings}
          hint="Standard door ≈ 21 sq ft, window ≈ 12 sq ft."
        />
      </Section>

      <Section title="Paintable area">
        <ResultRow
          label="Net wall area"
          value={okInputs ? result.netSqft.toFixed(1) : ''}
          unit="sq ft"
          sub={
            okInputs
              ? `${result.netSqm.toFixed(2)} m² · gross ${result.grossSqft.toFixed(0)} sq ft`
              : undefined
          }
        />
      </Section>

      <Section title="Paint required">
        <ResultRow
          label="One coat"
          value={okInputs ? result.litresOneCoat.toFixed(2) : ''}
          unit="L"
          sub={`Coverage assumed: ${PAINT_COVERAGE_M2_PER_LITER} m² per litre.`}
        />
        <ResultRow
          label="Two coats (recommended)"
          value={okInputs ? result.litresTwoCoats.toFixed(2) : ''}
          unit="L"
          tone="primary"
        />
        <Text variant="caption1" color="secondary" style={styles.note}>
          Add ~10% extra for primer / textured walls / touch-ups. Adjust the
          coverage constant in <Text variant="caption1" color="tertiary">src/features/toolkit/constants.ts</Text> if your supplier
          quotes differently.
        </Text>
      </Section>
    </ToolModal>
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  note: {
    marginTop: 4,
    paddingHorizontal: 4,
    lineHeight: 17,
  },
});
