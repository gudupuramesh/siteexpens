/**
 * Shared Cloudflare R2 / S3 client factory.
 *
 * Both `r2.ts` (presigned uploads) and `storage.ts` (deletes) need an
 * S3-compatible client with the same R2 endpoint + credentials. This
 * module is the single place those settings live.
 *
 * Secrets are NOT read at module load. Each callable that uses R2
 * declares the same `defineSecret(...)` handles in its own file and
 * passes them through to `buildR2Client()` after Firebase has injected
 * them at runtime.
 */
import { S3Client } from '@aws-sdk/client-s3';

export type R2ClientConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Build an S3 client pointed at R2's S3-compatible endpoint. R2 uses
 *  path-style addressing and `region: 'auto'`. */
export function buildR2Client(cfg: R2ClientConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
  });
}
