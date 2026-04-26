/**
 * Equidistant Spacing Tool — given a wall, an object width, and a
 * count, returns the gap to leave on both ends and between every pair
 * of objects so they're perfectly centred.
 *
 * Formula: gap = (wallLength − count × objectWidth) / (count + 1)
 * Yields one gap value because all gaps are equal (including the two
 * end gaps to the wall).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, space } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';

export function SpacingCalculator({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  // Inputs in inches because most fittings (sconces, hooks, frames)
  // are sized in inches on the spec sheet.
  const [wall, setWall] = useState('120');     // wall length in inches
  const [obj, setObj] = useState('6');         // object width in inches
  const [count, setCount] = useState('3');     // number of objects

  const result = useMemo(() => {
    const W = parseNum(wall) ?? 0;
    const O = parseNum(obj) ?? 0;
    const N = parseNum(count) ?? 0;
    // Edge cases: divide-by-zero on count=0; negative gap when objects
    // wider than wall (call out to the user instead of silently flipping).
    if (N <= 0 || W <= 0) {
      return { gap: 0, totalUsed: 0, ok: false, reason: '' };
    }
    const totalObj = N * O;
    const remaining = W - totalObj;
    if (remaining < 0) {
      return {
        gap: 0,
        totalUsed: totalObj,
        ok: false,
        reason: `Objects (${totalObj.toFixed(1)} in total) won't fit on a ${W} in wall.`,
      };
    }
    const gap = remaining / (N + 1);
    return { gap, totalUsed: totalObj, ok: true, reason: '' };
  }, [wall, obj, count]);

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Equidistant Spacing"
      eyebrow="LAYOUT"
    >
      <Section title="Inputs">
        <NumberField
          label="Wall length"
          unit="in"
          value={wall}
          onChangeText={setWall}
          size="lg"
          hint="The full straight-line span you want to populate."
        />
        <View style={styles.row2}>
          <View style={styles.col}>
            <NumberField
              label="Object width"
              unit="in"
              value={obj}
              onChangeText={setObj}
            />
          </View>
          <View style={styles.col}>
            <NumberField
              label="Number of objects"
              unit="qty"
              value={count}
              onChangeText={setCount}
              decimal={false}
            />
          </View>
        </View>
      </Section>

      <Section title="Spacing">
        {result.ok ? (
          <>
            <ResultRow
              label="Gap between every pair (and to each wall edge)"
              value={result.gap.toFixed(2)}
              unit="in"
              tone="primary"
              sub={`= ${(result.gap * 25.4).toFixed(0)} mm. Total objects: ${result.totalUsed.toFixed(1)} in.`}
            />
            <SpacingDiagram
              wall={parseNum(wall) ?? 0}
              obj={parseNum(obj) ?? 0}
              count={parseNum(count) ?? 0}
              gap={result.gap}
            />
          </>
        ) : (
          <Text style={styles.warn}>
            {result.reason || 'Enter a wall length and a positive object count to compute spacing.'}
          </Text>
        )}
      </Section>
    </ToolModal>
  );
}

/** Tiny ASCII-style diagram showing wall + objects + gaps to the user
 *  visualises the layout. Built with plain Views for portability. */
function SpacingDiagram({
  wall,
  obj,
  count,
  gap,
}: {
  wall: number;
  obj: number;
  count: number;
  gap: number;
}) {
  if (wall <= 0 || count <= 0) return null;
  // Build a flat array of widths in order: gap, obj, gap, obj, …, gap.
  const segments: { kind: 'gap' | 'obj'; w: number }[] = [];
  for (let i = 0; i < count; i++) {
    segments.push({ kind: 'gap', w: gap });
    segments.push({ kind: 'obj', w: obj });
  }
  segments.push({ kind: 'gap', w: gap });

  return (
    <View style={styles.diagramWrap}>
      <View style={styles.diagramBar}>
        {segments.map((s, i) => (
          <View
            key={i}
            style={{
              flex: s.w,
              backgroundColor:
                s.kind === 'obj' ? color.primary : color.surfaceAlt,
            }}
          />
        ))}
      </View>
      <View style={styles.diagramLegend}>
        <Legend swatch={color.primary} label="object" />
        <Legend swatch={color.surfaceAlt} label="gap" />
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
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
  },
  diagramWrap: { gap: 6, marginTop: 4 },
  diagramBar: {
    flexDirection: 'row',
    height: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    overflow: 'hidden',
  },
  diagramLegend: { flexDirection: 'row', gap: 16, marginTop: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: {
    width: 14,
    height: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  legendText: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    color: color.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
