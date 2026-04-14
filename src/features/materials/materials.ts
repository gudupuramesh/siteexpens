import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';

export type CreateMaterialInput = {
  orgId: string;
  projectId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  rate: number;
  totalCost: number;
  supplier: string;
  date: Date;
  notes: string;
  createdBy: string;
};

export async function createMaterial(input: CreateMaterialInput): Promise<string> {
  const ref = db.collection('materials').doc();
  await ref.set({
    orgId: input.orgId,
    projectId: input.projectId,
    name: input.name,
    category: input.category,
    quantity: input.quantity,
    unit: input.unit,
    rate: input.rate,
    totalCost: input.totalCost,
    supplier: input.supplier,
    date: firestore.Timestamp.fromDate(input.date),
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}
