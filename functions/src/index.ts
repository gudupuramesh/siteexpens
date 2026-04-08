/**
 * SiteExpens Cloud Functions entry point.
 *
 * Phase 1 only ships a hello-world callable so we can verify that the
 * Firebase deploy pipeline works end-to-end. Real functions land in
 * follow-up PRs:
 *   - inviteMember     (callable)  — resolve phone number to user, add to project
 *   - onUserCreated    (auth trig) — reconcile pending invites after signup
 *   - r2PresignedUrl   (callable)  — mint Cloudflare R2 upload/download URLs
 */
import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';

initializeApp();

export const helloWorld = onCall((_request) => {
  return { ok: true, message: 'SiteExpens functions are live.' };
});
