/**
 * Expo push notifications for material request + transaction approval workflows.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

const db = getFirestore();
const expo = new Expo();

const MATERIAL_APPROVER_ROLES = ['superAdmin', 'admin', 'manager'];
const TXN_APPROVER_ROLES = ['superAdmin', 'admin'];

function effectiveRole(org: Record<string, unknown>, uid: string): string | null {
  const roles = org.roles as Record<string, string> | undefined;
  if (roles?.[uid]) return roles[uid];
  if (org.ownerId === uid) return 'superAdmin';
  const memberIds = org.memberIds as string[] | undefined;
  if (memberIds?.includes(uid)) return 'admin';
  return null;
}

async function expoTokensForUids(uids: string[]): Promise<string[]> {
  const uniq = [...new Set(uids.filter(Boolean))];
  const out: string[] = [];
  for (const uid of uniq) {
    const snap = await db.collection('users').doc(uid).get();
    const raw = snap.data()?.expoPushTokens;
    if (!Array.isArray(raw)) continue;
    for (const t of raw) {
      if (typeof t === 'string' && Expo.isExpoPushToken(t)) out.push(t);
    }
  }
  return [...new Set(out)];
}

async function tokensForOrgRoles(orgId: string, allowed: string[]): Promise<string[]> {
  const orgSnap = await db.collection('organizations').doc(orgId).get();
  if (!orgSnap.exists) return [];
  const org = orgSnap.data() as Record<string, unknown>;
  const memberIds = (org.memberIds as string[]) ?? [];
  const uids: string[] = [];
  for (const uid of memberIds) {
    const r = effectiveRole(org, uid);
    if (r && allowed.includes(r)) uids.push(uid);
  }
  return expoTokensForUids(uids);
}

async function sendToTokens(
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  if (tokens.length === 0) return;
  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    sound: 'default',
    title: message.title,
    body: message.body,
    data: message.data,
    channelId: 'approvals',
  }));
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      console.error('[approvalNotifications] Expo send error', e);
    }
  }
}

export const onMaterialRequestWrite = onDocumentWritten(
  'materialRequests/{requestId}',
  async (event) => {
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    if (!after?.orgId || typeof after.orgId !== 'string') return;

    const orgId = after.orgId as string;
    const statusAfter = after.status as string | undefined;
    const statusBefore = before?.status as string | undefined;
    const requestId = event.params.requestId;

    const becamePending = statusAfter === 'pending' && statusBefore !== 'pending';
    if (becamePending) {
      const roleTokens = await tokensForOrgRoles(orgId, MATERIAL_APPROVER_ROLES);
      const designated = (after.designatedApproverUids as string[] | undefined) ?? [];
      const designatedTokens = designated.length ? await expoTokensForUids(designated) : [];
      const merged = [...new Set([...roleTokens, ...designatedTokens])];
      const title = 'Material request pending';
      const body = (after.title as string) || 'New material request needs approval';
      await sendToTokens(merged, {
        title,
        body,
        data: {
          kind: 'approval_material',
          projectId: String(after.projectId ?? ''),
          requestId,
        },
      });
      return;
    }

    const wasResolved =
      (statusAfter === 'approved' || statusAfter === 'rejected') && statusBefore === 'pending';
    if (wasResolved) {
      const createdBy = after.createdBy as string | undefined;
      if (createdBy) {
        const tokens = await expoTokensForUids([createdBy]);
        const title =
          statusAfter === 'approved' ? 'Material request approved' : 'Material request rejected';
        const body =
          statusAfter === 'approved'
            ? ((after.title as string) || 'Your request was approved')
            : ((after.rejectionNote as string) || 'Your request was rejected');
        await sendToTokens(tokens, {
          title,
          body,
          data: {
            kind: 'approval_material',
            projectId: String(after.projectId ?? ''),
            requestId,
          },
        });
      }
      // Don't return — items may also have changed in this same write (e.g.
      // an admin who edited items at approval time). Fall through to the
      // delivery branch below, which is guarded to only fire when the
      // status was already 'approved' before AND after this write — so a
      // pending→approved transition won't trigger spurious delivery pushes.
    }

    // Per-item delivery status push — fires when an admin updates an
    // already-approved request's item delivery status (pending → ordered,
    // ordered → delivered, etc.). Recipient is the original creator.
    //
    // Guards (in order):
    //   1. Both before and after must be 'approved' — skip pending→approved
    //      transitions entirely (the approver branch above already pushed).
    //   2. Items array length must be unchanged — protects against an admin
    //      adding/removing items via the edit UI, which would shift indices
    //      and produce spurious "deliveryStatus changed" matches at the
    //      shifted positions.
    //   3. Item names must match by index — second-line defence against
    //      reordering. If the indices line up but the items at those
    //      indices are different (replacement edit), we skip rather than
    //      emit a misleading push.
    if (!before || statusBefore !== 'approved' || statusAfter !== 'approved') return;
    const itemsBefore = (before.items as Array<Record<string, unknown>> | undefined) ?? [];
    const itemsAfter = (after.items as Array<Record<string, unknown>> | undefined) ?? [];
    if (itemsBefore.length !== itemsAfter.length) return;
    const namesAligned = itemsBefore.every(
      (b, i) => (b?.name as string | undefined) === (itemsAfter[i]?.name as string | undefined),
    );
    if (!namesAligned) return;
    const changes: Array<{ name: string; status: string }> = [];
    for (let i = 0; i < itemsAfter.length; i++) {
      const beforeStatus = itemsBefore[i]?.deliveryStatus as string | undefined;
      const afterStatus = itemsAfter[i]?.deliveryStatus as string | undefined;
      if (beforeStatus !== afterStatus && afterStatus) {
        changes.push({
          name: (itemsAfter[i]?.name as string) ?? `Item ${i + 1}`,
          status: afterStatus,
        });
      }
    }
    if (changes.length === 0) return;

    const createdBy = after.createdBy as string | undefined;
    if (!createdBy) return;
    const tokens = await expoTokensForUids([createdBy]);
    const reqTitle = (after.title as string) || 'Material request';
    let body: string;
    if (changes.length === 1) {
      const c = changes[0];
      body = `${c.name} → ${formatDeliveryStatus(c.status)}`;
    } else {
      body = `${changes.length} items updated`;
    }
    await sendToTokens(tokens, {
      title: `Material update — ${reqTitle}`,
      body,
      data: {
        kind: 'approval_material',
        projectId: String(after.projectId ?? ''),
        requestId,
      },
    });
  },
);

function formatDeliveryStatus(s: string): string {
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'ordered':
      return 'Ordered';
    case 'delivered':
      return 'Delivered';
    case 'received_at_site':
      return 'At Site';
    default:
      return s;
  }
}

export const onTransactionWrite = onDocumentWritten('transactions/{txnId}', async (event) => {
  const after = event.data?.after.data() as Record<string, unknown> | undefined;
  const before = event.data?.before.data() as Record<string, unknown> | undefined;
  if (!after?.orgId || typeof after.orgId !== 'string') return;

  const orgId = after.orgId as string;
  const wfAfter = (after.workflowStatus as string | undefined) ?? 'posted';
  const wfBefore = (before?.workflowStatus as string | undefined) ?? 'posted';
  const txnId = event.params.txnId;

  const becamePending = wfAfter === 'pending_approval' && wfBefore !== 'pending_approval';
  if (becamePending) {
    const tokens = await tokensForOrgRoles(orgId, TXN_APPROVER_ROLES);
    const amt = after.amount as number | undefined;
    const party = (after.partyName as string) || 'Expense';
    await sendToTokens(tokens, {
      title: 'Transaction pending approval',
      body: `${party}${amt != null ? ` · ₹${amt}` : ''}`,
      data: {
        kind: 'approval_transaction',
        projectId: String(after.projectId ?? ''),
        txnId,
      },
    });
    return;
  }

  // Compute settlement transition once — used by BOTH the wasPosted branch
  // (to detect the combined approve-and-clear case) AND the standalone
  // cleared branch (for clear-later flows).
  const beforeSettlement = (before?.settlement ?? null) as
    | Record<string, unknown>
    | null;
  const afterSettlement = (after.settlement ?? null) as
    | Record<string, unknown>
    | null;
  const wasCleared =
    !!afterSettlement?.clearedAt && !beforeSettlement?.clearedAt;

  const wasPosted = wfAfter === 'posted' && wfBefore === 'pending_approval';
  const wasRejected = wfAfter === 'rejected' && wfBefore === 'pending_approval';
  if (wasPosted || wasRejected) {
    const createdBy = after.createdBy as string | undefined;
    if (createdBy) {
      const tokens = await expoTokensForUids([createdBy]);
      // Combined approve-and-clear: emit ONE merged push instead of two
      // separate "Approved" + "Cleared" pushes that would buzz the user
      // back-to-back. Wording covers both events ("approved & paid").
      const combinedApproveAndClear = wasPosted && wasCleared;
      let title: string;
      let body: string;
      if (combinedApproveAndClear) {
        const amt = after.amount as number | undefined;
        const party = (after.partyName as string) || 'party';
        const kind = after.submissionKind as string | undefined;
        if (kind === 'expense_reimbursement') {
          title = 'Approved & paid back';
          body = `Your expense${amt != null ? ` of ₹${amt}` : ''} was approved and reimbursed`;
        } else {
          title = 'Approved & paid';
          body = `Approved · paid to ${party}${amt != null ? ` · ₹${amt}` : ''}`;
        }
      } else if (wasPosted) {
        title = 'Transaction approved';
        body = (after.description as string) || 'Your expense was approved';
      } else {
        title = 'Transaction rejected';
        body = (after.rejectionNote as string) || 'Your expense was rejected';
      }
      await sendToTokens(tokens, {
        title,
        body,
        data: {
          kind: 'approval_transaction',
          projectId: String(after.projectId ?? ''),
          txnId,
        },
      });
    }
    // If the combined push already covered the cleared event, return now
    // so the standalone cleared branch below doesn't double-fire.
    if (wasPosted && wasCleared) return;
  }

  // Standalone cleared branch — fires only when settlement.clearedAt is set
  // WITHOUT a workflow transition in the same write (i.e., the admin
  // approved earlier and is now clearing the payment as a deferred action).
  // The combined approve-and-clear case is handled above.
  if (wasCleared) {
    const createdBy = after.createdBy as string | undefined;
    if (!createdBy) return;
    const tokens = await expoTokensForUids([createdBy]);
    const amt = after.amount as number | undefined;
    const party = (after.partyName as string) || 'party';
    const kind = after.submissionKind as string | undefined;
    let title: string;
    let body: string;
    if (kind === 'expense_reimbursement') {
      title = 'Reimbursement cleared';
      body = `Your expense${amt != null ? ` of ₹${amt}` : ''} has been paid back`;
    } else {
      title = 'Payment cleared';
      body = `Paid to ${party}${amt != null ? ` · ₹${amt}` : ''}`;
    }
    await sendToTokens(tokens, {
      title,
      body,
      data: {
        kind: 'approval_transaction',
        projectId: String(after.projectId ?? ''),
        txnId,
      },
    });
  }
});
