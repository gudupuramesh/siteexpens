/**
 * Files (legacy collection name "designs") CRUD.
 *
 * One file per entry. No subcollection. Three operations:
 *   - createDesign : insert a new entry
 *   - updateDesign : rename / recategorise / replace the file
 *   - deleteDesign : remove the entry (caller cleans the R2 key)
 *
 * Firestore reads + writes are gated by org-membership rules; the
 * shape requires `orgId` + `projectId` on every doc.
 */
import { firestore } from '@/src/lib/firebase';

import { db } from '@/src/lib/firebase';
import type { DesignFilePayload, FileCategory } from './types';

// ── createDesign ─────────────────────────────────────────────────────

export type CreateDesignInput = {
  orgId: string;
  projectId: string;
  title: string;
  description?: string;
  category: FileCategory;
  /** The single uploaded file. Caller has already pushed it to R2
   *  via commitStagedFiles before calling this. */
  file: DesignFilePayload;
  createdBy: string;
  createdByName?: string;
};

/** Create a new files entry. One Firestore write, no subcollection.
 *  Returns the new design id. */
export async function createDesign(input: CreateDesignInput): Promise<string> {
  const designRef = db.collection('designs').doc();
  const now = firestore.FieldValue.serverTimestamp();

  const designDoc: Record<string, unknown> = {
    orgId: input.orgId,
    projectId: input.projectId,
    title: input.title,
    category: input.category,
    fileUrl: input.file.url,
    fileKey: input.file.key,
    fileContentType: input.file.contentType,
    fileSizeBytes: input.file.sizeBytes,
    thumbnailUrl: input.file.contentType.startsWith('image/') ? input.file.url : null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  if (input.description) designDoc.description = input.description;
  if (input.file.name) designDoc.fileName = input.file.name;
  if (input.createdByName) designDoc.createdByName = input.createdByName;

  await designRef.set(designDoc);
  return designRef.id;
}

// ── updateDesign ─────────────────────────────────────────────────────

export type UpdateDesignInput = {
  title?: string;
  description?: string;
  category?: FileCategory;
  /** Optional new file. When set, overwrites every file-* field
   *  on the doc and updates the thumbnail. The OLD R2 key is the
   *  caller's responsibility to delete (use deleteR2Object after
   *  this resolves). */
  file?: DesignFilePayload;
};

/** Update an existing files entry. Always bumps `updatedAt`. */
export async function updateDesign(
  designId: string,
  input: UpdateDesignInput,
): Promise<void> {
  const designRef = db.collection('designs').doc(designId);
  const patch: Record<string, unknown> = {
    updatedAt: firestore.FieldValue.serverTimestamp(),
  };
  if (input.title !== undefined) patch.title = input.title;
  if (input.category !== undefined) patch.category = input.category;
  if (input.description !== undefined) {
    // Allow clearing back to empty by sending '' — Firestore stores
    // it as an empty string. Use FieldValue.delete() if we ever want
    // a true "remove field" behaviour.
    patch.description = input.description;
  }
  if (input.file) {
    patch.fileUrl = input.file.url;
    patch.fileKey = input.file.key;
    patch.fileContentType = input.file.contentType;
    patch.fileSizeBytes = input.file.sizeBytes;
    patch.fileName = input.file.name ?? firestore.FieldValue.delete();
    patch.thumbnailUrl = input.file.contentType.startsWith('image/')
      ? input.file.url
      : null;
  }
  await designRef.update(patch);
}

// ── deleteDesign ─────────────────────────────────────────────────────

/** Delete a files entry. Single-doc delete (no subcollection cascade
 *  in the new model). Caller must remove the R2 object via
 *  deleteR2Object(); see Design detail screen for the pattern. */
export async function deleteDesign(designId: string): Promise<void> {
  await db.collection('designs').doc(designId).delete();
}
