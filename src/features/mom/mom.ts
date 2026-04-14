import firestore from '@react-native-firebase/firestore';
import { db } from '@/src/lib/firebase';

export type CreateMOMInput = {
  orgId: string;
  projectId: string;
  title: string;
  notes: string;
  date: Date;
  attendees: string[];
  actionItems: string[];
  createdBy: string;
};

export async function createMOM(input: CreateMOMInput): Promise<string> {
  const ref = db.collection('moms').doc();
  await ref.set({
    orgId: input.orgId,
    projectId: input.projectId,
    title: input.title,
    notes: input.notes,
    date: firestore.Timestamp.fromDate(input.date),
    attendees: input.attendees,
    actionItems: input.actionItems,
    createdBy: input.createdBy,
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}
