/**
 * Toolkit calculator tunables. Tweak these once and every module updates.
 *
 * If you find yourself wanting to override per-project (e.g. a particular
 * paint brand has different coverage), promote the value into a settings
 * doc later — until then, single source here.
 */

/** Litres of paint per square metre, single coat, standard latex emulsion.
 *  ~10 m²/L is the conservative middle of the typical 9–12 m²/L range
 *  manufacturers quote for a smooth interior wall. Adjust for primer
 *  coats / textured walls separately. */
export const PAINT_COVERAGE_M2_PER_LITER = 10;

/** Tile wastage — extra tiles to buy to cover cuts, breakage, future
 *  patching. 10% is the trade rule of thumb. */
export const TILE_WASTAGE_PCT = 0.10;

/** Standard plywood / laminate sheet (Indian market). 8 ft × 4 ft. */
export const PLYWOOD_SHEET_FT = { length: 8, width: 4 } as const;
export const PLYWOOD_SHEET_AREA_SQFT =
  PLYWOOD_SHEET_FT.length * PLYWOOD_SHEET_FT.width; // 32 sq ft

/** Length conversions — single source of truth for the unit converter. */
export const LENGTH = {
  ftToMm: 304.8,
  inToMm: 25.4,
  cmToMm: 10,
  mToMm: 1000,
} as const;

/** Area conversions. Gaj (Indian "square yard") = 9 sq ft. */
export const AREA = {
  sqftToSqm: 0.09290304,
  sqydToSqft: 9,
  sqydToSqm: 0.83612736,
} as const;

/** Golden ratio φ — used by the proportion calculator alongside the
 *  industry "60/30/10" interior split. */
export const PHI = 1.618033988749895;

// ────────────────────────────────────────────────────────────────────
// Lighting (lumens & colour temperature)
// ────────────────────────────────────────────────────────────────────

/** Recommended lux levels per room type (mid-range of IES recommendations
 *  adapted for Indian residential interiors). Lux = lumens per m². */
export type LightingRoom = {
  key: string;
  label: string;
  lux: number;
  /** Recommended colour temperature for the room (Kelvin). */
  k: number;
};

export const LIGHTING_ROOMS: LightingRoom[] = [
  { key: 'living',   label: 'Living Room',     lux: 200, k: 3000 },
  { key: 'bedroom',  label: 'Bedroom',         lux: 150, k: 2700 },
  { key: 'kitchen',  label: 'Kitchen',         lux: 350, k: 4000 },
  { key: 'bath',     label: 'Bathroom',        lux: 300, k: 4000 },
  { key: 'dining',   label: 'Dining',          lux: 200, k: 3000 },
  { key: 'office',   label: 'Office / Study',  lux: 450, k: 4000 },
  { key: 'kids',     label: 'Kids Room',       lux: 250, k: 3500 },
  { key: 'closet',   label: 'Walk-in Closet',  lux: 200, k: 3500 },
  { key: 'hallway',  label: 'Hallway',         lux: 100, k: 3000 },
  { key: 'balcony',  label: 'Balcony',         lux: 100, k: 3000 },
];

/** Colour temperature reference points (Kelvin → name + use case). */
export const COLOR_TEMPS = [
  { k: 2700, label: 'Warm White',     use: 'Bedrooms, living rooms — cosy and relaxing.' },
  { k: 3000, label: 'Soft White',     use: 'Dining, lounges — warm but a touch crisper.' },
  { k: 3500, label: 'Neutral',        use: 'Hallways, dressing rooms — balanced.' },
  { k: 4000, label: 'Cool White',     use: 'Kitchens, bathrooms — task-friendly.' },
  { k: 5000, label: 'Daylight',       use: 'Garages, workshops, utility areas.' },
  { k: 6500, label: 'Cool Daylight',  use: 'Offices, studios — high-alert work.' },
] as const;

// ────────────────────────────────────────────────────────────────────
// AC Tonnage
// ────────────────────────────────────────────────────────────────────

/** Standard residential split-AC sizes available in India (in tons).
 *  Used to round the calculated requirement up to the next available
 *  size — you don't buy a 1.27-ton AC. */
export const AC_TON_SIZES = [0.75, 1, 1.2, 1.5, 1.8, 2, 2.5, 3] as const;

/** Multipliers applied on top of the volume / 1000 base rule. */
export const AC_MULTIPLIERS = {
  topFloor: 1.10,        // direct sun on the slab adds load
  heavySunExposure: 1.15, // west/south facing with long exposure
} as const;

// ────────────────────────────────────────────────────────────────────
// Soft Finishes
// ────────────────────────────────────────────────────────────────────

/** Standard wallpaper roll dimensions (Indian market). 53 cm × 10 m
 *  is the European standard widely sold in India. */
export const WALLPAPER_ROLL_DEFAULT = {
  widthIn: 20.5,   // ≈ 53 cm
  lengthFt: 33,    // ≈ 10 m
} as const;

/** Standard curtain fabric roll width — most fabric in India is sold
 *  in 54" wide rolls. */
export const CURTAIN_ROLL_WIDTH_IN_DEFAULT = 54;

/** Hem & header allowance per drop, in inches (top + bottom combined). */
export const CURTAIN_HEM_ALLOWANCE_IN = 12;

/** Common fullness factors for curtain headers. */
export const CURTAIN_FULLNESS = [
  { value: 1.5, label: '1.5×',  desc: 'Tab top / rod pocket' },
  { value: 2,   label: '2×',    desc: 'Standard pleat / eyelet' },
  { value: 2.5, label: '2.5×',  desc: 'Pinch pleat (medium)' },
  { value: 3,   label: '3×',    desc: 'Pinch pleat (heavy / sheers)' },
] as const;
