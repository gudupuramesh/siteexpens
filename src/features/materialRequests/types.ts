import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

import type { RoleKey } from '@/src/features/org/types';

export type MaterialRequestStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type DeliveryStatus = 'pending' | 'ordered' | 'delivered' | 'received_at_site';

export const DELIVERY_STATUSES: { key: DeliveryStatus; label: string; icon: string; color: string }[] = [
  { key: 'pending', label: 'Pending', icon: 'time-outline', color: '#f59e0b' },
  { key: 'ordered', label: 'Ordered', icon: 'cart-outline', color: '#3b82f6' },
  { key: 'delivered', label: 'Delivered', icon: 'cube-outline', color: '#8b5cf6' },
  { key: 'received_at_site', label: 'At Site', icon: 'checkmark-circle-outline', color: '#22c55e' },
];

export type MaterialRequestItem = {
  libraryItemId?: string;
  category?: string;
  name: string;
  brand: string;
  variety: string;
  make: string;
  size: string;
  unit: string;
  quantity: number;
  rate: number;
  totalCost: number;
  deliveryStatus: DeliveryStatus;
};

export type MaterialRequest = {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  status: MaterialRequestStatus;
  items: MaterialRequestItem[];
  totalValue: number;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  approvedBy?: string;
  approvedAt?: FirebaseFirestoreTypes.Timestamp | null;
  rejectionNote?: string;
  /** UID of the user who rejected this request (mirrors `approvedBy`). */
  rejectedBy?: string;
  /** Server timestamp written when `rejectRequest()` runs. Used by the
   *  notifications bell to anchor rejected events in the Recent section. */
  rejectedAt?: FirebaseFirestoreTypes.Timestamp | null;
  /** True when Admin/Super Admin/Manager created and request skipped approval. */
  autoApproved?: boolean;
  /** Optional notify targets (informational); any Manager+ may still approve. */
  designatedApproverUids?: string[];
  /** Creator role snapshot at create time. */
  createdByRole?: RoleKey;
  /** Last edit timestamp — used to surface a "Last edited by X" footnote on
   *  the detail screen. Set by both creator-edits and approver-edits. */
  editedAt?: FirebaseFirestoreTypes.Timestamp | null;
  editedBy?: string;
  /** Server timestamp written when ANY item's `deliveryStatus` is changed
   *  via `updateItemDeliveryStatus()`. Distinct from `editedAt` (which
   *  tracks title/items edits) so the bell can surface delivery events
   *  without conflating them with content edits. */
  lastDeliveryUpdateAt?: FirebaseFirestoreTypes.Timestamp | null;
  lastDeliveryUpdateBy?: string;
};

export function getDeliveryStatusLabel(s: DeliveryStatus): string {
  return DELIVERY_STATUSES.find((x) => x.key === s)?.label ?? s;
}
