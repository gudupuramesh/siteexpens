/**
 * R2 upload helper — single entry point for putting a local file into
 * Cloudflare R2 and getting back a stable public URL to save in
 * Firestore.
 *
 * Flow on each call:
 *   1. Ask the `r2PresignedUploadUrl` Cloud Function for a 5-minute
 *      presigned PUT URL. The function never sends the R2 secret to
 *      the phone; it only mints short-lived URLs for the specific
 *      file we're about to upload.
 *   2. Read the local file from its `file://` URI as a Blob.
 *   3. PUT it directly to R2 using that presigned URL.
 *   4. Return the public URL the caller stores in their Firestore doc.
 *
 * Errors at any step throw with a descriptive message so the caller
 * can surface a sane toast / error banner.
 */
import { callFunction } from './firebase';
import {
  compressImage,
  DEFAULT_PRESET,
  type CompressionPreset,
} from './imageCompression';

/** Logical category of the upload — must match the allowlist on the
 *  server-side `r2PresignedUploadUrl` function. Adding a new one?
 *  Update both this union and `ALLOWED_KINDS` in `functions/src/r2.ts`. */
export type R2Kind =
  | 'project_cover'
  | 'task_photo'
  | 'task_update'
  | 'transaction'
  | 'laminate'
  | 'dpr'
  | 'whiteboard_thumb'
  // Design library uploads — PDFs, images. Each design has many
  // versions; every uploaded file is one R2 object under a design's
  // version folder.
  | 'design'
  | 'studio_cover'
  | 'studio_logo'
  // Screenshots attached to in-app feedback submissions. `refId` is the
  // pre-minted `feedback/{id}` document id so all images for one
  // submission live under one folder in the bucket — easier triage.
  | 'feedback_screenshot';

export type UploadToR2Args = {
  /** Local file URI (`file://...` from expo-image-picker / camera). */
  localUri: string;
  /** MIME type of the file (e.g. 'image/jpeg', 'application/pdf'). */
  contentType: string;
  /** Logical category — drives the storage path and validates the MIME. */
  kind: R2Kind;
  /** Owning entity id. Project id for project_cover, task id for
   *  task_photo, etc. Used as the second segment of the storage key
   *  so files are listable per entity. Must be alphanumeric / dash /
   *  underscore (matches the server-side regex). */
  refId: string;
  /** Compress the image first. Pass `false` to skip (e.g. PDFs).
   *  Default = balanced preset. */
  compress?: CompressionPreset | false;
  /** When provided, we record a storage event after the upload so the
   *  project's storage tile updates. Optional because the project-create
   *  flow records the event AFTER the project doc exists (caller does
   *  it manually then). */
  projectId?: string;
};

export type UploadToR2Result = {
  /** Stable public URL — save this to the Firestore doc. */
  publicUrl: string;
  /** Object key inside the bucket — store alongside `publicUrl` so
   *  delete-on-replace flows can remove the previous file. */
  key: string;
  /** Bytes actually uploaded to R2 (post-compression for images). */
  sizeBytes: number;
  /** Bytes of the original local file before compression. Equals
   *  `sizeBytes` when compression was skipped. */
  originalBytes: number;
  /** MIME type sent to R2 (always `image/jpeg` for compressed images;
   *  unchanged otherwise). */
  contentType: string;
};

type CallableResponse = {
  uploadUrl: string;
  key: string;
  publicUrl: string;
};

/** Upload a local file to R2. Throws on any failure.
 *
 *  Pipeline:
 *    1. (optional) compress image via expo-image-manipulator
 *    2. ask Cloud Function for a 5-min presigned PUT URL
 *    3. PUT the bytes to R2
 *    4. (optional) record a `storageEvents` doc + bump
 *       `projectStorage` totals via Cloud Function
 */
export async function uploadToR2(args: UploadToR2Args): Promise<UploadToR2Result> {
  const { localUri, kind, refId, projectId } = args;
  const compress = args.compress === undefined ? DEFAULT_PRESET : args.compress;

  if (!localUri) throw new Error('uploadToR2: localUri is required');
  if (!args.contentType) throw new Error('uploadToR2: contentType is required');
  if (!refId) throw new Error('uploadToR2: refId is required');

  // ── 1. Optional compression ───────────────────────────────────────
  // For images we re-encode + resize per the requested preset. For
  // PDFs / non-images, compressImage passes through unchanged.
  let uploadUri = localUri;
  let uploadContentType = args.contentType;
  let originalBytes = 0;
  let uploadedBytes = 0;

  if (compress !== false) {
    const compressed = await compressImage({
      uri: localUri,
      contentType: args.contentType,
      preset: compress,
    });
    uploadUri = compressed.uri;
    uploadContentType = compressed.contentType;
    originalBytes = compressed.originalBytes;
    uploadedBytes = compressed.sizeBytes;
    if (compressed.compressed) {
      console.log(
        `[r2Upload] compressed ${prettyKB(originalBytes)} → ${prettyKB(uploadedBytes)} (${kind})`,
      );
    }
  } else {
    // Compression skipped — still need the byte count for tracking.
    try {
      const probe = await fetch(localUri);
      const blob = await probe.blob();
      originalBytes = blob.size ?? 0;
      uploadedBytes = originalBytes;
    } catch { /* leave 0 — tracking will still work, just imprecise */ }
  }

  // ── 2. Mint a presigned URL via the Cloud Function ────────────────
  let presigned: CallableResponse;
  try {
    const result = await callFunction<
      { contentType: string; kind: R2Kind; refId: string },
      CallableResponse
    >('r2PresignedUploadUrl', {
      contentType: uploadContentType,
      kind,
      refId,
    });
    presigned = result.data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not get upload URL: ${msg}`);
  }

  if (!presigned?.uploadUrl || !presigned?.publicUrl) {
    throw new Error('Upload URL response was empty.');
  }

  // ── 3. Read the (possibly compressed) file as a Blob ──────────────
  let blob: Blob;
  try {
    const fileResp = await fetch(uploadUri);
    if (!fileResp.ok) {
      throw new Error(`HTTP ${fileResp.status} reading local file`);
    }
    blob = await fileResp.blob();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not read local file: ${msg}`);
  }

  // ── 4. PUT to R2 using the presigned URL ──────────────────────────
  let putResp: Response;
  try {
    putResp = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': uploadContentType },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Upload to R2 failed: ${msg}`);
  }

  if (!putResp.ok) {
    let body = '';
    try { body = await putResp.text(); } catch { /* ignore */ }
    throw new Error(
      `R2 rejected the upload (HTTP ${putResp.status}). ${body.slice(0, 200)}`,
    );
  }

  // ── 5. Record the storage event (best-effort, fire-and-forget) ────
  // Caller may omit projectId for the project-CREATE flow (the doc
  // doesn't exist yet) — they'll record the event manually after
  // createProject resolves. For all other flows projectId is known
  // up front and we record here.
  if (projectId) {
    void recordEventBestEffort({
      projectId,
      kind,
      refId,
      key: presigned.key,
      sizeBytes: uploadedBytes || (blob.size ?? 0),
      contentType: uploadContentType,
      action: 'upload',
    });
  }

  return {
    publicUrl: presigned.publicUrl,
    key: presigned.key,
    sizeBytes: uploadedBytes || (blob.size ?? 0),
    originalBytes,
    contentType: uploadContentType,
  };
}

/** Public helper exposed so callers (project create, replace flows)
 *  can record an event AFTER the parent doc id exists. The upload
 *  helper calls this internally when `projectId` was provided. */
export async function recordStorageEvent(args: {
  projectId: string;
  kind: R2Kind;
  refId: string;
  key: string;
  sizeBytes: number;
  contentType: string;
  action: 'upload' | 'delete';
}): Promise<void> {
  try {
    await callFunction<typeof args, { ok: true }>('recordStorageEvent', args);
  } catch (e) {
    // Tracking is best-effort: never block the user flow on a counter
    // update. Log so we can spot drift in development.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[recordStorageEvent] failed (${args.action} ${args.key}): ${msg}`);
  }
}

async function recordEventBestEffort(args: {
  projectId: string;
  kind: R2Kind;
  refId: string;
  key: string;
  sizeBytes: number;
  contentType: string;
  action: 'upload' | 'delete';
}): Promise<void> {
  return recordStorageEvent(args);
}

function prettyKB(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

/** Convenience helper for image pickers — derives the contentType
 *  from the URI's file extension when the picker doesn't surface it.
 *  Picker results from expo-image-picker DO include `mimeType` on
 *  recent versions, but older versions or document picks may not. */
export function guessImageMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png':  return 'image/png';
    case 'webp': return 'image/webp';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    case 'gif':  return 'image/gif';
    case 'pdf':  return 'application/pdf';
    default:     return 'image/jpeg'; // safest default for camera output
  }
}
