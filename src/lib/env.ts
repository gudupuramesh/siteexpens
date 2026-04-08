/**
 * Typed access to the EXPO_PUBLIC_* environment variables that the client
 * needs at startup. Throws a clear, actionable error if any are missing so
 * developers don't hit cryptic Firebase errors later.
 *
 * NOTE: Expo's bundler replaces `process.env.EXPO_PUBLIC_*` references at
 * build time. We must reference each variable by its literal name — dynamic
 * lookup like `process.env[name]` does not work.
 */

type EnvShape = {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    storageBucket?: string;
    messagingSenderId?: string;
  };
};

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in before running the app.`,
    );
  }
  return value;
}

function optional(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

export const env: EnvShape = {
  firebase: {
    apiKey: required(
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    ),
    authDomain: required(
      'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    ),
    projectId: required(
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    ),
    appId: required(
      'EXPO_PUBLIC_FIREBASE_APP_ID',
      process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    ),
    storageBucket: optional(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: optional(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  },
};
