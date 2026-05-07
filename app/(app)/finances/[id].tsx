/**
 * Legacy redirect — relocated to `/(app)/finance/[expenseId]`.
 * Forwards the entry id through the URL param so deep links survive.
 * Delete in the next release.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function FinanceDetailLegacyRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/(app)/finance/${id}` as never} />;
}
