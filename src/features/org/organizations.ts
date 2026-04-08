/**
 * Organization writes. Creating an org is an atomic two-doc operation:
 *
 *   1. organizations/{orgId}   — new document with the company profile
 *   2. users/{uid}             — patched with primaryOrgId (+ email) so
 *                                the client knows onboarding is complete
 *
 * We do both in a single batched write so a partial failure can't leave
 * the user in a half-onboarded state.
 */
import firestore from '@react-native-firebase/firestore';

import { db } from '@/src/lib/firebase';

export type CreateOrganizationInput = {
  uid: string;
  name: string;
  email: string;
};

export async function createOrganization({
  uid,
  name,
  email,
}: CreateOrganizationInput): Promise<string> {
  const orgRef = db.collection('organizations').doc();
  const userRef = db.collection('users').doc(uid);

  const batch = db.batch();

  batch.set(orgRef, {
    name,
    email,
    ownerId: uid,
    memberIds: [uid],
    createdAt: firestore.FieldValue.serverTimestamp(),
  });

  batch.set(
    userRef,
    {
      primaryOrgId: orgRef.id,
      email,
    },
    { merge: true },
  );

  await batch.commit();
  return orgRef.id;
}
