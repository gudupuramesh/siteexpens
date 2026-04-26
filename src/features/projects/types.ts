/**
 * Project = a single interior-fitout / construction engagement the firm
 * is executing. Lives as a root-level Firestore document so multiple
 * members of the same org can collaborate on it. `memberIds` is the
 * access list used by Firestore rules; for Phase 1 it equals the org's
 * memberIds at the moment of creation.
 *
 * v2: extended with InteriorOS-style metadata (client / typology / status
 * picker / manual progress / team size). All new fields are optional so
 * existing Firestore docs continue to load without migration.
 */
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived';

/** Top-level typology — lifted from the InteriorOS prototype. */
export type ProjectTypology =
  | 'residential'
  | 'commercial'
  | 'hospitality'
  | 'industrial'
  | 'other';

export const PROJECT_TYPOLOGIES: { key: ProjectTypology; label: string }[] = [
  { key: 'residential', label: 'Residential' },
  { key: 'commercial',  label: 'Commercial' },
  { key: 'hospitality', label: 'Hospitality' },
  { key: 'industrial',  label: 'Industrial' },
  { key: 'other',       label: 'Other' },
];

export const PROJECT_STATUS_OPTIONS: { key: ProjectStatus; label: string }[] = [
  { key: 'active',    label: 'Active' },
  { key: 'on_hold',   label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived',  label: 'Archived' },
];

/**
 * Sub-type options grouped by typology. The `'other'` key is special —
 * picking it switches the form to a free-text input so the user can
 * describe a sub-type that's not in the curated list.
 */
export const PROJECT_SUB_TYPES: Record<ProjectTypology, { key: string; label: string }[]> = {
  residential: [
    { key: '1bhk',      label: '1BHK' },
    { key: '2bhk',      label: '2BHK' },
    { key: '3bhk',      label: '3BHK' },
    { key: '4bhk',      label: '4BHK' },
    { key: '5bhk_plus', label: '5BHK+' },
    { key: 'villa',     label: 'Villa' },
    { key: 'penthouse', label: 'Penthouse' },
    { key: 'duplex',    label: 'Duplex' },
    { key: 'studio',    label: 'Studio' },
    { key: 'other',     label: 'Other' },
  ],
  commercial: [
    { key: 'office',    label: 'Office' },
    { key: 'retail',    label: 'Retail' },
    { key: 'showroom',  label: 'Showroom' },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'coworking', label: 'Co-working' },
    { key: 'other',     label: 'Other' },
  ],
  hospitality: [
    { key: 'cafe',       label: 'Café' },
    { key: 'restaurant', label: 'Restaurant' },
    { key: 'hotel',      label: 'Hotel' },
    { key: 'bar',        label: 'Bar / Lounge' },
    { key: 'banquet',    label: 'Banquet' },
    { key: 'other',      label: 'Other' },
  ],
  industrial: [
    { key: 'factory',   label: 'Factory' },
    { key: 'warehouse', label: 'Warehouse' },
    { key: 'lab',       label: 'Lab' },
    { key: 'other',     label: 'Other' },
  ],
  other: [
    { key: 'other', label: 'Other' },
  ],
};

export type Project = {
  id: string;
  orgId: string;
  name: string;
  startDate: FirebaseFirestoreTypes.Timestamp | null;
  endDate: FirebaseFirestoreTypes.Timestamp | null;
  siteAddress: string;
  /** Project value in whole rupees (₹). */
  value: number;
  /** Local device URI for Phase 1. Will be replaced by an R2 URL once
   *  the presigned-upload Cloud Function lands. */
  photoUri: string | null;
  status: ProjectStatus;
  ownerId: string;
  memberIds: string[];
  /** UIDs who can approve material requests (in addition to ownerId). */
  approverIds?: string[];
  createdAt: FirebaseFirestoreTypes.Timestamp | null;

  // ── InteriorOS metadata (all optional) ─────────────────────────
  /** Free-text client / primary stakeholder name. */
  client?: string;
  /** Optional link to a Party doc (so we can hop to the party screen). */
  clientPartyId?: string;
  /** Short locality / city — separate from full siteAddress. */
  location?: string;
  /** Top-level typology. */
  typology?: ProjectTypology;
  /** Free-text sub-type, e.g. "4BHK Villa", "Studio Office". */
  subType?: string;
  /** Manual progress override (0–100). When set, takes precedence over
   *  derived task progress shown in OverviewTab. */
  progress?: number;
  /** Team size (number of people on this project). */
  team?: number;
};
