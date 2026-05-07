/**
 * R2 delete helper — wraps the `r2DeleteObject` Cloud Function.
 *
 * The Cloud Function:
 *   1. Verifies the caller is a member of the project's org.
 *   2. Issues a `DeleteObjectCommand` against R2.
 *   3. Records a `storageEvents` doc with `action: 'delete'` and
 *      decrements the project's running totals atomically.
 *
 * Best-effort by design — failures are logged but do not throw to
 * the caller. The replace-flow rule is "the new upload must succeed
 * for the user; cleanup of the old object can lag without blocking
 * UX". An orphan in R2 costs ~$0.015 per GB-month and can be swept
 * by a later reconciliation job.
 */
import { callFunction } from './firebase';
import type { R2Kind } from './r2Upload';

export type DeleteR2ObjectArgs = {
  projectId: string;
  key: string;
  kind: R2Kind;
  refId: string;
  /** Bytes of the object being deleted — used for the counter
   *  decrement. If unknown, the audit log still records the event. */
  sizeBytes?: number;
  /** MIME type — purely for audit clarity. */
  contentType?: string;
};

export async function deleteR2Object(args: DeleteR2ObjectArgs): Promise<void> {
  if (!args.projectId) throw new Error('deleteR2Object: projectId is required');
  if (!args.key) throw new Error('deleteR2Object: key is required');
  try {
    await callFunction<DeleteR2ObjectArgs, { ok: true }>('r2DeleteObject', args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[deleteR2Object] failed (${args.key}): ${msg}`);
    // Intentionally swallowed — see file header.
  }
}
