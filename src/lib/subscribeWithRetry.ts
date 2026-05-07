/**
 * Wrap a Firestore snapshot subscription with debounced auto-retry
 * on `permission-denied` errors.
 *
 * The problem this solves: when a Firestore listener hits
 * `permission-denied`, the underlying SDK detaches the listener
 * and never reconnects on its own. If the failure was transient
 * (e.g. rules were temporarily strict during a deploy, or claims
 * hadn't propagated yet), the listener stays dead until the
 * component fully unmounts and remounts. The user sees an empty
 * screen even after the underlying issue is fixed.
 *
 * `subscribeWithRetry` wraps the subscription so that, on
 * `permission-denied`, it waits a beat and re-subscribes — up to
 * 3 attempts with growing backoff. If the rules / claims have
 * settled in the meantime, the resubscribe succeeds and
 * `onNext` starts firing again. Other error types are passed
 * through to the caller's `onError` (or logged + ignored if
 * absent) — Firestore's own retry handles network blips.
 *
 * Returns a single `unsubscribe` function with the same shape as
 * `query.onSnapshot(...)` so callers don't change.
 *
 * Usage:
 *   const unsub = subscribeWithRetry(
 *     db.collection('projects').where('orgId', '==', orgId),
 *     (snap) => setData(snap.docs.map(...)),
 *     (err) => console.warn('[useProjects]', err),
 *   );
 *   return unsub;
 */

/** Generic types so this helper works for both query and document
 *  subscriptions — both expose `.onSnapshot(onNext, onError)`. */
export type SubscribableSource<TSnap> = {
  onSnapshot(
    onNext: (snap: TSnap) => void,
    onError?: (err: Error) => void,
  ): () => void;
};

export type SubscribeWithRetryOptions = {
  /** Max retry attempts on permission-denied. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms; each retry waits `base * (attempt + 1)`. */
  baseDelayMs?: number;
  /** Tag prefix for log messages. */
  tag?: string;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 2000;

/** Detects permission-denied errors from the Firebase JS SDK across
 *  the variations its surface throws (FirebaseError code, message
 *  text). */
function isPermissionDenied(err: unknown): boolean {
  if (!err) return false;
  const code = (err as { code?: string }).code;
  if (typeof code === 'string') {
    if (code === 'permission-denied') return true;
    if (code === 'firestore/permission-denied') return true;
  }
  const message = (err as { message?: string }).message;
  if (typeof message === 'string' && message.toLowerCase().includes('permission')) {
    return true;
  }
  return false;
}

export function subscribeWithRetry<TSnap>(
  source: SubscribableSource<TSnap>,
  onNext: (snap: TSnap) => void,
  onError?: (err: Error) => void,
  opts: SubscribeWithRetryOptions = {},
): () => void {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const tag = opts.tag ?? '[subscribeWithRetry]';

  let cancelled = false;
  let unsubInner: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  function attach(): void {
    if (cancelled) return;
    unsubInner = source.onSnapshot(
      (snap) => {
        // Successful read — reset the attempt counter so a future
        // permission-denied gets the full retry budget.
        attempts = 0;
        onNext(snap);
      },
      (err) => {
        if (cancelled) return;
        if (isPermissionDenied(err) && attempts < maxAttempts) {
          attempts += 1;
          const delay = baseDelayMs * attempts;
          if (__DEV__) {
            console.warn(
              `${tag} permission-denied — retrying attempt ${attempts}/${maxAttempts} in ${delay}ms`,
            );
          }
          // Detach the failed listener before scheduling retry —
          // Firebase otherwise leaks a stuck subscription.
          if (unsubInner) {
            unsubInner();
            unsubInner = null;
          }
          retryTimer = setTimeout(() => {
            retryTimer = null;
            attach();
          }, delay);
          return;
        }
        // Non-retryable or out of attempts — surface to caller.
        onError?.(err);
      },
    );
  }

  attach();

  return () => {
    cancelled = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (unsubInner) {
      unsubInner();
      unsubInner = null;
    }
  };
}
