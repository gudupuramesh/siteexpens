/**
 * Files library — single file per entry, with category + name.
 *
 * One row in the Files tab = one uploaded artefact (PDF, image,
 * layout, MOM, agreement, mood board…). The user gives it a name
 * ("Electrical Layout") and a category (2D / 3D / Layout / MOM /
 * Agreement / Other). To revise a file later they tap Edit on the
 * detail screen — they can rename it OR swap the file. There is no
 * version history.
 *
 * Doc lives at `designs/{designId}` (legacy collection name kept so
 * we don't have to touch rules / indexes / cloud functions). The
 * user-facing label is "Files".
 */
import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

/** Categories the user picks at upload time. Drives the chip filter
 *  on the Files tab and the small badge shown on each row.
 *
 *   - design_2d : 2D drawings, plans, elevations
 *   - design_3d : 3D renders, walkthroughs
 *   - layout    : Floor plans, room layouts, RCP
 *   - mom       : Minutes of meeting (Word, PDF, scans)
 *   - agreement : Contracts, BOQ, signed documents
 *   - other     : Anything else (mood boards, references, misc)
 */
export const FILE_CATEGORIES = [
  { key: 'design_2d', label: '2D' },
  { key: 'design_3d', label: '3D' },
  { key: 'layout',    label: 'Layout' },
  { key: 'mom',       label: 'MOM' },
  { key: 'agreement', label: 'Agreement' },
  { key: 'other',     label: 'Other' },
] as const;

export type FileCategory = (typeof FILE_CATEGORIES)[number]['key'];

export function getCategoryLabel(key: FileCategory | undefined): string {
  return FILE_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other';
}

/** The single file inside a Design entry. Inlined onto the parent
 *  doc — no subcollection. Re-used by the create/update payloads. */
export type DesignFilePayload = {
  /** Public R2 URL — what the app renders / opens. */
  url: string;
  /** R2 object key — used to delete the file later (replace + delete). */
  key: string;
  /** MIME type, e.g. 'image/jpeg' or 'application/pdf'. */
  contentType: string;
  /** Size in bytes (post-compression for images). */
  sizeBytes: number;
  /** Original file name from the picker, when available. */
  name?: string;
};

/** Top-level files entry. Lives at `designs/{designId}`. */
export type Design = {
  id: string;
  orgId: string;
  projectId: string;
  /** Free-text name shown on the list + detail. Searchable; users
   *  type something like "Master Bedroom Electrical Layout". */
  title: string;
  /** Optional scope / brief note. */
  description?: string;
  /** Category for filtering in the Files tab. Required for new
   *  entries — older docs (none, since we wiped them) default to
   *  'other' on display. */
  category: FileCategory;
  // ── The single file (inline) ─────────────────────────────────
  fileUrl: string;
  fileKey: string;
  fileContentType: string;
  fileSizeBytes: number;
  fileName?: string;
  // ── Convenience for list rows ────────────────────────────────
  /** Same as fileUrl when the file is an image; null for PDFs.
   *  Lets the row renderer skip a contentType check on every
   *  render. */
  thumbnailUrl?: string | null;
  // ── Audit ────────────────────────────────────────────────────
  createdBy: string;
  createdByName?: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};
