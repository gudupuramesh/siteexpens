/**
 * Project writes. Creating a project writes a single top-level document;
 * access control is driven by `memberIds`, which is seeded with the
 * creator's uid (and later extended by the invite flow).
 */
import firestore from '@react-native-firebase/firestore';

import { db } from '@/src/lib/firebase';

export type CreateProjectInput = {
  uid: string;
  orgId: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  siteAddress: string;
  value: number;
  photoUri: string | null;
};

export async function createProject(input: CreateProjectInput): Promise<string> {
  const ref = db.collection('projects').doc();
  await ref.set({
    orgId: input.orgId,
    name: input.name,
    startDate: firestore.Timestamp.fromDate(input.startDate),
    endDate: input.endDate ? firestore.Timestamp.fromDate(input.endDate) : null,
    siteAddress: input.siteAddress,
    value: input.value,
    photoUri: input.photoUri,
    status: 'active',
    ownerId: input.uid,
    memberIds: [input.uid],
    createdAt: firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}
