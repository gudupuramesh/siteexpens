# SiteExpens

A project management & expenses app for interior-fitout / construction teams.
Built with **Expo (React Native)**, **Firebase** (Auth + Firestore + Cloud
Functions) and **Cloudflare R2** for file storage.

> **Status:** Phase 1 — bootstrap. The app currently has phone-OTP sign-in
> and an empty "My Projects" landing screen. Real features (organizations,
> projects, expenses, staff, attendance, files, material requests) land in
> follow-up PRs.

## Architecture in one paragraph

A user signs up with their phone number and creates an **Organization**
(their company). Under that Organization they create **Projects** and invite
teammates by mobile number with per-project roles
(`owner` / `admin` / `partner` / `supervisor` / `manager`). Projects live as
root-level Firestore documents so multiple users can collaborate on the same
project. Files (photos, drawings, receipts) are uploaded directly to
**Cloudflare R2** using presigned URLs minted by a Firebase Cloud Function —
R2 keys never touch the client.

## Prerequisites

- **Node 20** (the `functions/` workspace targets Node 20)
- **npm** 10+
- A **Firebase project** with the Phone Auth provider enabled, plus an
  Android and an iOS app registered (bundle id `com.siteexpens.app`)
- (Optional, later) **Cloudflare R2** bucket + access key
- An **EAS** account (`npx eas-cli@latest login`) — a dev build is required,
  Expo Go is **not** supported

## Firebase setup

1. Firebase Console → *Authentication* → *Sign-in method* → enable **Phone**.
2. Register an **Android** app with package `com.siteexpens.app`. Download
   `google-services.json` and drop it at the repo root.
3. Register an **iOS** app with bundle id `com.siteexpens.app`. Download
   `GoogleService-Info.plist` and drop it at the repo root.
   Both files are gitignored.
4. Android phone auth requires SHA-1/SHA-256 fingerprints in the Firebase
   Android app — after `eas build`, run `eas credentials` to read the
   keystore fingerprints and paste them into the Firebase console.
5. iOS phone auth uses silent APNs — upload an APNs **auth key** to Firebase
   Cloud Messaging (Project settings → Cloud Messaging → Apple app config).

## Getting started

```bash
# 1. Install client deps
npm install

# 2. Install Cloud Functions deps
npm --prefix functions install

# 3. Place google-services.json / GoogleService-Info.plist at the repo root
#    (see Firebase setup above)

# 4. Build a dev client (once per machine / whenever native deps change)
npx expo prebuild --clean
npx eas build --profile development --platform android
# or --platform ios
```

Install the resulting dev-client build on a physical device, then:

```bash
npm run start          # metro bundler
# press `a` to open on Android, `i` on iOS
```

## Phone OTP

Phone auth is delivered by `@react-native-firebase/auth` — the first Send
code tap will trigger a real SMS. For development you can add test numbers
in Firebase Console → *Authentication* → *Sign-in method* → *Phone* →
*Phone numbers for testing* (e.g. `+919999999999 / 123456`).

## Cloud Functions

```bash
cd functions

npm run build       # tsc
npm run deploy      # firebase deploy --only functions
```

The Phase 1 functions codebase contains a single `helloWorld` callable to
verify the deploy pipeline. Real functions (`inviteMember`, `onUserCreated`,
`r2PresignedUrl`) land alongside the matching client features.

## Project layout

```
app/                 Expo Router routes
  _layout.tsx          Root providers (QueryClient, AuthProvider)
  index.tsx            Auth-state redirect
  (auth)/              Sign-in & verify
  (app)/               Authenticated app surface
src/
  lib/                 firebase init, env helpers
  features/auth/       AuthProvider, phoneAuth wrapper
  theme/               Colors / design tokens
functions/           Firebase Cloud Functions (Node 20, TypeScript)
firebase.json        Firebase project config
firestore.rules      Firestore security rules
```

## Roadmap

1. **Bootstrap** (this PR) — Expo + Firebase + phone-OTP sign-in + empty Projects screen.
2. **Organizations & Projects** — first-run org creation, create/list projects, security rules.
3. **Members & invite-by-phone** — `inviteMember` callable + `onUserCreated` reconciliation.
4. **Expenses** — list, add, categories, totals.
5. **Staff & Attendance** — staff directory, daily attendance.
6. **Files (R2)** — `r2PresignedUrl` Cloud Function + upload UI.
7. **Material requests** — request form, approval workflow.
8. **Push notifications** — Expo Notifications + FCM.
