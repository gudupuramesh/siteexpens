/**
 * Grant the App Owner custom claim to a Firebase user.
 *
 * The claim `role: 'app_owner'` lets the user access the web admin
 * portal at `admin.siteexpens.com` and call any of the admin Cloud
 * Functions (`adminListSubscribers`, `adminOverrideOrgTier`, etc.).
 * It bypasses the per-org Super Admin / role boundary — use only
 * for genuine operators.
 *
 * Industry-standard pattern: the claim is set via the Firebase Admin
 * SDK, NOT via a Firestore doc the user could mutate. The token must
 * refresh (sign out + back in, OR `auth.getIdToken(true)` from the
 * client) for the claim to take effect.
 *
 * Usage:
 *   1. Once: `gcloud auth application-default login` so the script
 *      can authenticate with your Google account
 *   2. Run: `npx tsx scripts/grant-app-owner.ts <UID>`
 *
 * Reverse: `npx tsx scripts/grant-app-owner.ts <UID> --revoke`
 *
 * Audit: every grant/revoke prints to stdout. Save the output if you
 * need a paper trail (we don't have an admin audit table yet — Phase
 * E will add one).
 */
import admin from 'firebase-admin';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const uid = args.find((a) => !a.startsWith('--'));

  if (!uid) {
    console.error(
      'Usage: npx tsx scripts/grant-app-owner.ts <UID> [--revoke]',
    );
    process.exit(2);
  }

  // Uses application-default credentials. If you haven't signed in:
  //   gcloud auth application-default login
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });

  // Read existing claims so we don't clobber other ones.
  const userRecord = await admin.auth().getUser(uid);
  const existingClaims = userRecord.customClaims ?? {};

  let nextClaims: Record<string, unknown>;
  if (revoke) {
    // Drop only the `role` key; preserve any other custom claims.
    const { role: _drop, ...rest } = existingClaims;
    void _drop;
    nextClaims = rest;
  } else {
    nextClaims = { ...existingClaims, role: 'app_owner' };
  }

  await admin.auth().setCustomUserClaims(uid, nextClaims);

  console.log(
    `${revoke ? 'Revoked' : 'Granted'} app_owner on uid=${uid} (${
      userRecord.email ?? userRecord.phoneNumber ?? 'no contact'
    })`,
  );
  console.log('Claims now:', JSON.stringify(nextClaims, null, 2));
  console.log(
    '\nThe user must refresh their auth token before the claim takes effect:',
  );
  console.log(
    '  - Web admin portal: sign out + sign in with Google',
  );
  console.log(
    '  - Mobile app: foreground refresh runs auto on next app open',
  );
}

main().catch((err: unknown) => {
  console.error('Failed:', err);
  process.exit(1);
});
