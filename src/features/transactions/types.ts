import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export type TransactionType = 'payment_in' | 'payment_out';

/** Cost code / category for the transaction */
export type TransactionCategory =
  | 'labour'
  | 'material'
  | 'transport'
  | 'equipment'
  | 'sub_contractor'
  | 'customer'
  | 'designer'
  | 'food_and_travel'
  | 'fuel'
  | 'salary'
  | 'rent'
  | 'others';

export const TRANSACTION_CATEGORIES: { key: TransactionCategory; label: string }[] = [
  { key: 'labour',         label: 'Labour' },
  { key: 'material',       label: 'Material' },
  { key: 'transport',      label: 'Transport' },
  { key: 'equipment',      label: 'Equipment' },
  { key: 'sub_contractor', label: 'Sub Contractor' },
  { key: 'customer',       label: 'Customer' },
  { key: 'designer',       label: 'Designer' },
  { key: 'food_and_travel',label: 'Food & Travel' },
  { key: 'fuel',           label: 'Fuel' },
  { key: 'salary',         label: 'Salary' },
  { key: 'rent',           label: 'Rent' },
  { key: 'others',         label: 'Others' },
];

export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'upi';

export const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'cash',          label: 'Cash',          icon: 'cash-outline' },
  { key: 'bank_transfer', label: 'Bank Transfer', icon: 'business-outline' },
  { key: 'cheque',        label: 'Cheque',        icon: 'document-text-outline' },
  { key: 'upi',           label: 'UPI',           icon: 'phone-portrait-outline' },
];

export type TransactionStatus = 'paid' | 'pending' | 'partial';

export type Transaction = {
  id: string;
  projectId: string;
  orgId: string;
  type: TransactionType;
  amount: number;
  description: string;

  // Party link
  partyId?: string;
  partyName: string;

  // Category & payment
  category?: TransactionCategory;
  paymentMethod?: PaymentMethod;
  referenceNumber?: string;

  // Photo / bill attachment
  photoUrl?: string;
  photoStoragePath?: string;

  status: TransactionStatus;
  date: FirebaseFirestoreTypes.Timestamp | null;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  createdBy: string;

  // Legacy compat — old docs may have 'income'/'expense'
};

/** Map old type values to new */
export function normalizeTransactionType(raw: string): TransactionType {
  if (raw === 'income') return 'payment_in';
  if (raw === 'expense') return 'payment_out';
  return raw as TransactionType;
}

/** Filter options for the transaction list */
export type TransactionFilter = {
  type?: TransactionType | 'all';
  category?: TransactionCategory | 'all';
  paymentMethod?: PaymentMethod | 'all';
  partyName?: string;
};

export function getCategoryLabel(cat: TransactionCategory): string {
  return TRANSACTION_CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
}

export function getPaymentMethodLabel(pm: PaymentMethod): string {
  return PAYMENT_METHODS.find((m) => m.key === pm)?.label ?? pm;
}
