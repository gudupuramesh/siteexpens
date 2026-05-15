/**
 * `getPlanConfig` — server-side cache for the live `system/planConfig`
 * doc.
 *
 * The doc is written by the App Owner web admin (`adminUpdatePlanConfig`)
 * and contains per-tier limits. We cache it in-memory per Cloud Function
 * instance for `CACHE_TTL_MS` so a burst of paywall checks
 * (`createProject`, `inviteMember`, R2 upload) doesn't translate to a
 * Firestore read each time.
 *
 * TTL = 15 seconds:
 *   - Long enough to absorb a write-heavy burst from a single user
 *     (a paywalled action that retries 3-4 times in quick succession).
 *   - Short enough that a fresh admin save propagates within a few
 *     seconds — closes the "I just saved, why isn't it taking effect"
 *     surprise that bit the user with the previous 60 s window.
 *   - The doc is < 1 KB; even at 1 read per instance per 15 s the
 *     cost is negligible.
 *
 * Cache busting: `invalidatePlanConfigCache()` clears the in-memory
 * cache. Wired into `adminUpdatePlanConfig` so the SAME function
 * instance that just wrote the doc immediately re-reads on its next
 * planConfig request. Other warm instances still observe the TTL but
 * we close the worst-case lag for the admin's own follow-up actions.
 *
 * Fail-safe: any read error returns whatever was last cached (possibly
 * null). Callers (`effectiveLimits`) fall through to the hardcoded
 * `PLAN_LIMITS` constant. The app is designed to be unbreakable by a
 * bad admin save.
 */
import { getFirestore } from 'firebase-admin/firestore';

import { type PlanLimits, type PlanTier } from './limits';

const CACHE_TTL_MS = 15 * 1000;

export type PlanConfigDoc = Partial<Record<PlanTier, PlanLimits>>;

let cached: PlanConfigDoc | null = null;
let cachedAt = 0;
let inFlight: Promise<PlanConfigDoc | null> | null = null;

/** Coerce admin "-1" sentinel to Infinity; reject malformed entries
 *  by dropping them so the caller falls through to PLAN_LIMITS[tier]. */
function normalizeTier(raw: unknown): PlanLimits | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const fields: (keyof PlanLimits)[] = [
    'maxMembers',
    'maxProjects',
    'maxStorageBytes',
  ];
  const out: Partial<PlanLimits> = {};
  for (const f of fields) {
    const v = o[f];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    out[f] = v === -1 ? Number.POSITIVE_INFINITY : v;
  }
  return out as PlanLimits;
}

function normalizeDoc(raw: unknown): PlanConfigDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tiers: PlanTier[] = ['free', 'solo', 'studio', 'agency'];
  const out: PlanConfigDoc = {};
  for (const tier of tiers) {
    const norm = normalizeTier(o[tier]);
    if (norm) out[tier] = norm;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Drop the in-memory cache so the next `getPlanConfig()` call hits
 * Firestore. Call this from `adminUpdatePlanConfig` right after the
 * doc is written so the admin's own next click sees their save with
 * zero lag (other warm instances still observe the TTL).
 */
export function invalidatePlanConfigCache(): void {
  cached = null;
  cachedAt = 0;
}

/**
 * Returns the cached `system/planConfig` shape, refreshing from
 * Firestore if the TTL has expired. Callers should treat `null` as
 * "use hardcoded fallback".
 */
export async function getPlanConfig(): Promise<PlanConfigDoc | null> {
  const now = Date.now();
  if (cached !== null && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  // Coalesce concurrent refreshes — under a request burst we don't want
  // every callable to fire its own Firestore read.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const snap = await getFirestore()
        .collection('system')
        .doc('planConfig')
        .get();
      cached = normalizeDoc(snap.data());
      cachedAt = Date.now();
      return cached;
    } catch (err) {
      // On read failure, leave any previous good cache in place but
      // don't block — return whatever we last had (possibly null).
      // eslint-disable-next-line no-console
      console.warn('[planConfigCache] read error', err);
      return cached;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
