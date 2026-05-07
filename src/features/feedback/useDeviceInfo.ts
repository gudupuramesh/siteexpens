/**
 * `useDeviceInfo` — gathers the device + app info we attach to every
 * feedback submission. Pure read; no Firestore touch.
 *
 * Why a hook instead of a one-shot getter:
 *   - The fields are static for the app's lifetime, but reading them
 *     in a hook gives consumers a stable identity and keeps the
 *     feedback form free of imperative `Constants.…` calls.
 *   - Lets us add platform-specific lookups later (e.g. battery /
 *     network type) without changing the call sites.
 */
import { useMemo } from 'react';
import { Platform } from 'react-native';

import * as Device from 'expo-device';
import Constants from 'expo-constants';

import type { FeedbackDeviceInfo } from './types';

export function useDeviceInfo(): FeedbackDeviceInfo {
  return useMemo(() => {
    // expo-constants exposes the values we baked into app.json. We
    // read both `expoConfig` (modern) and the legacy `manifest` slot
    // so this works whether the runtime is dev-client or release.
    const cfg = (Constants.expoConfig ?? {}) as {
      version?: string;
      ios?: { buildNumber?: string };
      android?: { versionCode?: number };
    };

    const appVersion = cfg.version ?? '';
    const appBuildNumber =
      Platform.OS === 'ios'
        ? cfg.ios?.buildNumber ?? ''
        : cfg.android?.versionCode != null
        ? String(cfg.android.versionCode)
        : '';

    // expo-device returns null for any field it can't resolve (e.g.
    // running in a Simulator or web). Coerce to '' so the Firestore
    // doc shape stays uniform — no `null` vs `undefined` ambiguity in
    // the admin portal.
    return {
      platform: String(Platform.OS),
      osVersion: String(Platform.Version ?? Device.osVersion ?? ''),
      modelName: Device.modelName ?? '',
      modelId: Device.modelId ?? '',
      appVersion,
      appBuildNumber,
    };
  }, []);
}
