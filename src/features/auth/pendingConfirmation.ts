/**
 * Module-level holder for a pending `ConfirmationResult` between the
 * sign-in and verify screens. We cannot pass this object through router
 * params because it contains non-serializable methods.
 */
import type { ConfirmationResult } from 'firebase/auth';

let pending: ConfirmationResult | null = null;

export function setPendingConfirmation(c: ConfirmationResult | null): void {
  pending = c;
}

export function getPendingConfirmation(): ConfirmationResult | null {
  return pending;
}
