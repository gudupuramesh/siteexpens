/**
 * Append a row to `adminAudit/{eventId}` for every admin action.
 *
 * Schema:
 *   {
 *     actorUid: string,                 // who performed the action
 *     action: string,                   // 'override_org_tier' | 'update_plan_config' | ...
 *     targetOrgId?: string,             // when action targets an org
 *     before?: Record<string, unknown>, // shallow snapshot of relevant fields BEFORE the change
 *     after?: Record<string, unknown>,  // ... AFTER
 *     note?: string,                    // free-text reason from the operator
 *     at: serverTimestamp,
 *   }
 *
 * Best-effort: failures here log + continue; we never want a logging
 * problem to block the actual operation. The audit collection is
 * write-blocked from clients (Admin SDK only); read-blocked except
 * for App Owners.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export type AuditEvent = {
  actorUid: string;
  action: string;
  targetOrgId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  note?: string;
};

export async function logAdminAction(event: AuditEvent): Promise<void> {
  try {
    await db.collection('adminAudit').add({
      ...event,
      at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('[admin/audit] failed to log action:', err);
  }
}
