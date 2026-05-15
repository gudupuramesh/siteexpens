/**
 * openLegalUrl — open the Privacy Policy or Terms of Use (EULA) URL
 * configured in `app.json`'s `expo` block (top-level fields).
 *
 * Apple guideline 3.1.2(c) requires every screen that shows or initiates
 * an auto-renewable subscription purchase to provide functional links
 * to BOTH the privacy policy and the Terms of Use (EULA). Three places
 * in the app surface subscription pricing (the Account tab tile, the
 * full subscription screen, and the PaywallSheet teaser) and they ALL
 * use this helper — so the URLs flow from a single source of truth.
 *
 * URLs live at `expo.privacyPolicy` and `expo.termsOfService` in
 * `app.json` (NOT under `extra`). `Constants.expoConfig` returns the
 * contents of the `expo` block, so we read the keys directly.
 *
 * If either URL is missing or unreachable, the user gets a friendly
 * Alert rather than a silent failure — that matters for App Store
 * review, where a non-working link is itself a rejection ground.
 */
import { Alert, Linking } from 'react-native';
import Constants from 'expo-constants';

export type LegalUrlKey = 'privacyPolicy' | 'termsOfService';

export async function openLegalUrl(
  key: LegalUrlKey,
  label: string,
): Promise<void> {
  const expoConfig = (Constants.expoConfig ?? {}) as Record<string, unknown>;
  const url = typeof expoConfig[key] === 'string' ? (expoConfig[key] as string) : '';
  if (!url) {
    Alert.alert(label, `${label} link is not configured yet.`);
    return;
  }
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      Alert.alert(label, `Cannot open ${url}`);
      return;
    }
    await Linking.openURL(url);
  } catch (err) {
    Alert.alert(label, (err as Error).message);
  }
}
