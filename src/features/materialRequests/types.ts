import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

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
};
