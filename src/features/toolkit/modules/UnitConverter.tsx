/**
 * Bidirectional unit converter — Length & Area.
 *
 * Pattern: every input is "live" and bidirectional. The user types into
 * any field, and the rest update from the canonical base unit
 * (millimetres for length, square metres for area). The active field
 * tracks which input owns the truth so we don't ping-pong rounding
 * errors back at it.
 *
 * Length supports the awkward "ft + in" composite that interior
 * designers actually quote on site, alongside mm/cm/m. Area covers the
 * Indian "Gaj" (sq yd) trio.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/ui/Text';
import { color, fontFamily, radius, space } from '@/src/theme';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { Section } from '../components/Section';
import { AREA, LENGTH } from '../constants';

// ────────────────────────────────────────────────────────────────────
// LENGTH
// ────────────────────────────────────────────────────────────────────

type LengthField = 'ft' | 'in' | 'mm' | 'cm' | 'm';

/** Round to a sensible number of decimals — avoids "12.000000001" garbage. */
function fmt(n: number, decimals = 3): string {
  if (!Number.isFinite(n)) return '';
  // Strip trailing zeros after decimal but keep up to `decimals`.
  const fixed = n.toFixed(decimals);
  return fixed.replace(/\.?0+$/, '');
}

function LengthSection() {
  const [active, setActive] = useState<LengthField>('ft');
  const [ft, setFt] = useState('1');
  const [inch, setInch] = useState('0');
  const [mm, setMm] = useState('304.8');
  const [cm, setCm] = useState('30.48');
  const [m, setM] = useState('0.305');

  // Compute base mm from whichever field the user just edited.
  function recompute(from: LengthField, raw: string, otherFt?: string) {
    setActive(from);
    let baseMm = 0;
    if (from === 'ft' || from === 'in') {
      const f = parseNum(from === 'ft' ? raw : (otherFt ?? ft)) ?? 0;
      const i = parseNum(from === 'in' ? raw : inch) ?? 0;
      baseMm = f * LENGTH.ftToMm + i * LENGTH.inToMm;
    } else if (from === 'mm') {
      baseMm = parseNum(raw) ?? 0;
    } else if (from === 'cm') {
      baseMm = (parseNum(raw) ?? 0) * LENGTH.cmToMm;
    } else if (from === 'm') {
      baseMm = (parseNum(raw) ?? 0) * LENGTH.mToMm;
    }

    // Update every field EXCEPT the one the user is typing in
    // (so caret + raw input is preserved).
    if (from !== 'ft' && from !== 'in') {
      // Convert mm → ft + leftover inches.
      const totalIn = baseMm / LENGTH.inToMm;
      const wholeFt = Math.floor(totalIn / 12);
      const leftoverIn = totalIn - wholeFt * 12;
      setFt(fmt(wholeFt, 0));
      setInch(fmt(leftoverIn, 2));
    } else if (from === 'ft') {
      // User changed ft, leave inch as-is.
    } else {
      // User changed inch, leave ft as-is.
    }
    if (from !== 'mm') setMm(fmt(baseMm, 2));
    if (from !== 'cm') setCm(fmt(baseMm / LENGTH.cmToMm, 3));
    if (from !== 'm') setM(fmt(baseMm / LENGTH.mToMm, 4));
  }

  return (
    <Section title="Length">
      <View style={styles.row2}>
        <View style={styles.col}>
          <NumberField
            label="Feet"
            unit="ft"
            value={ft}
            onChangeText={(t) => { setFt(t); recompute('ft', t); }}
            size="lg"
          />
        </View>
        <View style={styles.col}>
          <NumberField
            label="Inches"
            unit="in"
            value={inch}
            onChangeText={(t) => { setInch(t); recompute('in', t); }}
            size="lg"
          />
        </View>
      </View>

      <NumberField
        label="Millimetres"
        unit="mm"
        value={mm}
        onChangeText={(t) => { setMm(t); recompute('mm', t); }}
      />
      <NumberField
        label="Centimetres"
        unit="cm"
        value={cm}
        onChangeText={(t) => { setCm(t); recompute('cm', t); }}
      />
      <NumberField
        label="Metres"
        unit="m"
        value={m}
        onChangeText={(t) => { setM(t); recompute('m', t); }}
      />
      <ActiveCaption active={active} />
    </Section>
  );
}

function ActiveCaption({ active }: { active: LengthField }) {
  const labels: Record<LengthField, string> = {
    ft: 'feet', in: 'inches', mm: 'millimetres', cm: 'centimetres', m: 'metres',
  };
  return (
    <Text style={styles.caption}>
      Showing values converted from {labels[active]}.
    </Text>
  );
}

// ────────────────────────────────────────────────────────────────────
// AREA
// ────────────────────────────────────────────────────────────────────

type AreaField = 'sqft' | 'sqm' | 'sqyd';

function AreaSection() {
  const [active, setActive] = useState<AreaField>('sqft');
  const [sqft, setSqft] = useState('100');
  const [sqm, setSqm] = useState('9.29');
  const [sqyd, setSqyd] = useState('11.111');

  function recompute(from: AreaField, raw: string) {
    setActive(from);
    const n = parseNum(raw) ?? 0;
    let baseSqm = 0;
    if (from === 'sqft') baseSqm = n * AREA.sqftToSqm;
    else if (from === 'sqm') baseSqm = n;
    else baseSqm = n * AREA.sqydToSqm;

    if (from !== 'sqft') setSqft(fmt(baseSqm / AREA.sqftToSqm, 2));
    if (from !== 'sqm') setSqm(fmt(baseSqm, 3));
    if (from !== 'sqyd') setSqyd(fmt(baseSqm / AREA.sqydToSqm, 3));
  }

  return (
    <Section title="Area">
      <NumberField
        label="Square Feet"
        unit="sq ft"
        value={sqft}
        onChangeText={(t) => { setSqft(t); recompute('sqft', t); }}
        size="lg"
      />
      <NumberField
        label="Square Metres"
        unit="m²"
        value={sqm}
        onChangeText={(t) => { setSqm(t); recompute('sqm', t); }}
        size="lg"
      />
      <NumberField
        label="Square Yards (Gaj)"
        unit="gaj"
        value={sqyd}
        onChangeText={(t) => { setSqyd(t); recompute('sqyd', t); }}
        size="lg"
        hint="1 Gaj = 9 sq ft = 0.836 m²"
      />
      <Text style={styles.caption}>
        Showing values converted from {active === 'sqft' ? 'square feet' : active === 'sqm' ? 'square metres' : 'gaj'}.
      </Text>
    </Section>
  );
}

// ────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────

type Tab = 'length' | 'area';

export function UnitConverter({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('length');

  return (
    <ToolModal
      visible={visible}
      onClose={onClose}
      title="Unit Converter"
      eyebrow="INDIAN SITE"
    >
      <View style={styles.tabRow}>
        <TabBtn label="LENGTH" active={tab === 'length'} onPress={() => setTab('length')} />
        <TabBtn label="AREA" active={tab === 'area'} onPress={() => setTab('area')} />
      </View>

      {tab === 'length' ? <LengthSection /> : <AreaSection />}
    </ToolModal>
  );
}

function TabBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text
        style={active ? { ...styles.tabLabel, ...styles.tabLabelActive } : styles.tabLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  tabActive: { backgroundColor: color.primary },
  tabLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    fontWeight: '600',
    color: color.textMuted,
    letterSpacing: 1.2,
  },
  tabLabelActive: { color: '#fff' },

  row2: { flexDirection: 'row', gap: space.sm },
  col: { flex: 1 },
  caption: {
    fontSize: 11,
    color: color.textFaint,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
