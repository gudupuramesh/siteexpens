/**
 * Legacy redirect — `/(app)/finances` was consolidated into the
 * tabbed Finance hub at `/(app)/finance`. Kept for one release so
 * any cached deep links / chip references still resolve.
 *
 * Delete in the next release once nothing references this path.
 */
import { Redirect } from 'expo-router';

export default function FinancesLegacyRedirect() {
  return <Redirect href="/(app)/finance" />;
}
