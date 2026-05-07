import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';

// ── Party type categories (mirrors Onsite grouping) ──

/** General party types */
export type GeneralPartyType = 'client' | 'staff' | 'worker' | 'investor';

/** Vendor subtypes */
export type VendorPartyType =
  | 'material_supplier'
  | 'labour_contractor'
  | 'equipment_supplier'
  | 'contractor'
  | 'other_vendor';

/** All party types */
export type PartyType = GeneralPartyType | VendorPartyType;

/** Grouped structure for UI */
export type PartyTypeGroup = {
  label: string;
  types: { key: PartyType; label: string; icon: string }[];
};

export const PARTY_TYPE_GROUPS: PartyTypeGroup[] = [
  {
    label: 'General',
    types: [
      { key: 'client',   label: 'Client',   icon: 'person' },
      { key: 'staff',    label: 'Staff',     icon: 'people' },
      { key: 'worker',   label: 'Worker',    icon: 'body' },
      { key: 'investor', label: 'Investor',  icon: 'cash' },
    ],
  },
  {
    label: 'Vendor',
    types: [
      { key: 'material_supplier',   label: 'Material Supplier',   icon: 'storefront' },
      { key: 'labour_contractor',   label: 'Labour Contractor',   icon: 'construct' },
      { key: 'equipment_supplier',  label: 'Equipment Supplier',  icon: 'hardware-chip' },
      { key: 'contractor',          label: 'Contractor',          icon: 'hammer' },
      { key: 'other_vendor',        label: 'Other Vendor',        icon: 'ellipsis-horizontal' },
    ],
  },
];

/** Flat list for quick lookup */
export const ALL_PARTY_TYPES = PARTY_TYPE_GROUPS.flatMap((g) => g.types);

/** Return label for a PartyType key */
export function getPartyTypeLabel(type: PartyType): string {
  return ALL_PARTY_TYPES.find((t) => t.key === type)?.label ?? type;
}

/** Return group label ('General' | 'Vendor') for a PartyType */
export function getPartyTypeGroup(type: PartyType): string {
  return PARTY_TYPE_GROUPS.find((g) => g.types.some((t) => t.key === type))?.label ?? '';
}

// ── Bank details ──

export type BankDetails = {
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  bankAddress?: string;
  iban?: string;
  upiId?: string;
};

// ── Party document ──

export type Party = {
  id: string;
  orgId: string;

  // Basic info
  name: string;
  phone: string;
  email?: string;
  partyType: PartyType;

  // Personal
  fatherName?: string;
  dateOfJoining?: FirebaseFirestoreTypes.Timestamp | null;
  address?: string;

  // Additional / KYC
  aadharNumber?: string;
  aadharFileUrl?: string;
  panNumber?: string;
  panFileUrl?: string;

  // Financial
  openingBalance?: number;
  openingBalanceType?: 'to_pay' | 'to_receive';

  // Bank
  bankDetails?: BankDetails;

  // Legacy compat — old docs may still have `role`
  role?: string;

  createdAt: FirebaseFirestoreTypes.Timestamp | null;
  createdBy: string;
};

// Keep the old alias so existing code that imports PartyRole still compiles
export type PartyRole = PartyType;
