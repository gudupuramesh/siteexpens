import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

// ── Material Categories for Interior Fitout ──

export type MaterialCategory =
  | 'plywood'
  | 'laminate'
  | 'hardware'
  | 'paint'
  | 'adhesive'
  | 'glass'
  | 'electrical'
  | 'plumbing'
  | 'tiles_stone'
  | 'cement_sand'
  | 'other';

export type CategoryConfig = {
  key: MaterialCategory;
  label: string;
  icon: string;
  color: string;
  fields: CategoryField[];
  defaultUnit: string;
};

export type CategoryField = {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'chips';
  options?: string[]; // for chips type
};

export const MATERIAL_CATEGORIES: CategoryConfig[] = [
  {
    key: 'plywood',
    label: 'Plywood',
    icon: 'layers-outline',
    color: '#92400e',
    defaultUnit: 'sqft',
    fields: [
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Greenply, Century, Kitply', type: 'text' },
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['BWR', 'MR', 'Commercial', 'Marine', 'Flush Door'] },
      { key: 'make', label: 'Thickness', placeholder: '', type: 'chips', options: ['4mm', '6mm', '8mm', '12mm', '16mm', '18mm', '19mm', '25mm'] },
      { key: 'size', label: 'Size', placeholder: '', type: 'chips', options: ['8x4 ft', '7x4 ft', '6x4 ft', '6x3 ft'] },
    ],
  },
  {
    key: 'laminate',
    label: 'Laminate',
    icon: 'color-palette-outline',
    color: '#7c3aed',
    defaultUnit: 'sqft',
    fields: [
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Merino, Greenlam, Century', type: 'text' },
      { key: 'variety', label: 'Code', placeholder: 'e.g. 22003 RGL', type: 'text' },
      { key: 'make', label: 'Finish', placeholder: '', type: 'chips', options: ['Matte', 'Gloss', 'Suede', 'Texture', 'Satin', 'Anti-Finger'] },
      { key: 'size', label: 'Thickness', placeholder: '', type: 'chips', options: ['0.8mm', '1mm', '1.25mm', '1.5mm'] },
    ],
  },
  {
    key: 'hardware',
    label: 'Hardware',
    icon: 'construct-outline',
    color: '#475569',
    defaultUnit: 'pcs',
    fields: [
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['Hinge', 'Channel', 'Handle', 'Lock', 'Knob', 'Drawer Slide', 'Aldrop', 'Tower Bolt', 'Magnet', 'Soft Close'] },
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Hettich, Hafele, Ebco', type: 'text' },
      { key: 'make', label: 'Finish', placeholder: '', type: 'chips', options: ['SS', 'Brass', 'Chrome', 'Black', 'Antique', 'Rose Gold', 'PVD'] },
      { key: 'size', label: 'Size', placeholder: 'e.g. 4 inch, 18 inch, 450mm', type: 'text' },
    ],
  },
  {
    key: 'paint',
    label: 'Paint',
    icon: 'brush-outline',
    color: '#0891b2',
    defaultUnit: 'litres',
    fields: [
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Asian Paints, Berger, Dulux', type: 'text' },
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['Emulsion', 'Enamel', 'Primer', 'Putty', 'POP', 'Wood Finish', 'Sealer', 'Thinner'] },
      { key: 'make', label: 'Finish', placeholder: '', type: 'chips', options: ['Matt', 'Satin', 'Gloss', 'Semi-Gloss'] },
      { key: 'size', label: 'Color / Shade', placeholder: 'e.g. White, L123, Custom', type: 'text' },
    ],
  },
  {
    key: 'adhesive',
    label: 'Adhesive',
    icon: 'flask-outline',
    color: '#ca8a04',
    defaultUnit: 'kg',
    fields: [
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Fevicol, Pidilite, Araldite', type: 'text' },
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['Fevicol SH', 'Fevicol Marine', 'Dendrite', 'Silicon', 'Epoxy', 'Wood Glue', 'Contact Adhesive'] },
      { key: 'size', label: 'Pack Size', placeholder: 'e.g. 1kg, 5kg, 50kg', type: 'text' },
    ],
  },
  {
    key: 'glass',
    label: 'Glass',
    icon: 'grid-outline',
    color: '#0ea5e9',
    defaultUnit: 'sqft',
    fields: [
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['Plain', 'Toughened', 'Frosted', 'Mirror', 'Tinted', 'Lacquered', 'Etched'] },
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Saint Gobain, Asahi, Modi', type: 'text' },
      { key: 'make', label: 'Thickness', placeholder: '', type: 'chips', options: ['4mm', '5mm', '6mm', '8mm', '10mm', '12mm'] },
      { key: 'size', label: 'Size', placeholder: 'e.g. Custom, 8x4 ft', type: 'text' },
    ],
  },
  {
    key: 'electrical',
    label: 'Electrical',
    icon: 'flash-outline',
    color: '#dc2626',
    defaultUnit: 'pcs',
    fields: [
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['Wire', 'Switch', 'Socket', 'Light', 'Fan', 'MCB', 'DB Box', 'Conduit', 'LED Strip', 'Downlight'] },
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Havells, Polycab, Legrand', type: 'text' },
      { key: 'make', label: 'Specification', placeholder: 'e.g. 1.5 sqmm, 6A, 10W', type: 'text' },
      { key: 'size', label: 'Color / Model', placeholder: 'e.g. White, Warm White', type: 'text' },
    ],
  },
  {
    key: 'plumbing',
    label: 'Plumbing',
    icon: 'water-outline',
    color: '#2563eb',
    defaultUnit: 'pcs',
    fields: [
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['Pipe', 'Fitting', 'Tap', 'Shower', 'WC', 'Basin', 'Drain', 'Valve', 'Geyser'] },
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Jaquar, Kohler, Astral', type: 'text' },
      { key: 'make', label: 'Material', placeholder: '', type: 'chips', options: ['CPVC', 'PVC', 'GI', 'SS', 'Brass', 'Chrome'] },
      { key: 'size', label: 'Size', placeholder: 'e.g. 15mm, 20mm, ½ inch', type: 'text' },
    ],
  },
  {
    key: 'tiles_stone',
    label: 'Tiles & Stone',
    icon: 'apps-outline',
    color: '#059669',
    defaultUnit: 'sqft',
    fields: [
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['Floor Tile', 'Wall Tile', 'Vitrified', 'Ceramic', 'Granite', 'Marble', 'Quartz', 'Mosaic'] },
      { key: 'brand', label: 'Brand', placeholder: 'e.g. Kajaria, Somany, RAK', type: 'text' },
      { key: 'size', label: 'Size', placeholder: '', type: 'chips', options: ['1x1 ft', '2x1 ft', '2x2 ft', '4x2 ft', '4x4 ft', 'Custom'] },
      { key: 'make', label: 'Finish', placeholder: '', type: 'chips', options: ['Glossy', 'Matt', 'Satin', 'Polished', 'Honed', 'Rustic'] },
    ],
  },
  {
    key: 'cement_sand',
    label: 'Cement & Sand',
    icon: 'cube-outline',
    color: '#78716c',
    defaultUnit: 'bags',
    fields: [
      { key: 'variety', label: 'Type', placeholder: '', type: 'chips', options: ['Cement', 'Sand', 'Aggregate', 'Ready Mix', 'White Cement', 'Tile Adhesive'] },
      { key: 'brand', label: 'Brand', placeholder: 'e.g. UltraTech, ACC, Ambuja', type: 'text' },
      { key: 'make', label: 'Grade', placeholder: '', type: 'chips', options: ['OPC 43', 'OPC 53', 'PPC', 'PSC', 'M Sand', 'River Sand'] },
      { key: 'size', label: 'Pack Size', placeholder: 'e.g. 50kg, 1 CFT', type: 'text' },
    ],
  },
  {
    key: 'other',
    label: 'Other',
    icon: 'ellipsis-horizontal-outline',
    color: '#6b7280',
    defaultUnit: 'pcs',
    fields: [
      { key: 'brand', label: 'Brand', placeholder: 'Brand name', type: 'text' },
      { key: 'variety', label: 'Variety', placeholder: 'Type or variety', type: 'text' },
      { key: 'make', label: 'Make', placeholder: 'Make or specification', type: 'text' },
      { key: 'size', label: 'Size', placeholder: 'Size or dimension', type: 'text' },
    ],
  },
];

export function getCategoryConfig(key: MaterialCategory): CategoryConfig {
  return MATERIAL_CATEGORIES.find((c) => c.key === key) ?? MATERIAL_CATEGORIES[MATERIAL_CATEGORIES.length - 1];
}

// ── Material Library Item ──

export type MaterialLibraryItem = {
  id: string;
  orgId: string;
  category: MaterialCategory;
  name: string;
  brand: string;
  variety: string;
  make: string;
  size: string;
  unit: string;
  defaultRate?: number;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
};
