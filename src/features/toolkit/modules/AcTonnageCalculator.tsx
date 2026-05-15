/**
 * AC Tonnage Calculator — Indian residential split-AC sizing.
 *
 * Standard thumb rule (HVAC trade in India):
 *   base_tons = (room volume in cubic feet) / 1000
 *
 * Then apply multipliers:
 *   × 1.10 if the room is on the top floor (sun beats the slab)
 *   × 1.15 if the room has heavy west / south sun exposure
 *
 * Round UP to the next available standard split-AC size — you can't
 * buy a 1.27-ton AC.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/src/ui/v2/Text';
import { useThemeV2 } from '@/src/theme/v2';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import { AC_MULTIPLIERS, AC_TON_SIZES } from '../constants';

export function AcTonnageCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [length, setLength] = useState('12');
  const [width, setWidth] = useState('10');
  const [height, setHeight] = useState('10');
  const [topFloor, setTopFloor] = useState(false);
  const [heavySun, setHeavySun] = useState(false);

  const result = useMemo(() => {
    const L = parseNum(length) ?? 0;
    const W = parseNum(width) ?? 0;
    const H = parseNum(height) ?? 0;
    if (L <= 0 || W <= 0 || H <= 0) return null;

    const volume = L * W * H;
    const baseTons = volume / 1000;
    const adjusted =
      baseTons *
      (topFloor ? AC_MULTIPLIERS.topFloor : 1) *
      (heavySun ? AC_MULTIPLIERS.heavySunExposure : 1);

    const recommended =
      AC_TON_SIZES.find((s) => s >= adjusted) ??
      AC_TON_SIZES[AC_TON_SIZES.length - 1];

    return { volume, baseTons, adjusted, recommended };
  }, [length, width, height, topFloor, heavySun]);

  return (
    <ToolModal visible={visible} onClose={onClose} title="AC tonnage">
      <Section title="Room dimensions">
        <View style={styles.row3}>
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
          <View style={styles.col}>
            <NumberField
              label="Height"
              unit="ft"
              value={height}
              onChangeText={setHeight}
              size="lg"
            />
          </View>
        </View>
        <Text variant="caption1" color="secondary" style={styles.hint}>
          Standard ceiling height is 9–10 ft. Volume ={' '}
          {result ? result.volume.toFixed(0) : '—'} cu ft.
        </Text>
      </Section>

      <Section title="Adjustments">
        <ToggleRow
          label="Top floor"
          desc={`Direct sun on the slab adds load (+${Math.round(
            (AC_MULTIPLIERS.topFloor - 1) * 100,
          )}%).`}
          value={topFloor}
          onChange={setTopFloor}
        />
        <ToggleRow
          label="Heavy sun (west / south facing)"
          desc={`Long afternoon exposure adds load (+${Math.round(
            (AC_MULTIPLIERS.heavySunExposure - 1) * 100,
          )}%).`}
          value={heavySun}
          onChange={setHeavySun}
        />
      </Section>

      <Section title="Recommendation">
        <ResultRow
          label="Recommended AC capacity"
          value={result ? result.recommended.toString() : ''}
          unit={result?.recommended === 1 ? 'ton' : 'tons'}
          tone="primary"
          sub={
            result
              ? `Base ${result.baseTons.toFixed(2)} t × ${
                  topFloor ? AC_MULTIPLIERS.topFloor : 1
                } (top) × ${
                  heavySun ? AC_MULTIPLIERS.heavySunExposure : 1
                } (sun) = ${result.adjusted.toFixed(2)} t → next standard size.`
              : undefined
          }
        />
        <Text variant="caption1" color="secondary" style={styles.note}>
          For glass-heavy rooms, kitchens, or rooms with &gt; 4 occupants
          regularly, step up by half a ton. For higher inverter
          efficiency, go one size larger to reduce duty cycle.
        </Text>
      </Section>
    </ToolModal>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useThemeV2();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggleRow,
        {
          backgroundColor: value
            ? (t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft)
            : t.colors.surface,
          borderRadius: t.radii.field,
          borderColor: value
            ? t.palette.blue.base + '33'
            : (t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
          borderWidth: t.hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text
          variant="callout"
          style={{
            color: value ? t.palette.blue.base : t.colors.label,
            fontWeight: '600',
          }}
        >
          {label}
        </Text>
        <Text variant="caption1" color="secondary" style={{ marginTop: 2 }}>
          {desc}
        </Text>
      </View>
      <View
        style={[
          styles.checkBox,
          {
            backgroundColor: value ? t.palette.blue.base : 'transparent',
            borderColor: value ? t.palette.blue.base : t.colors.tertiary,
          },
        ]}
      >
        {value ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row3: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  hint: {
    marginTop: 2,
    paddingHorizontal: 4,
  },
  note: {
    marginTop: 4,
    paddingHorizontal: 4,
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
