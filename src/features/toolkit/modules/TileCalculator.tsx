/**
 * Tile Calculator — given a floor area and a tile size, returns the
 * exact tile count plus the recommended order quantity (with wastage).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, space } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import { TILE_WASTAGE_PCT } from '../constants';

export function TileCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [floorArea, setFloorArea] = useState('200');   // sq ft
  const [tileLen, setTileLen] = useState('2');         // ft
  const [tileWid, setTileWid] = useState('2');         // ft

  // Memoised so we don't recompute on unrelated re-renders.
  const result = useMemo(() => {
    const area = parseNum(floorArea) ?? 0;
    const len = parseNum(tileLen) ?? 0;
    const wid = parseNum(tileWid) ?? 0;
    const tileArea = len * wid;
    if (area <= 0 || tileArea <= 0) {
      return { exact: 0, withWastage: 0, tileArea: 0 };
    }
    const exact = Math.ceil(area / tileArea);
    const withWastage = Math.ceil(exact * (1 + TILE_WASTAGE_PCT));
    return { exact, withWastage, tileArea };
  }, [floorArea, tileLen, tileWid]);

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Tile Calculator"
      eyebrow="ESTIMATOR"
    >
      <Section title="Inputs">
        <NumberField
          label="Total Floor Area"
          unit="sq ft"
          value={floorArea}
          onChangeText={setFloorArea}
          size="lg"
        />
        <View style={styles.row2}>
          <View style={styles.col}>
            <NumberField
              label="Tile Length"
              unit="ft"
              value={tileLen}
              onChangeText={setTileLen}
            />
          </View>
          <View style={styles.col}>
            <NumberField
              label="Tile Width"
              unit="ft"
              value={tileWid}
              onChangeText={setTileWid}
            />
          </View>
        </View>
        <Text style={styles.helper}>
          Common sizes: 2×2, 2×4, 1×1, 1.5×1.5 ft. Tile area:{' '}
          {result.tileArea ? result.tileArea.toFixed(2) : '—'} sq ft.
        </Text>
      </Section>

      <Section title="Results">
        <ResultRow
          label="Exact tiles needed"
          value={result.exact ? String(result.exact) : ''}
          unit="tiles"
        />
        <ResultRow
          label={`Order quantity (incl. ${Math.round(TILE_WASTAGE_PCT * 100)}% wastage)`}
          value={result.withWastage ? String(result.withWastage) : ''}
          unit="tiles"
          tone="primary"
          sub="Covers cuts, breakage and future patching."
        />
      </Section>
    </ToolModal>
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', gap: space.sm },
  col: { flex: 1 },
  helper: {
    fontSize: 11,
    color: color.textFaint,
    fontFamily: fontFamily.sans,
    marginTop: 4,
  },
});
