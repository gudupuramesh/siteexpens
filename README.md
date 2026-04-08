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
- A **Firebase project** with the Phone Auth provider enabled
- (Optional, later) **Cloudflare R2** bucket + access key
- For native builds: an **EAS** account (`npx eas-cli@latest login`)

## Getting started

```bash
# 1. Install client deps
npm install

# 2. Install Cloud Functions deps
npm --prefix functions install

# 3. Configure environment
cp .env.example .env
# Fill in EXPO_PUBLIC_FIREBASE_* from Firebase Console -> Project settings.

# 4. Run the app
npm run start
```

Open the project in Expo Go on your phone, or press `w` to open it in a
browser.

## Phone OTP — current limitation

The Firebase JS SDK's `signInWithPhoneNumber` works on **web** but requires
extra setup on **native** (either an EAS dev build with
`@react-native-firebase/auth`, or an in-app reCAPTCHA via WebView). For now,
test phone auth in the browser using a Firebase Auth **test phone number**:

1. Firebase Console -> Authentication -> Sign-in method -> Phone -> Phone
   numbers for testing -> add `+919999999999 / 123456`.
2. `npm run start`, press `w`.
3. Enter `+919999999999`, then `123456`.
4. You should land on the empty "My Projects" screen and see a `users/{uid}`
   document appear in Firestore.

Native phone auth is tracked for the next PR.

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
