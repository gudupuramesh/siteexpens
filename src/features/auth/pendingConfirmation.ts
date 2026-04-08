/**
 * Module-level holder for a pending `ConfirmationResult` between the
 * sign-in and verify screens. We cannot pass this object through router
 * params because it contains non-serializable methods.
 */
import type { PhoneConfirmation } from './phoneAuth';

let pending: PhoneConfirmation | null = null;

export function setPendingConfirmation(c: PhoneConfirmation | null): void {
  pending = c;
}

export function getPendingConfirmation(): PhoneConfirmation | null {
  return pending;
}
