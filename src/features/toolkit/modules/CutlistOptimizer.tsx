/**
 * Cutlist Optimizer — pack cuts onto stock sheets (V1).
 *
 * Layout:
 *   1. Stock panel section — unit toggle (mm / ft), W, H, kerf
 *   2. Parts section — dynamic list of [label, W, H, qty, delete] rows + "Add part"
 *   3. Result section — sheets needed (primary), waste %, total parts
 *   4. Layout section — one SVG diagram per sheet
 *   5. Share PDF button — sends a printable cutlist via the OS share sheet
 *
 * All inputs are stored in the user's chosen display unit (mm or ft);
 * conversion to mm happens at the boundary before calling `optimize`.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/src/ui/v2/Text';
import { FilterChip } from '@/src/ui/v2/FilterChip';
import { useThemeV2 } from '@/src/theme/v2';
import { generateAndShareWebPdf } from '@/src/features/projects/reports/generatePdf';

import { ToolModal } from '../components/ToolModal';
import { NumberField, parseNum } from '../components/NumberField';
import { ResultRow } from '../components/ResultRow';
import { Section } from '../components/Section';
import { DEFAULT_KERF_MM, LENGTH } from '../constants';
import {
  optimize,
  type CutlistResult,
  type Sheet as PackedSheet,
  type Stock,
} from '../lib/cutlistOptimizer';

// ── Unit helpers ────────────────────────────────────────────────────

type Unit = 'mm' | 'ft';

const FT_TO_MM = LENGTH.ftToMm; // 304.8
const MM_TO_FT = 1 / FT_TO_MM;
const MM_TO_SQFT = 1 / (FT_TO_MM * FT_TO_MM); // mm² → sq ft

function toMm(value: number, from: Unit): number {
  return from === 'mm' ? value : value * FT_TO_MM;
}

function fromMm(value: number, to: Unit): number {
  return to === 'mm' ? value : value * MM_TO_FT;
}

function roundDisplay(value: number, unit: Unit): string {
  if (unit === 'mm') return String(Math.round(value));
  // 2 decimals for ft, trim trailing zeros
  const v = Math.round(value * 100) / 100;
  return String(v);
}

// ── Stock-size presets ──────────────────────────────────────────────
//
// Common Indian plywood / MDF / particleboard sizes. Each preset
// carries display values for both units so toggling ft ↔ mm doesn't
// drift through floating-point conversion (8 ft → 2438.4 mm → 8.005 ft).
// "Custom" is the implicit fallback whenever the user types in the
// W or H input themselves.

type PresetKey = '8x4' | '7x4' | '6x4' | '6x3' | 'custom';

type StockPreset = {
  key: PresetKey;
  label: string;
  ft: { w: string; h: string };
  mm: { w: string; h: string };
};

const STOCK_PRESETS: StockPreset[] = [
  { key: '8x4',    label: '8 × 4 ft', ft: { w: '8', h: '4' }, mm: { w: '2440', h: '1220' } },
  { key: '7x4',    label: '7 × 4 ft', ft: { w: '7', h: '4' }, mm: { w: '2135', h: '1220' } },
  { key: '6x4',    label: '6 × 4 ft', ft: { w: '6', h: '4' }, mm: { w: '1830', h: '1220' } },
  { key: '6x3',    label: '6 × 3 ft', ft: { w: '6', h: '3' }, mm: { w: '1830', h: '915' } },
  { key: 'custom', label: 'Custom',    ft: { w: '',  h: '' },  mm: { w: '',     h: ''     } },
];

// ── Per-part color palette ──────────────────────────────────────────
//
// Each part *type* (one row in the parts list) gets a distinct soft
// fill so every instance of that part is visually grouped on the
// sheet. With more than 8 parts, the palette cycles — two parts
// share a colour, which is acceptable in a workshop context where
// the part label tells them apart.
//
// `bg` is the rect fill (low-alpha so dimensions read on top), `fg`
// is the matching ink for borders + text.

type PartColor = { bg: string; fg: string };

const PART_PALETTE: PartColor[] = [
  { bg: 'rgba(10,132,255,0.16)',  fg: '#0A84FF' }, // blue
  { bg: 'rgba(52,199,89,0.18)',   fg: '#1F8A3F' }, // green (deeper fg for legibility)
  { bg: 'rgba(255,149,0,0.18)',   fg: '#C56A2C' }, // orange
  { bg: 'rgba(175,82,222,0.18)',  fg: '#7A33B0' }, // purple
  { bg: 'rgba(50,173,230,0.18)',  fg: '#1B7CAA' }, // cyan
  { bg: 'rgba(255,59,48,0.16)',   fg: '#C92F25' }, // red
  { bg: 'rgba(94,92,230,0.18)',   fg: '#3F3DAB' }, // indigo
  { bg: 'rgba(232,180,0,0.20)',   fg: '#8A6A00' }, // yellow
];

function colorForIndex(i: number): PartColor {
  return PART_PALETTE[i % PART_PALETTE.length];
}

// ── Local types ─────────────────────────────────────────────────────

type PartRow = {
  id: string;
  label: string;
  w: string;
  h: string;
  qty: string;
};

let nextId = 1;
function makeId(): string {
  nextId += 1;
  return `p${Date.now().toString(36)}_${nextId}`;
}

function makeEmptyRow(): PartRow {
  return { id: makeId(), label: '', w: '', h: '', qty: '1' };
}

// ── Component ───────────────────────────────────────────────────────

export function CutlistOptimizer({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const t = useThemeV2();

  // Default unit = mm (industry-standard sheet specs in India read as
  // 2440 × 1220 mm; the user can toggle to ft any time).
  const [unit, setUnit] = useState<Unit>('mm');
  const [presetKey, setPresetKey] = useState<PresetKey>('8x4');
  const [stockW, setStockW] = useState('2440'); // 8 ft in mm (rounded)
  const [stockH, setStockH] = useState('1220'); // 4 ft in mm (rounded)
  const [kerf, setKerf] = useState(String(DEFAULT_KERF_MM));
  const [parts, setParts] = useState<PartRow[]>(() => [makeEmptyRow()]);
  const [sharing, setSharing] = useState(false);

  // Apply a preset — fills W/H using the canonical values for the
  // current unit (no conversion drift) and locks the chip in.
  const applyPreset = useCallback((key: PresetKey) => {
    setPresetKey(key);
    if (key === 'custom') return;
    const preset = STOCK_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setStockW(preset[unit].w);
    setStockH(preset[unit].h);
  }, [unit]);

  // Manual edits to W or H switch the chip-row to "Custom".
  const handleStockWChange = useCallback((v: string) => {
    setStockW(v);
    setPresetKey('custom');
  }, []);
  const handleStockHChange = useCallback((v: string) => {
    setStockH(v);
    setPresetKey('custom');
  }, []);

  // ── Unit toggle — convert all displayed values in place ──
  // For stock W/H: if a preset is locked, use the preset's canonical
  // values for the new unit (avoids 8 ↔ 2438.4 drift). For Custom and
  // for all part dimensions, convert in place.
  const handleUnitChange = useCallback((next: Unit) => {
    if (next === unit) return;
    const conv = (raw: string): string => {
      const n = parseNum(raw);
      if (n == null) return raw;
      const mm = toMm(n, unit);
      return roundDisplay(fromMm(mm, next), next);
    };

    if (presetKey !== 'custom') {
      const preset = STOCK_PRESETS.find((p) => p.key === presetKey);
      if (preset) {
        setStockW(preset[next].w);
        setStockH(preset[next].h);
      }
    } else {
      setStockW((p) => conv(p));
      setStockH((p) => conv(p));
    }

    setParts((prev) =>
      prev.map((row) => ({
        ...row,
        w: conv(row.w),
        h: conv(row.h),
      })),
    );
    setUnit(next);
  }, [unit, presetKey]);

  // ── Compute result ──
  const stockMm: Stock = useMemo(() => {
    const w = parseNum(stockW) ?? 0;
    const h = parseNum(stockH) ?? 0;
    const k = parseNum(kerf) ?? 0;
    return {
      width: toMm(w, unit),
      height: toMm(h, unit),
      kerf: Math.max(0, k),
    };
  }, [stockW, stockH, kerf, unit]);

  // Stable colour assignment per part-row id. Order in `parts` decides
  // the colour — Part 1 = blue, Part 2 = green, etc.
  const partColorMap = useMemo(() => {
    const map = new Map<string, PartColor>();
    parts.forEach((row, i) => map.set(row.id, colorForIndex(i)));
    return map;
  }, [parts]);

  const result: CutlistResult | null = useMemo(() => {
    if (stockMm.width <= 0 || stockMm.height <= 0) return null;
    const cleanParts = parts
      .map((row) => {
        const w = parseNum(row.w);
        const h = parseNum(row.h);
        const qty = parseNum(row.qty);
        if (!w || !h || !qty || w <= 0 || h <= 0 || qty < 1) return null;
        return {
          id: row.id,
          label: row.label.trim(),
          w: toMm(w, unit),
          h: toMm(h, unit),
          qty: Math.floor(qty),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (cleanParts.length === 0) return null;
    return optimize(stockMm, cleanParts);
  }, [stockMm, parts, unit]);

  // ── Part list mutators ──
  const updatePart = (id: string, patch: Partial<PartRow>) => {
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const addPart = () => setParts((prev) => [...prev, makeEmptyRow()]);
  const removePart = (id: string) => {
    setParts((prev) => (prev.length === 1 ? prev : prev.filter((p) => p.id !== id)));
  };

  // ── PDF share ──
  const handleSharePdf = useCallback(async () => {
    if (!result || result.sheets.length === 0) {
      Alert.alert('Nothing to share', 'Add parts first to build a cutlist.');
      return;
    }
    setSharing(true);
    try {
      const html = buildCutlistHtml({
        stock: stockMm,
        parts,
        result,
        unit,
        colorMap: partColorMap,
      });
      const res = await generateAndShareWebPdf({
        html,
        filename: 'Cutlist',
        dialogTitle: 'Share cutlist',
      });
      if (!res.ok) {
        Alert.alert('Could not share', res.reason);
      }
    } finally {
      setSharing(false);
    }
  }, [result, stockMm, parts, unit]);

  // ── Render ──
  const unitLabel = unit;
  const dimUnit = unit;
  const unplacedCount = result?.unplaced.length ?? 0;
  const offcutSqft = result
    ? (result.totalStockArea - result.totalUsedArea) * MM_TO_SQFT
    : 0;

  return (
    <ToolModal visible={visible} onClose={onClose} title="Cutlist optimizer">
      {/* ── Stock ── */}
      <Section title="Stock panel">
        {/* Preset chips — quick-pick common Indian plywood sizes.
            Tap any chip to fill the W/H inputs; tap Custom (or just
            type in W/H) to enter a non-standard panel. */}
        <View style={styles.presetRow}>
          {STOCK_PRESETS.map((p) => (
            <FilterChip
              key={p.key}
              label={p.label}
              selected={presetKey === p.key}
              onPress={() => applyPreset(p.key)}
            />
          ))}
        </View>
        <UnitToggle unit={unit} onChange={handleUnitChange} />
        <View style={styles.dimRow}>
          <View style={styles.dimCell}>
            <NumberField
              label="Width"
              unit={dimUnit}
              value={stockW}
              onChangeText={handleStockWChange}
            />
          </View>
          <View style={styles.dimCell}>
            <NumberField
              label="Height"
              unit={dimUnit}
              value={stockH}
              onChangeText={handleStockHChange}
            />
          </View>
        </View>
        <NumberField
          label="Saw kerf"
          unit="mm"
          value={kerf}
          onChangeText={setKerf}
          hint="Blade thickness — gap reserved between neighbouring cuts. 3 mm for a typical 7¼″ circular saw."
        />
      </Section>

      {/* ── Parts ── */}
      <Section title="Parts to cut">
        {parts.map((row, idx) => (
          <PartRowEditor
            key={row.id}
            row={row}
            index={idx}
            unit={unitLabel}
            canDelete={parts.length > 1}
            onChange={(patch) => updatePart(row.id, patch)}
            onDelete={() => removePart(row.id)}
          />
        ))}
        <Pressable
          onPress={addPart}
          style={({ pressed }) => [
            styles.addBtn,
            {
              backgroundColor: t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
              borderRadius: t.radii.field,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="add-circle-outline" size={16} color={t.palette.blue.base} />
          <Text
            variant="footnote"
            style={{
              color: t.palette.blue.base,
              fontWeight: '700',
              marginLeft: 6,
            }}
          >
            Add part
          </Text>
        </Pressable>
      </Section>

      {/* ── Result ── */}
      <Section title="Result">
        <ResultRow
          label="Sheets needed"
          value={result ? String(result.sheets.length) : ''}
          unit={result && result.sheets.length === 1 ? 'sheet' : 'sheets'}
          tone="primary"
          sub={
            result
              ? `${result.placedParts} / ${result.totalParts} pieces placed`
              : 'Enter stock + parts to see the layout'
          }
        />
        <ResultRow
          label="Material usage"
          value={result ? `${(100 - result.wastePct).toFixed(1)}%` : ''}
          unit="used"
          sub={
            result
              ? `${result.wastePct.toFixed(1)}% waste · ${offcutSqft.toFixed(1)} sq ft offcuts`
              : undefined
          }
        />
        {unplacedCount > 0 && (
          <View
            style={[
              styles.warnBox,
              {
                backgroundColor: t.mode === 'dark' ? t.palette.red.softDark : t.palette.red.soft,
                borderRadius: t.radii.field,
              },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={14} color={t.palette.red.base} />
            <Text
              variant="caption1"
              style={{ color: t.palette.red.base, marginLeft: 6, flex: 1 }}
            >
              {unplacedCount} part{unplacedCount === 1 ? "" : "s"} bigger than the stock — they were skipped. Reduce their dimensions or use a larger panel.
            </Text>
          </View>
        )}
      </Section>

      {/* ── Layout diagrams ── */}
      {result && result.sheets.length > 0 && (
        <Section title={`Layout · ${result.sheets.length} sheet${result.sheets.length === 1 ? '' : 's'}`}>
          {result.sheets.map((sheet, i) => (
            <SheetDiagram
              key={i}
              index={i + 1}
              sheet={sheet}
              stock={stockMm}
              unit={unit}
              colorMap={partColorMap}
            />
          ))}
        </Section>
      )}

      {/* ── Share PDF ── */}
      {result && result.sheets.length > 0 && (
        <View style={{ paddingHorizontal: 16 }}>
          <Pressable
            onPress={handleSharePdf}
            disabled={sharing}
            style={({ pressed }) => [
              styles.shareBtn,
              {
                backgroundColor: t.palette.blue.base,
                borderRadius: 999,
              },
              pressed && { opacity: 0.85 },
              sharing && { opacity: 0.6 },
            ]}
          >
            {sharing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="share-outline" size={16} color="#fff" />
                <Text
                  variant="callout"
                  style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}
                >
                  Share cutlist PDF
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </ToolModal>
  );
}

// ── Unit toggle (segmented) ─────────────────────────────────────────

function UnitToggle({
  unit,
  onChange,
}: {
  unit: Unit;
  onChange: (u: Unit) => void;
}) {
  const t = useThemeV2();
  const options: Unit[] = ['ft', 'mm'];
  return (
    <View
      style={[
        styles.toggleRow,
        {
          backgroundColor: t.colors.fill3,
          borderRadius: t.radii.field,
        },
      ]}
    >
      {options.map((opt) => {
        const active = opt === unit;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={({ pressed }) => [
              styles.toggleSlot,
              active && {
                backgroundColor: t.colors.surface,
                borderRadius: t.radii.field - 2,
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
              },
              pressed && !active && { opacity: 0.7 },
            ]}
          >
            <Text
              variant="footnote"
              style={{
                color: active ? t.colors.label : t.colors.secondary,
                fontWeight: '700',
                letterSpacing: 0.3,
              }}
            >
              {opt.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Part row editor ─────────────────────────────────────────────────

function PartRowEditor({
  row,
  index,
  unit,
  canDelete,
  onChange,
  onDelete,
}: {
  row: PartRow;
  index: number;
  unit: Unit;
  canDelete: boolean;
  onChange: (patch: Partial<PartRow>) => void;
  onDelete: () => void;
}) {
  const t = useThemeV2();
  return (
    <View
      style={[
        styles.partCard,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.field,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
      ]}
    >
      <View style={styles.partTop}>
        <Text
          variant="caption2"
          color="tertiary"
          style={{ letterSpacing: 0.5, flex: 1 }}
        >
          PART {index + 1}
        </Text>
        {canDelete && (
          <Pressable
            onPress={onDelete}
            hitSlop={10}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="trash-outline" size={16} color={t.colors.tertiary} />
          </Pressable>
        )}
      </View>
      <TextInput
        value={row.label}
        onChangeText={(v) => onChange({ label: v })}
        placeholder="Label (optional) — e.g. Wardrobe shutter"
        placeholderTextColor={t.colors.tertiary}
        style={[
          styles.labelInput,
          { color: t.colors.label, ...t.type.callout },
        ]}
      />
      <View style={styles.partDimRow}>
        <DimInput
          label="W"
          unit={unit}
          value={row.w}
          onChangeText={(v) => onChange({ w: v })}
        />
        <DimInput
          label="H"
          unit={unit}
          value={row.h}
          onChangeText={(v) => onChange({ h: v })}
        />
        <DimInput
          label="Qty"
          unit=""
          value={row.qty}
          onChangeText={(v) => onChange({ qty: v })}
          decimal={false}
        />
      </View>
    </View>
  );
}

function DimInput({
  label,
  unit,
  value,
  onChangeText,
  decimal = true,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (v: string) => void;
  decimal?: boolean;
}) {
  const t = useThemeV2();
  function sanitize(raw: string) {
    let cleaned = raw.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '');
    if (decimal) {
      const firstDot = cleaned.indexOf('.');
      if (firstDot !== -1) {
        cleaned =
          cleaned.slice(0, firstDot + 1) +
          cleaned.slice(firstDot + 1).replace(/\./g, '');
      }
    }
    onChangeText(cleaned);
  }
  return (
    <View
      style={[
        styles.dimInputCard,
        {
          backgroundColor: t.colors.fill3,
          borderRadius: t.radii.field - 4,
        },
      ]}
    >
      <Text variant="caption2" color="tertiary" style={{ letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.dimInputRow}>
        <TextInput
          value={value}
          onChangeText={sanitize}
          placeholder="0"
          placeholderTextColor={t.colors.tertiary}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          style={[
            styles.dimInputText,
            {
              color: t.colors.label,
              ...t.type.headline,
              fontWeight: '700',
              fontVariant: ['tabular-nums'],
            },
          ]}
        />
        {unit ? (
          <Text
            variant="caption1"
            color="tertiary"
            style={{ marginLeft: 4, fontWeight: '600' }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ── Sheet diagram (SVG) ─────────────────────────────────────────────

function SheetDiagram({
  index,
  sheet,
  stock,
  unit,
  colorMap,
}: {
  index: number;
  sheet: PackedSheet;
  stock: Stock;
  unit: Unit;
  colorMap: Map<string, PartColor>;
}) {
  const t = useThemeV2();

  // Render the SVG at a fixed visual width; the height follows the
  // stock's aspect ratio so dimensions read correctly.
  const VIEW_W = 320;
  const VIEW_H = Math.max(80, Math.round((stock.height / stock.width) * VIEW_W));

  // Sheet-meta dimension formatter (ft / mm).
  function fmtMeta(mm: number): string {
    if (unit === 'mm') return `${Math.round(mm)} mm`;
    return `${(mm * MM_TO_FT).toFixed(2)} ft`;
  }

  // Per-placement dimension stamp — short form, no unit suffix (the
  // whole sheet's unit is shown in the header). E.g. `600 × 400`.
  function fmtPlacement(mm: number): string {
    if (unit === 'mm') return String(Math.round(mm));
    return (mm * MM_TO_FT).toFixed(2);
  }

  const stockBorder =
    t.mode === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.22)';
  const fallbackColor: PartColor = {
    bg: t.mode === 'dark' ? t.palette.blue.softDark : t.palette.blue.soft,
    fg: t.palette.blue.base,
  };

  return (
    <View
      style={[
        styles.sheetCard,
        {
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.field,
          borderColor:
            t.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
          borderWidth: t.hairline,
        },
      ]}
    >
      <View style={styles.sheetHead}>
        <Text variant="footnote" color="label" style={{ fontWeight: '700' }}>
          Sheet {index}
        </Text>
        <Text variant="caption1" color="secondary">
          {fmtMeta(stock.width)} × {fmtMeta(stock.height)}
        </Text>
      </View>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Svg
          width={VIEW_W}
          height={VIEW_H}
          viewBox={`0 0 ${stock.width} ${stock.height}`}
        >
          {/* Stock outline */}
          <Rect
            x={0}
            y={0}
            width={stock.width}
            height={stock.height}
            fill={t.mode === 'dark' ? '#1A1A1C' : '#FCFCFD'}
            stroke={stockBorder}
            strokeWidth={Math.max(1, stock.width / VIEW_W * 1.2)}
          />
          {/* Placements */}
          <G>
            {sheet.placements.map((p, i) => {
              const color = colorMap.get(p.partId) ?? fallbackColor;
              // Font size in viewBox (mm) units that renders ~12px on screen.
              const fontSize = Math.max(8, (12 * stock.width) / VIEW_W);
              const cx = p.x + p.w / 2;
              const cy = p.y + p.h / 2;
              const dimsText =
                `${fmtPlacement(p.w)} × ${fmtPlacement(p.h)}` +
                (p.rotated ? ' ⟲' : '');
              const labelText = p.label;

              // Decide what fits in the rect:
              //  • Two lines (label + dims) when there's room for both
              //  • One line (dims only) when only one line fits
              //  • Nothing for tiny rects
              const fitsTwo =
                labelText.length > 0 &&
                p.w > fontSize * 4 &&
                p.h > fontSize * 3;
              const fitsOne =
                p.w > fontSize * 3.5 && p.h > fontSize * 1.6;

              return (
                <G key={i}>
                  <Rect
                    x={p.x}
                    y={p.y}
                    width={p.w}
                    height={p.h}
                    fill={color.bg}
                    stroke={color.fg + '88'}
                    strokeWidth={Math.max(0.5, stock.width / VIEW_W * 0.7)}
                  />
                  {fitsTwo && (
                    <>
                      <SvgText
                        x={cx}
                        y={cy - fontSize * 0.35}
                        fontSize={fontSize * 0.85}
                        fontWeight="600"
                        fill={color.fg}
                        textAnchor="middle"
                        opacity={0.85}
                      >
                        {labelText}
                      </SvgText>
                      <SvgText
                        x={cx}
                        y={cy + fontSize * 0.85}
                        fontSize={fontSize}
                        fontWeight="700"
                        fill={color.fg}
                        textAnchor="middle"
                      >
                        {dimsText}
                      </SvgText>
                    </>
                  )}
                  {!fitsTwo && fitsOne && (
                    <SvgText
                      x={cx}
                      y={cy + fontSize * 0.35}
                      fontSize={fontSize}
                      fontWeight="700"
                      fill={color.fg}
                      textAnchor="middle"
                    >
                      {dimsText}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </G>
        </Svg>
      </View>
    </View>
  );
}

// ── PDF HTML builder ────────────────────────────────────────────────

function buildCutlistHtml({
  stock,
  parts,
  result,
  unit,
  colorMap,
}: {
  stock: Stock;
  parts: PartRow[];
  result: CutlistResult;
  unit: Unit;
  colorMap: Map<string, PartColor>;
}): string {
  const fmtDim = (mm: number): string =>
    unit === 'mm'
      ? `${Math.round(mm)} mm`
      : `${(mm * MM_TO_FT).toFixed(2)} ft`;

  // Aggregate parts table from the original input rows so quantities
  // and labels show up the way the user typed them. Includes a colour
  // swatch matching the on-sheet fill so the carpenter can map each
  // table row to the correct rectangle in the layout diagrams.
  const partsTableRows = parts
    .map((row, idx) => {
      const w = parseNum(row.w);
      const h = parseNum(row.h);
      const qty = parseNum(row.qty);
      if (!w || !h || !qty) return '';
      const wMm = toMm(w, unit);
      const hMm = toMm(h, unit);
      const label = row.label.trim() || `Part ${idx + 1}`;
      const color = colorMap.get(row.id) ?? colorForIndex(idx);
      return `
        <tr>
          <td>${idx + 1}</td>
          <td><span class="swatch" style="background:${color.bg};border:1px solid ${color.fg}88;"></span>${escapeHtml(label)}</td>
          <td class="num">${fmtDim(wMm)}</td>
          <td class="num">${fmtDim(hMm)}</td>
          <td class="num">${Math.floor(qty)}</td>
        </tr>`;
    })
    .filter(Boolean)
    .join('');

  // One SVG block per sheet. The HTML print engine renders inline SVG.
  const sheetBlocks = result.sheets
    .map((sheet, i) => sheetSvgHtml(sheet, stock, i + 1, fmtDim, colorMap, unit))
    .join('');

  const totalStockSqft = (result.totalStockArea * MM_TO_SQFT).toFixed(1);
  const totalUsedSqft = (result.totalUsedArea * MM_TO_SQFT).toFixed(1);
  const offcutSqft = (
    (result.totalStockArea - result.totalUsedArea) *
    MM_TO_SQFT
  ).toFixed(1);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Cutlist</title>
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #111;
    margin: 0;
    -webkit-print-color-adjust: exact;
  }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.4px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
  .summary {
    display: flex; flex-wrap: wrap; gap: 18px;
    background: #F5F7FB; border: 1px solid #E5E9F0; border-radius: 10px;
    padding: 12px 16px; margin-bottom: 18px;
  }
  .summary > div { min-width: 120px; }
  .summary .label { font-size: 10px; letter-spacing: 0.6px; color: #6B7280; text-transform: uppercase; }
  .summary .value { font-size: 18px; font-weight: 700; color: #111; }
  table.parts { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
  table.parts th, table.parts td {
    padding: 6px 8px; border-bottom: 1px solid #EEF1F5; font-size: 12px; text-align: left;
  }
  table.parts th { background: #F5F7FB; font-weight: 700; color: #374151; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
  table.parts td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .swatch {
    display: inline-block;
    width: 10px; height: 10px;
    border-radius: 2px;
    margin-right: 8px;
    vertical-align: middle;
  }
  .sheet-card {
    page-break-inside: avoid;
    margin-bottom: 18px;
    border: 1px solid #E5E9F0;
    border-radius: 10px;
    padding: 12px;
  }
  .sheet-head {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 8px;
  }
  .sheet-head .name { font-weight: 700; font-size: 13px; }
  .sheet-head .dims { font-size: 11px; color: #666; }
  .sheet-svg { width: 100%; height: auto; display: block; }
  .footer { font-size: 10px; color: #9CA3AF; text-align: center; margin-top: 24px; }
</style>
</head>
<body>
  <h1>Cutlist</h1>
  <div class="sub">
    Stock: ${fmtDim(stock.width)} × ${fmtDim(stock.height)} &middot;
    Kerf: ${stock.kerf} mm &middot;
    Generated by Interior OS
  </div>

  <div class="summary">
    <div>
      <div class="label">Sheets needed</div>
      <div class="value">${result.sheets.length}</div>
    </div>
    <div>
      <div class="label">Pieces placed</div>
      <div class="value">${result.placedParts} / ${result.totalParts}</div>
    </div>
    <div>
      <div class="label">Material used</div>
      <div class="value">${(100 - result.wastePct).toFixed(1)}%</div>
    </div>
    <div>
      <div class="label">Waste</div>
      <div class="value">${result.wastePct.toFixed(1)}%</div>
    </div>
    <div>
      <div class="label">Offcuts</div>
      <div class="value">${offcutSqft} sq ft</div>
    </div>
  </div>

  <table class="parts">
    <thead>
      <tr><th>#</th><th>Part</th><th class="num">Width</th><th class="num">Height</th><th class="num">Qty</th></tr>
    </thead>
    <tbody>${partsTableRows}</tbody>
  </table>

  ${sheetBlocks}

  <div class="footer">Total stock area: ${totalStockSqft} sq ft &nbsp;·&nbsp; placed: ${totalUsedSqft} sq ft</div>
</body>
</html>`;
}

function sheetSvgHtml(
  sheet: PackedSheet,
  stock: Stock,
  index: number,
  fmtDim: (mm: number) => string,
  colorMap: Map<string, PartColor>,
  unit: Unit,
): string {
  // Render at a fixed paper width — the print engine scales everything
  // to fit. viewBox is in real mm so coordinates stay accurate.
  const PAPER_W = 520; // px
  const PAPER_H = Math.max(120, Math.round((stock.height / stock.width) * PAPER_W));
  const stroke = stock.width / PAPER_W * 1.2;
  const fallback: PartColor = { bg: '#DCE7FA', fg: '#1F65D6' };

  const fmtPlacement = (mm: number): string =>
    unit === 'mm' ? String(Math.round(mm)) : (mm * MM_TO_FT).toFixed(2);

  const rects = sheet.placements
    .map((p) => {
      const color = colorMap.get(p.partId) ?? fallback;
      const fontSize = Math.max(8, (11 * stock.width) / PAPER_W);
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const dimsText =
        `${fmtPlacement(p.w)} × ${fmtPlacement(p.h)}` +
        (p.rotated ? ' ⟲' : '');
      const labelText = p.label;

      const fitsTwo =
        labelText.length > 0 &&
        p.w > fontSize * 4 &&
        p.h > fontSize * 3;
      const fitsOne =
        p.w > fontSize * 3.5 && p.h > fontSize * 1.6;

      let textBlock = '';
      if (fitsTwo) {
        textBlock = `
          <text x="${cx}" y="${cy - fontSize * 0.35}" font-size="${fontSize * 0.85}" font-weight="600" fill="${color.fg}" text-anchor="middle" opacity="0.85">${escapeHtml(labelText)}</text>
          <text x="${cx}" y="${cy + fontSize * 0.85}" font-size="${fontSize}" font-weight="700" fill="${color.fg}" text-anchor="middle">${escapeHtml(dimsText)}</text>`;
      } else if (fitsOne) {
        textBlock = `
          <text x="${cx}" y="${cy + fontSize * 0.35}" font-size="${fontSize}" font-weight="700" fill="${color.fg}" text-anchor="middle">${escapeHtml(dimsText)}</text>`;
      }

      return `
        <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"
              fill="${color.bg}" stroke="${color.fg}88" stroke-width="${stroke * 0.6}" />
        ${textBlock}`;
    })
    .join('');

  return `
  <div class="sheet-card">
    <div class="sheet-head">
      <span class="name">Sheet ${index}</span>
      <span class="dims">${fmtDim(stock.width)} × ${fmtDim(stock.height)} &middot; ${sheet.placements.length} piece${sheet.placements.length === 1 ? '' : 's'}</span>
    </div>
    <svg class="sheet-svg" viewBox="0 0 ${stock.width} ${stock.height}" preserveAspectRatio="xMidYMid meet" width="${PAPER_W}" height="${PAPER_H}">
      <rect x="0" y="0" width="${stock.width}" height="${stock.height}"
            fill="#FCFCFD" stroke="#9CA3AF" stroke-width="${stroke}" />
      ${rects}
    </svg>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Preset chip row — wraps to two lines on narrow screens
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Unit toggle
  toggleRow: {
    flexDirection: 'row',
    padding: 3,
    alignSelf: 'flex-start',
  },
  toggleSlot: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stock dim row
  dimRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dimCell: {
    flex: 1,
  },

  // Part row card
  partCard: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  partTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelInput: {
    paddingVertical: 0,
    margin: 0,
  },
  partDimRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dimInputCard: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dimInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  dimInputText: {
    flex: 1,
    paddingVertical: 2,
    margin: 0,
  },

  // Add part button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },

  // Warning box (unfit parts)
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  // Sheet diagram card
  sheetCard: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },

  // Share PDF button
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
});
