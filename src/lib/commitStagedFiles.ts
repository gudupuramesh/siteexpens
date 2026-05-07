/**
 * commitStagedFiles — runs `uploadToR2` for an array of staged local
 * files in parallel, partitioning the results into successes and
 * failures so the caller can:
 *   - persist the successful URLs to Firestore
 *   - show a "X of Y failed, retry?" banner for the rest
 *   - never block the user when some uploads fail (per the agreed
 *     "save what succeeded" partial-fail policy)
 *
 * Used during a screen's Save handler — pick callbacks just stage
 * files locally; the network only happens here.
 *
 * Usage pattern:
 *   const { uploaded, failed } = await commitStagedFiles({
 *     files: staged,
 *     kind: 'design',
 *     refId: projectId,
 *     compress: 'balanced',
 *     onProgress: (done, total) => setSaveProgress({ done, total }),
 *   });
 *   if (uploaded.length === 0) {
 *     setSaveError('All uploads failed. Check connection and retry.');
 *     return;
 *   }
 *   await createX({ ..., photoUrls: uploaded.map(u => u.publicUrl) });
 *   if (failed.length > 0) setSaveWarning(`${failed.length} files failed.`);
 */
import {
  uploadToR2,
  type R2Kind,
} from './r2Upload';
import type { CompressionPreset } from './imageCompression';

/** Bare metadata captured at pick time. No R2 fields here — those
 *  appear only after `commitStagedFiles` settles. */
export type StagedFile = {
  /** Stable id used to match before/after across UI updates and
   *  retries — typically `${Date.now()}-${random}`. */
  id: string;
  localUri: string;
  contentType: string;
  /** Original filename when known (PDFs always have one). */
  name?: string;
};

export type CommitOk = {
  /** Same id as the staged file — caller can map back to render
   *  state. */
  id: string;
  publicUrl: string;
  key: string;
  sizeBytes: number;
  contentType: string;
  name?: string;
};

export type CommitFail = {
  id: string;
  error: string;
  /** The original staged file — handed back so retry flows can
   *  re-queue it without rebuilding the entry. */
  file: StagedFile;
};

export type CommitArgs = {
  files: StagedFile[];
  kind: R2Kind;
  refId: string;
  /** Optional. When set, `uploadToR2` fires `recordStorageEvent`
   *  itself per successful upload. Pass for screens where the parent
   *  doc id already exists (edit flows, design new-version). For
   *  new-doc flows (add-design, add-task etc), omit this and have
   *  the caller fire the storage events manually after the createX()
   *  call returns the new id. */
  projectId?: string;
  /** Compression preset for image uploads. Default `'balanced'`.
   *  Pass `false` for non-image flows (PDFs, raw uploads). The
   *  helper just forwards this — `uploadToR2` decides per-file
   *  whether to actually compress (PDFs are skipped automatically
   *  even when a preset is provided). */
  compress?: CompressionPreset | false;
  /** Called each time one upload settles — both for successes and
   *  failures. The UI can show "Uploading 3 of 5…". */
  onProgress?: (done: number, total: number) => void;
};

export type CommitResult = {
  uploaded: CommitOk[];
  failed: CommitFail[];
};

export async function commitStagedFiles(args: CommitArgs): Promise<CommitResult> {
  const { files, kind, refId, projectId, onProgress } = args;
  const compress = args.compress === undefined ? 'balanced' : args.compress;

  if (files.length === 0) {
    return { uploaded: [], failed: [] };
  }

  let done = 0;
  const total = files.length;
  // Notify "0 of N" before any work starts so the UI can render the
  // progress label immediately.
  onProgress?.(done, total);

  // Promise.allSettled — never reject. Each file's outcome is
  // independent; one failure must not abort the others.
  const settled = await Promise.allSettled(
    files.map(async (f) => {
      try {
        const out = await uploadToR2({
          localUri: f.localUri,
          contentType: f.contentType,
          kind,
          refId,
          projectId,
          compress,
        });
        return { id: f.id, out };
      } finally {
        done += 1;
        onProgress?.(done, total);
      }
    }),
  );

  const uploaded: CommitOk[] = [];
  const failed: CommitFail[] = [];

  settled.forEach((result, i) => {
    const file = files[i];
    if (result.status === 'fulfilled') {
      const { out } = result.value;
      uploaded.push({
        id: file.id,
        publicUrl: out.publicUrl,
        key: out.key,
        sizeBytes: out.sizeBytes,
        contentType: out.contentType,
        name: file.name,
      });
    } else {
      const reason = result.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      failed.push({ id: file.id, error: msg, file });
    }
  });

  return { uploaded, failed };
}

/** Convenience used by image pickers — stages a single picked asset
 *  with a stable id. */
export function makeStagedFile(args: {
  localUri: string;
  contentType: string;
  name?: string;
}): StagedFile {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...args,
  };
}
