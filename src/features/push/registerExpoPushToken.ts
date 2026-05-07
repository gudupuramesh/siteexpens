/**
 * Registers this device for Expo push notifications and stores the token on
 * `users/{uid}.expoPushTokens` for Cloud Functions (`approvalNotifications`).
 *
 * No static import of `expo-notifications`: Expo Go SDK 53+ removed Android remote
 * push and loading the module crashes the bundle. We skip in Expo Go and dynamic-import
 * elsewhere. Use a development build for real push testing.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { db, firestore } from '@/src/lib/firebase';

let notificationHandlerInstalled = false;

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export async function registerExpoPushToken(uid: string): Promise<void> {
  if (Platform.OS === 'web') return;

  if (isExpoGo()) {
    console.warn(
      '[push] Remote push is not available in Expo Go (SDK 53+). Use a development build to register tokens.',
    );
    return;
  }

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
      ?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn(
      '[push] No EAS project id — set expo.extra.eas.projectId in app.json for Expo push tokens.',
    );
    return;
  }

  let Notifications: typeof import('expo-notifications');
  try {
    Notifications = await import('expo-notifications');
  } catch (err) {
    console.warn('[push] expo-notifications module unavailable:', err);
    return;
  }

  if (!notificationHandlerInstalled) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerInstalled = true;
  }

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('approvals', {
        name: 'Approvals',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    if (!token) return;

    await db.collection('users').doc(uid).set(
      {
        expoPushTokens: firestore.FieldValue.arrayUnion(token),
        expoPushTokenUpdatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn('[push] registerExpoPushToken skipped:', err);
  }
}
