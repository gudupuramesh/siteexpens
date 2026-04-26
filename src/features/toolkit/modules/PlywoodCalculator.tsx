/**
 * Plywood / Laminate Sheet Calculator — total face area in sq ft,
 * divided by a standard 8×4 ft sheet (32 sq ft). Returns sheets to
 * order, plus a 10% wastage buffer (cuts, grain matching).
 */
import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import { PLYWOOD_SHEET_AREA_SQFT, PLYWOOD_SHEET_FT } from '../constants';

const WASTAGE = 0.10;

export function PlywoodCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [area, setArea] = useState('120');

  const result = useMemo(() => {
    const a = parseNum(area) ?? 0;
    if (a <= 0) return { exact: 0, withWastage: 0, used: 0, leftover: 0 };
    const exact = Math.ceil(a / PLYWOOD_SHEET_AREA_SQFT);
    const withWastage = Math.ceil(a * (1 + WASTAGE) / PLYWOOD_SHEET_AREA_SQFT);
    const totalCovered = withWastage * PLYWOOD_SHEET_AREA_SQFT;
    return {
      exact,
      withWastage,
      used: a,
      leftover: Math.max(0, totalCovered - a),
    };
  }, [area]);

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Plywood / Laminate"
      eyebrow="ESTIMATOR"
    >
      <Section title="Inputs">
        <NumberField
          label="Total face area"
          unit="sq ft"
          value={area}
          onChangeText={setArea}
          hint={`Sum every cabinet shutter / wardrobe panel / shelf face. Standard sheet: ${PLYWOOD_SHEET_FT.length} × ${PLYWOOD_SHEET_FT.width} ft = ${PLYWOOD_SHEET_AREA_SQFT} sq ft.`}
          size="lg"
        />
      </Section>

      <Section title="Sheets needed">
        <ResultRow
          label="Exact sheets"
          value={result.exact ? String(result.exact) : ''}
          unit="sheets"
        />
        <ResultRow
          label={`Order quantity (incl. ${Math.round(WASTAGE * 100)}% wastage)`}
          value={result.withWastage ? String(result.withWastage) : ''}
          unit="sheets"
          tone="primary"
          sub={
            result.withWastage
              ? `Approx. ${result.leftover.toFixed(1)} sq ft leftover after fitting.`
              : undefined
          }
        />
        <Text style={styles.note}>
          For laminate, order one extra sheet if any face is wider than{' '}
          {PLYWOOD_SHEET_FT.width} ft — those panels need full-sheet
          coverage with no joints.
        </Text>
      </Section>
    </ToolModal>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: 11,
    color: color.textFaint,
    fontFamily: fontFamily.sans,
    lineHeight: 16,
    marginTop: 4,
  },
});
