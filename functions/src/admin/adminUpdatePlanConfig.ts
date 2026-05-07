/**
 * Edit `system/planConfig` — the live source of truth for tier
 * limits across client + server.
 *
 * Both client (`useSubscription`) and server (`effectiveLimits`)
 * read this doc with a hardcoded `PLAN_LIMITS` constant as a
 * bootstrap fallback. Editing here propagates instantly:
 *   - New paywall checks (`createProject`, `inviteMember`,
 *     `r2PresignedUploadUrl`) consult the latest doc on every call
 *   - Client paywall sheet re-renders with new limits on the next
 *     snapshot (within ~1 frame)
 *
 * Validation: each field is a positive integer OR -1 (= unlimited).
 * Storage bytes are NOT validated against R2 actual capacity — the
 * App Owner can set any number; the only guard is that the org's
 * actual storageBytes will block uploads if the cap is below it
 * (no destructive consequences, just instant blocking).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { assertAppOwner } from './auth';
import { logAdminAction } from './audit';

const db = getFirestore();

type TierConfig = {
  maxMembers: number;
  maxProjects: number;
  maxStorageBytes: number;
};

type Request = {
  free: TierConfig;
  solo: TierConfig;
  studio: TierConfig;
  agency: TierConfig;
};

type Response = { ok: true };

function validateTier(name: string, t: unknown): TierConfig {
  if (!t || typeof t !== 'object') {
    throw new HttpsError('invalid-argument', `${name}: missing tier config.`);
  }
  const o = t as Record<string, unknown>;
  const fields: (keyof TierConfig)[] = [
    'maxMembers',
    'maxProjects',
    'maxStorageBytes',
  ];
  const out: Partial<TierConfig> = {};
  for (const f of fields) {
    const v = o[f];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new HttpsError(
        'invalid-argument',
        `${name}.${f}: must be a number.`,
      );
    }
    if (v < -1 || (v >= 0 && !Number.isInteger(v))) {
      throw new HttpsError(
        'invalid-argument',
        `${name}.${f}: must be -1 (unlimited) or a non-negative integer.`,
      );
    }
    out[f] = v;
  }
  return out as TierConfig;
}

export const adminUpdatePlanConfig = onCall<Request, Promise<Response>>(
  async (request) => {
    const actorUid = assertAppOwner(request);
    const data = request.data ?? ({} as Request);

    const free = validateTier('free', data.free);
    const solo = validateTier('solo', data.solo);
    const studio = validateTier('studio', data.studio);
    const agency = validateTier('agency', data.agency);

    const ref = db.collection('system').doc('planConfig');
    const before = (await ref.get()).data() ?? null;

    const after = { free, solo, studio, agency };

    await ref.set(
      {
        ...after,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
      },
      { merge: false },
    );

    await logAdminAction({
      actorUid,
      action: 'update_plan_config',
      before: before ?? undefined,
      after,
    });

    return { ok: true };
  },
);
