/**
 * `usePlanConfig` — live Firestore snapshot of `system/planConfig`.
 *
 * The doc is written by the App Owner web admin
 * (`adminUpdatePlanConfig`) and contains per-tier limits
 * (`{ free, solo, studio, agency } → { maxMembers, maxProjects,
 * maxStorageBytes }`). When the doc isn't loaded yet (or doesn't
 * exist at all), this hook returns `null` and consumers fall back
 * to the hardcoded `PLAN_LIMITS` constant.
 *
 * Wire model:
 *   - One module-level `onSnapshot` listener, shared across every
 *     React subscriber via `useSyncExternalStore`. Mounting the hook
 *     N times still costs exactly one Firestore listener.
 *   - The listener starts on first subscriber and never stops — the
 *     planConfig doc is so small (a few hundred bytes) and so rarely
 *     edited that the cost of keeping it open for the app lifetime is
 *     negligible compared to the churn of repeated re-subscribes.
 *   - Normalisation:
 *     * `-1` (admin's "unlimited" sentinel) → `Number.POSITIVE_INFINITY`
 *     * Tier with a missing or non-finite field → dropped entirely so
 *       the consumer falls through to `PLAN_LIMITS[tier]`. A partial
 *       doc cannot brick the app.
 */
import { useSyncExternalStore } from 'react';

import { db } from '@/src/lib/firebase';

import type { PlanLimits, PlanTier } from './types';

export type PlanConfigDoc = Partial<Record<PlanTier, PlanLimits>>;

// ── Module-level store ──────────────────────────────────────────────
let cached: PlanConfigDoc | null = null;
let unsubscribe: (() => void) | null = null;
const subscribers = new Set<() => void>();

/** Coerce admin "-1" sentinel to Infinity; reject anything else
 *  non-finite by dropping the tier on the floor (caller falls through
 *  to `PLAN_LIMITS`). */
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

function startListener(): void {
  if (unsubscribe) return;
  unsubscribe = db
    .doc('system/planConfig')
    .onSnapshot(
      (snap) => {
        cached = normalizeDoc(snap.data());
        for (const cb of subscribers) cb();
      },
      (err) => {
        // Read failure → drop to fallback. Don't blank a previously
        // good cache, but signal subscribers in case they want to
        // re-render against `null`.
        // eslint-disable-next-line no-console
        console.warn('[usePlanConfig] snapshot error', err);
      },
    );
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  startListener();
  return () => {
    subscribers.delete(cb);
    // Intentionally never tear down the listener — see file header.
  };
}

function getSnapshot(): PlanConfigDoc | null {
  return cached;
}

/** Live `system/planConfig` doc, or `null` until the first snapshot
 *  arrives (or if the doc is missing / malformed). Consumers should
 *  fall back to `PLAN_LIMITS[tier]` when a tier isn't present. */
export function usePlanConfig(): PlanConfigDoc | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
