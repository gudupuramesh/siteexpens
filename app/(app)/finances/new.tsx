/**
 * Legacy redirect — relocated to `/(app)/finance/new-expense`.
 * Delete in the next release.
 */
import { Redirect } from 'expo-router';

export default function NewFinanceLegacyRedirect() {
  return <Redirect href="/(app)/finance/new-expense" />;
}
