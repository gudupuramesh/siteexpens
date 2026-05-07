import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

export type OrgFinanceCategory =
  | 'salary'
  | 'rent'
  | 'utilities'
  | 'internet'
  | 'office_supplies'
  | 'software'
  | 'travel'
  | 'marketing'
  | 'professional_fees'
  | 'other';

export type OrgFinanceKind = 'expense' | 'income';

export type OrgFinancePaymentMethod = 'cash' | 'bank' | 'upi' | 'card';

export const ORG_FINANCE_CATEGORIES: { key: OrgFinanceCategory; label: string }[] = [
  { key: 'salary', label: 'Salary' },
  { key: 'rent', label: 'Rent' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'internet', label: 'Internet' },
  { key: 'office_supplies', label: 'Office supplies' },
  { key: 'software', label: 'Software' },
  { key: 'travel', label: 'Travel' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'professional_fees', label: 'Professional fees' },
  { key: 'other', label: 'Other' },
];

export type OrgFinance = {
  id: string;
  orgId: string;
  kind: OrgFinanceKind;
  category: OrgFinanceCategory;
  amount: number;
  paidAt: FirebaseFirestoreTypes.Timestamp | null;
  payee?: string;
  payeeUid?: string | null;
  paymentMethod?: OrgFinancePaymentMethod;
  note?: string;
  createdBy: string;
  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
};

export type CreateOrgFinanceInput = {
  orgId: string;
  kind: OrgFinanceKind;
  category: OrgFinanceCategory;
  amount: number;
  paidAt: Date;
  payee?: string;
  payeeUid?: string | null;
  paymentMethod?: OrgFinancePaymentMethod;
  note?: string;
  createdBy: string;
};
