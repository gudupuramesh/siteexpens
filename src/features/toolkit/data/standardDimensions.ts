/**
 * Standard interior-design measurements — the "I always forget the
 * exact number" cheat sheet. Sourced from common trade references
 * (NID syllabus, Time-Saver Standards, Neufert).
 *
 * Values are kept as human-readable strings (with both metric + imperial)
 * because the cheat sheet is a reference, not a calculation input.
 */
export type StandardDimension = {
  id: string;
  label: string;
  value: string;
  note?: string;
};

export type DimensionGroup = {
  id: string;
  title: string;
  items: StandardDimension[];
};

export const DIMENSION_GROUPS: DimensionGroup[] = [
  {
    id: 'kitchen',
    title: 'Kitchen',
    items: [
      { id: 'k1', label: 'Counter height', value: '34–36" (860–910 mm)', note: 'Comfortable for users 5\'4" – 5\'10".' },
      { id: 'k2', label: 'Counter depth', value: '24–25" (610–635 mm)' },
      { id: 'k3', label: 'Backsplash height', value: '15–18" (380–460 mm)', note: 'Counter to underside of upper cabinet.' },
      { id: 'k4', label: 'Upper cabinet depth', value: '12" (305 mm)' },
      { id: 'k5', label: 'Island clearance', value: '42–48" (1070–1220 mm)', note: 'Walkway around island for one cook.' },
      { id: 'k6', label: 'Hood above stove', value: '30–36" (760–910 mm)' },
    ],
  },
  {
    id: 'dining',
    title: 'Dining & Living',
    items: [
      { id: 'd1', label: 'Chandelier above table', value: '30–36" (760–910 mm)', note: 'Bottom of fixture above tabletop.' },
      { id: 'd2', label: 'Dining table height', value: '28–30" (710–760 mm)' },
      { id: 'd3', label: 'Dining chair seat height', value: '17–19" (430–480 mm)' },
      { id: 'd4', label: 'Coffee table height', value: '16–18" (405–460 mm)', note: 'Roughly equal to sofa seat height.' },
      { id: 'd5', label: 'Sofa seat height', value: '17–18" (430–460 mm)' },
      { id: 'd6', label: 'TV viewing distance', value: '1.5–2.5 × screen diagonal', note: 'e.g. 55" TV → 7–11 ft (2.1–3.4 m).' },
      { id: 'd7', label: 'TV mount height', value: '42" to centre (1070 mm)', note: 'Eye level when seated.' },
    ],
  },
  {
    id: 'bedroom',
    title: 'Bedroom & Wardrobe',
    items: [
      { id: 'b1', label: 'Wardrobe depth', value: '24" (610 mm)', note: 'Hanging clearance for shoulders.' },
      { id: 'b2', label: 'Wardrobe shutter width', value: '18–24" (450–600 mm)' },
      { id: 'b3', label: 'Hanger rod height (shirts)', value: '42" (1065 mm)' },
      { id: 'b4', label: 'Hanger rod height (long)', value: '66" (1675 mm)' },
      { id: 'b5', label: 'Bedside table height', value: '24–28" (610–710 mm)', note: 'Match the mattress top.' },
      { id: 'b6', label: 'Bed circulation gap', value: 'Min 24" (610 mm)', note: 'Both sides of a double bed.' },
    ],
  },
  {
    id: 'bath',
    title: 'Bathroom',
    items: [
      { id: 'ba1', label: 'Vanity height', value: '32–36" (810–910 mm)' },
      { id: 'ba2', label: 'Mirror above vanity', value: '5–10" (130–250 mm)', note: 'Above the counter top.' },
      { id: 'ba3', label: 'Towel bar height', value: '48" (1220 mm)' },
      { id: 'ba4', label: 'WC clearance front', value: '21–24" (530–610 mm)' },
      { id: 'ba5', label: 'Shower head height', value: '80" (2030 mm)' },
    ],
  },
  {
    id: 'doors',
    title: 'Doors & Windows',
    items: [
      { id: 'do1', label: 'Internal door', value: '32–36" × 80" (810–915 × 2030 mm)' },
      { id: 'do2', label: 'Main door', value: '36–42" × 84" (915–1065 × 2130 mm)' },
      { id: 'do3', label: 'Window sill height', value: '36" (915 mm)', note: 'From finished floor.' },
      { id: 'do4', label: 'Window head height', value: '84" (2130 mm)' },
      { id: 'do5', label: 'Switch board height', value: '48" (1220 mm)' },
      { id: 'do6', label: 'Power socket height', value: '12–18" (305–460 mm)' },
    ],
  },
  {
    id: 'circulation',
    title: 'Circulation & Stairs',
    items: [
      { id: 'c1', label: 'Hallway width', value: 'Min 36" (915 mm)', note: '42" (1070 mm) preferred.' },
      { id: 'c2', label: 'Stair tread (going)', value: '10–11" (250–280 mm)' },
      { id: 'c3', label: 'Stair riser', value: '6–7.5" (150–190 mm)' },
      { id: 'c4', label: 'Handrail height', value: '34–38" (865–965 mm)' },
      { id: 'c5', label: 'Ceiling height (residential)', value: '9–10 ft (2.7–3.0 m)' },
    ],
  },
];
