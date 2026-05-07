/**
 * Cloudflare R2 — presigned upload URL minting.
 *
 * Architecture:
 *   Phone  → calls this callable (auth required)
 *           ← receives a 5-minute presigned PUT URL + key + publicUrl
 *   Phone  → uploads directly to R2 (the secret never leaves the server)
 *   Phone  → saves `publicUrl` to Firestore so any user can render it
 *
 * R2 is fully S3-compatible, so we use the standard AWS SDK pointed at
 * the jurisdiction-specific R2 endpoint. Every secret is wired through
 * Firebase Secret Manager — they're injected at runtime via
 * `runWith({ secrets: [...] })` and accessed with `.value()` inside the
 * handler. They are never read at module load time, never logged, never
 * stored in source.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';

import { buildR2Client } from './r2Client';
import { effectiveLimits } from './billing/limits';

// ── Secrets (resolved at runtime via Secret Manager) ────────────────
const R2_ACCOUNT_ID = defineSecret('R2_ACCOUNT_ID');
const R2_ACCESS_KEY_ID = defineSecret('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = defineSecret('R2_SECRET_ACCESS_KEY');
const R2_BUCKET_NAME = defineSecret('R2_BUCKET_NAME');
const R2_PUBLIC_BASE_URL = defineSecret('R2_PUBLIC_BASE_URL');

// ── Allowlists ──────────────────────────────────────────────────────
// `kind` drives the storage path so files for one entity stay together
// and don't dump into a flat namespace. Adding a new feature? Add it
// here AND on the app-side helper's `kind` union.
const ALLOWED_KINDS = [
  'project_cover',
  'task_photo',
  'task_update',
  'transaction',
  'laminate',
  'dpr',
  'whiteboard_thumb',
  'design',
  'studio_cover',
  'studio_logo',
  // Screenshots attached to feedback submissions — refId is the
  // pre-minted feedback doc id so all images for one submission share
  // a folder in the bucket.
  'feedback_screenshot',
] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

// We intentionally allow only image MIMEs and PDF (transaction
// receipts can be PDFs). Anything else is rejected — no .exe, no .zip,
// no surprises in the bucket.
const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_EXACT = ['application/pdf'];

const FIVE_MINUTES_SECONDS = 60 * 5;

type RequestPayload = {
  /** MIME type the phone is about to upload — drives Content-Type
   *  enforcement on the presigned URL. */
  contentType: string;
  /** Logical category — controls the storage path. */
  kind: Kind;
  /** Owning entity id (project id, task id, etc.) — second segment
   *  of the storage key so files are listable per entity. */
  refId: string;
  /** File extension without the dot (e.g. 'jpg'). Optional — derived
   *  from contentType if omitted. */
  ext?: string;
  /** Org the upload counts against — required for the storage paywall
   *  check. The client knows it from `userDoc.primaryOrgId`. Optional
   *  for back-compat with older clients; when missing, the cap check
   *  is skipped (uploads still work). */
  orgId?: string;
  /** Approximate upload size in bytes — measured by the client from
   *  the local file before this call. Used for the pre-upload cap
   *  check. Optional; without it we can only refuse uploads when the
   *  org is ALREADY over the cap. */
  estimatedBytes?: number;
};

type ResponsePayload = {
  /** 5-minute presigned PUT URL — the phone uploads directly here. */
  uploadUrl: string;
  /** Object key inside the bucket. Stored alongside publicUrl when the
   *  feature wants a stable handle for later delete/replace. */
  key: string;
  /** Stable public URL the phone saves to Firestore. */
  publicUrl: string;
};

/** Public callable. Always invoke with auth — anonymous calls are
 *  rejected. Returns a presigned PUT URL valid for 5 minutes. */
export const r2PresignedUploadUrl = onCall(
  {
    secrets: [
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      R2_PUBLIC_BASE_URL,
    ],
    // Cloud Functions v2 default timeout is 60s; presigning is a
    // hash-only operation that takes <100ms, so we don't need more.
    region: 'us-central1',
  },
  async (request): Promise<ResponsePayload> => {
    // ── 1. Auth gate ─────────────────────────────────────────────────
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Sign-in is required to upload files.',
      );
    }

    // ── 2. Validate input ────────────────────────────────────────────
    const data = request.data as Partial<RequestPayload> | undefined;
    if (!data) {
      throw new HttpsError('invalid-argument', 'Request body is missing.');
    }

    const { contentType, kind, refId } = data;

    if (typeof contentType !== 'string' || contentType.length === 0) {
      throw new HttpsError('invalid-argument', '`contentType` is required.');
    }
    const isAllowedMime =
      ALLOWED_MIME_PREFIXES.some((p) => contentType.startsWith(p)) ||
      ALLOWED_MIME_EXACT.includes(contentType);
    if (!isAllowedMime) {
      throw new HttpsError(
        'invalid-argument',
        `MIME type "${contentType}" not allowed. Use image/* or application/pdf.`,
      );
    }

    if (typeof kind !== 'string' || !ALLOWED_KINDS.includes(kind as Kind)) {
      throw new HttpsError(
        'invalid-argument',
        `\`kind\` must be one of: ${ALLOWED_KINDS.join(', ')}`,
      );
    }

    if (typeof refId !== 'string' || refId.length === 0 || refId.length > 128) {
      throw new HttpsError('invalid-argument', '`refId` is required.');
    }
    // Disallow path traversal characters and slashes in refId — it's
    // just an entity id, never a path fragment.
    if (!/^[A-Za-z0-9_-]+$/.test(refId)) {
      throw new HttpsError(
        'invalid-argument',
        '`refId` must be alphanumeric / underscore / dash only.',
      );
    }

    // ── 2.5 Plan paywall: storage cap check ──────────────────────────
    // Skipped when older clients don't pass orgId. Once the client
    // wrapper (`r2Upload.ts`) is updated to always include orgId, we
    // can make this required and tighten the gate.
    if (typeof data.orgId === 'string' && data.orgId.length > 0) {
      try {
        const db = getFirestore();
        const orgSnap = await db.collection('organizations').doc(data.orgId).get();
        if (orgSnap.exists) {
          const org = orgSnap.data() as Record<string, unknown>;
          const { tier, limits } = effectiveLimits(org);
          const counters =
            (org.counters as { storageBytes?: unknown } | undefined) ?? {};
          const currentBytes =
            typeof counters.storageBytes === 'number' ? counters.storageBytes : 0;
          const incomingBytes =
            typeof data.estimatedBytes === 'number' && data.estimatedBytes > 0
              ? data.estimatedBytes
              : 0;
          // Block when ALREADY over the cap (regardless of incoming
          // size) OR when this upload would push us over.
          if (
            currentBytes >= limits.maxStorageBytes ||
            currentBytes + incomingBytes > limits.maxStorageBytes
          ) {
            const fmt = (b: number) => {
              if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
              if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
              return `${b} bytes`;
            };
            throw new HttpsError(
              'failed-precondition',
              `Your ${tier} plan is limited to ${fmt(
                limits.maxStorageBytes,
              )} of storage. Upgrade or delete files to continue.`,
              {
                reason: 'plan_limit_storage',
                tier,
                limit: limits.maxStorageBytes,
                used: currentBytes,
              },
            );
          }
        }
      } catch (err) {
        // Re-throw HttpsError so the client gets the friendly paywall
        // code; swallow other errors so a Firestore hiccup doesn't
        // block uploads (the client retries via storage rollup).
        if (err instanceof HttpsError) throw err;
        console.warn('[r2PresignedUploadUrl] storage cap check failed:', err);
      }
    }

    // ── 3. Derive extension ──────────────────────────────────────────
    const ext = (data.ext ?? extFromMime(contentType)).replace(/[^A-Za-z0-9]/g, '').toLowerCase() || 'bin';

    // ── 4. Build the storage key ─────────────────────────────────────
    // Pattern: {kind}/{refId}/{uuid}.{ext}
    // - {kind} segregates by feature
    // - {refId} groups files for one entity (project / task / etc.)
    // - {uuid} guarantees uniqueness — overwriting existing keys would
    //   require a fresh presigned URL anyway
    const key = `${kind}/${refId}/${randomUUID()}.${ext}`;

    // ── 5. Build the presigned URL ───────────────────────────────────
    const accountId = R2_ACCOUNT_ID.value();
    const bucket = R2_BUCKET_NAME.value();
    const accessKeyId = R2_ACCESS_KEY_ID.value();
    const secretAccessKey = R2_SECRET_ACCESS_KEY.value();
    const publicBase = R2_PUBLIC_BASE_URL.value().replace(/\/+$/, '');

    const s3 = buildR2Client({ accountId, accessKeyId, secretAccessKey });

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: FIVE_MINUTES_SECONDS },
    );

    const publicUrl = `${publicBase}/${key}`;

    return { uploadUrl, key, publicUrl };
  },
);

/** Map a MIME type to a sensible file extension. Falls back to 'bin'
 *  for anything we don't recognise (won't happen for the allowlist
 *  above but keeps the function total). */
function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
  };
  return map[mime] ?? 'bin';
}
