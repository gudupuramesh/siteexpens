/**
 * `submitFeedback` — orchestrates the feedback submission pipeline:
 *
 *   1. Upload each screenshot to R2 (in parallel) — produces stable
 *      public URLs we save on the doc.
 *   2. Write the `feedback/{id}` Firestore doc with all fields and
 *      server timestamps.
 *
 * Errors at any step throw — the caller catches once, surfaces a
 * toast, and lets the user retry. We deliberately do NOT do partial
 * writes: if even one screenshot upload fails, no feedback doc is
 * created. That keeps the admin inbox clean (no half-uploaded reports
 * with missing context).
 *
 * Callers: `app/(app)/feedback.tsx`. The helper is pure so it can be
 * unit-tested without mounting the screen.
 */
import { db, firestore } from '@/src/lib/firebase';
import { guessImageMimeType, uploadToR2 } from '@/src/lib/r2Upload';

import type {
  Feedback,
  FeedbackDeviceInfo,
  FeedbackModuleKey,
  FeedbackScreenshot,
  FeedbackType,
} from './types';

export type SubmitFeedbackArgs = {
  type: FeedbackType;
  module: FeedbackModuleKey;
  /** Free-text label when `module === 'other'`. Trimmed by caller. */
  moduleCustom: string;
  /** Trimmed by caller. */
  description: string;
  /** Local URIs from expo-image-picker (or camera). Empty array OK. */
  screenshotUris: string[];
  /** Auth + org context — caller pulls these from the active session. */
  userId: string;
  userPhone: string;
  userDisplayName: string;
  userRole: string;
  orgId: string | null;
  orgName: string | null;
  device: FeedbackDeviceInfo;
};

export type SubmitFeedbackResult = {
  /** New `feedback/{id}` document id. */
  id: string;
  /** Number of screenshots successfully uploaded (== screenshotUris.length on success). */
  uploaded: number;
};

/** Hard cap matches the form UI. Server side has no enforcement —
 *  Firestore doc-size limit catches anything pathological. */
const MAX_SCREENSHOTS = 4;
/** Description cap. Plenty for any real feedback; protects against
 *  someone pasting their entire diary. */
const MAX_DESCRIPTION = 4000;

export async function submitFeedback(
  args: SubmitFeedbackArgs,
): Promise<SubmitFeedbackResult> {
  if (!args.userId) throw new Error('Sign in required to submit feedback.');
  if (!args.description.trim()) throw new Error('Please describe your feedback.');
  if (args.description.length > MAX_DESCRIPTION) {
    throw new Error(`Please keep feedback under ${MAX_DESCRIPTION} characters.`);
  }
  if (args.screenshotUris.length > MAX_SCREENSHOTS) {
    throw new Error(`Please attach at most ${MAX_SCREENSHOTS} screenshots.`);
  }
  if (args.module === 'other' && !args.moduleCustom.trim()) {
    throw new Error('Please describe which screen this is about.');
  }

  // Pre-mint the doc id so screenshot R2 paths can reference it. We
  // upload BEFORE writing the doc, which means a failed upload leaves
  // no Firestore record (cleaner inbox). The R2 objects from a
  // partially-failed batch get garbage-collected by the bucket's
  // lifecycle policy (orphans aren't a security concern — refId is
  // a one-time uuid, not user-guessable).
  const docRef = db.collection('feedback').doc();
  const refId = docRef.id;

  // Upload screenshots in parallel. Any single failure rejects the
  // whole Promise.all and the caller surfaces the error — we never
  // create a feedback doc with a missing image.
  const screenshots: FeedbackScreenshot[] = await Promise.all(
    args.screenshotUris.map(async (uri) => {
      const result = await uploadToR2({
        localUri: uri,
        contentType: guessImageMimeType(uri),
        kind: 'feedback_screenshot',
        refId,
        // No projectId — feedback isn't billed against any project's
        // storage tile. The bucket-level total is captured by R2's own
        // metrics for cost monitoring.
      });
      return {
        publicUrl: result.publicUrl,
        r2Key: result.key,
        sizeBytes: result.sizeBytes,
      };
    }),
  );

  // Build the doc. `status='open'`, server timestamps inline.
  const doc: Omit<Feedback, 'id'> = {
    type: args.type,
    module: args.module,
    moduleCustom: args.module === 'other' ? args.moduleCustom.trim() : '',
    description: args.description.trim(),
    screenshots,
    device: args.device,
    orgId: args.orgId,
    orgName: args.orgName,
    userId: args.userId,
    userPhone: args.userPhone,
    userDisplayName: args.userDisplayName,
    userRole: args.userRole,
    status: 'open',
    createdAt: firestore.FieldValue.serverTimestamp() as never,
    updatedAt: firestore.FieldValue.serverTimestamp() as never,
  };

  await docRef.set(doc);

  return { id: refId, uploaded: screenshots.length };
}
