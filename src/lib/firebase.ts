/**
 * Firebase client handles.
 *
 * The app uses the plain JavaScript Firebase SDK (no native modules).
 * Auth uses RN-aware AsyncStorage persistence so the user stays signed
 * in across launches; Firestore and Cloud Functions go through the
 * same modular SDK.
 *
 * To minimise churn across the ~40 feature files that already use the
 * `@react-native-firebase` chained surface (`db.collection().doc().get()`,
 * `firestore.FieldValue.serverTimestamp()`, `firestore.Timestamp`), this
 * module exposes a thin compatibility facade in front of the modular
 * SDK. Existing call sites only need to swap their import line:
 *
 *   import firestore from '@react-native-firebase/firestore';   // ❌ old
 *   import { firestore } from '@/src/lib/firebase';             // ✅ new
 *
 *   import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore'; // ❌
 *   import type { FirebaseFirestoreTypes } from '@/src/lib/firebase';                // ✅
 *
 * Cloud callable v2 functions go over plain HTTPS via `callFunction`.
 * The wire protocol matches what the official Functions SDK speaks, so
 * server-side handlers stay unchanged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  // `getReactNativePersistence` is exported from `firebase/auth` at
  // runtime but is intentionally absent from the public TS types. The
  // pattern below is the documented React Native bootstrap; the cast
  // pacifies the type-checker without hiding any other type errors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // @ts-expect-error - getReactNativePersistence is runtime-only export
  getReactNativePersistence,
  onAuthStateChanged as mOnAuthStateChanged,
  signOut as mSignOut,
  signInWithCustomToken as mSignInWithCustomToken,
  getIdTokenResult as mGetIdTokenResult,
  type Auth,
  type User,
  type IdTokenResult,
} from 'firebase/auth';
import {
  initializeFirestore,
  type Firestore,
  type DocumentData,
  type DocumentReference as MDocumentReference,
  type CollectionReference as MCollectionReference,
  type Query as MQuery,
  type DocumentSnapshot as MDocumentSnapshot,
  type QuerySnapshot as MQuerySnapshot,
  type QueryDocumentSnapshot as MQueryDocumentSnapshot,
  type Transaction as MTransaction,
  type WriteBatch,
  type SetOptions,
  type WhereFilterOp,
  type OrderByDirection,
  collection as mCollection,
  collectionGroup as mCollectionGroup,
  doc as mDoc,
  getDoc as mGetDoc,
  getDocs as mGetDocs,
  setDoc as mSetDoc,
  updateDoc as mUpdateDoc,
  deleteDoc as mDeleteDoc,
  addDoc as mAddDoc,
  query as mQueryFn,
  where as mWhere,
  orderBy as mOrderBy,
  limit as mLimit,
  startAfter as mStartAfter,
  endBefore as mEndBefore,
  onSnapshot as mOnSnapshot,
  serverTimestamp as mServerTimestamp,
  arrayUnion as mArrayUnion,
  arrayRemove as mArrayRemove,
  increment as mIncrement,
  deleteField as mDeleteField,
  Timestamp as MTimestamp,
  writeBatch as mWriteBatch,
  runTransaction as mRunTransaction,
} from 'firebase/firestore';

// ── Bootstrap ────────────────────────────────────────────────────────
// Web SDK config; values mirror `GoogleService-Info.plist`.
const firebaseApp: FirebaseApp = initializeApp({
  apiKey: 'AIzaSyCTXnw4GlafJIR1vZb9d02MLcF98nfPCyg',
  authDomain: 'sitexpens.firebaseapp.com',
  projectId: 'sitexpens',
  storageBucket: 'sitexpens.firebasestorage.app',
  messagingSenderId: '288864968221',
  appId: '1:288864968221:ios:d4d838777e1768526ff0f4',
});

const _auth: Auth = initializeAuth(firebaseApp, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const _firestore: Firestore = initializeFirestore(firebaseApp, {});

// ── Auth facade ──────────────────────────────────────────────────────
// Matches the surface our existing code touches (`auth.currentUser`,
// `auth.onAuthStateChanged`, `auth.signOut`). The full modular `Auth`
// instance is exposed as `_modular` for advanced flows (e.g.
// `signInWithCustomToken`).
type AuthListener = (user: User | null) => void;

export const auth = {
  get currentUser(): User | null {
    return _auth.currentUser;
  },
  onAuthStateChanged(cb: AuthListener): () => void {
    return mOnAuthStateChanged(_auth, cb);
  },
  signOut(): Promise<void> {
    return mSignOut(_auth);
  },
  signInWithCustomToken(token: string): Promise<{ user: User }> {
    return mSignInWithCustomToken(_auth, token).then((cred) => ({ user: cred.user }));
  },
  /**
   * Get the current user's ID token result, including custom claims
   * (`claims.orgs`, `claims.primaryOrgId`). Pass `forceRefresh: true`
   * to bypass the local cache and pull a fresh token from Firebase
   * (needed right after a server-side `setCustomUserClaims` call).
   *
   * Returns `null` when there is no signed-in user.
   */
  async getIdTokenResult(forceRefresh = false): Promise<IdTokenResult | null> {
    const u = _auth.currentUser;
    if (!u) return null;
    return mGetIdTokenResult(u, forceRefresh);
  },
  /** Internal: the underlying modular Auth instance. */
  _modular: _auth,
};

export type AuthUser = User;
export type { IdTokenResult };

// ── Firestore: chained-API facade ────────────────────────────────────
// The classes below mirror the surface of `@react-native-firebase`'s
// query/snapshot/ref objects on top of the modular SDK. We only
// implement the subset the codebase actually uses; the modular API is
// always reachable via the underscore-prefixed escape hatches if a
// caller needs something exotic.

class DocumentSnapshotFacade<T = DocumentData> {
  constructor(protected _snap: MDocumentSnapshot<T>) {}
  get id(): string {
    return this._snap.id;
  }
  get exists(): boolean {
    return this._snap.exists();
  }
  data(): T | undefined {
    return this._snap.data();
  }
  get ref(): DocumentRefFacade<T> {
    return new DocumentRefFacade<T>(this._snap.ref);
  }
}

class QueryDocumentSnapshotFacade<T = DocumentData> extends DocumentSnapshotFacade<T> {
  constructor(snap: MQueryDocumentSnapshot<T>) {
    super(snap);
  }
  override data(): T {
    return (this._snap as MQueryDocumentSnapshot<T>).data();
  }
}

class QuerySnapshotFacade<T = DocumentData> {
  constructor(private _snap: MQuerySnapshot<T>) {}
  get size(): number {
    return this._snap.size;
  }
  get empty(): boolean {
    return this._snap.empty;
  }
  get docs(): QueryDocumentSnapshotFacade<T>[] {
    return this._snap.docs.map((d) => new QueryDocumentSnapshotFacade<T>(d));
  }
  forEach(cb: (d: QueryDocumentSnapshotFacade<T>) => void): void {
    this._snap.docs.forEach((d) => cb(new QueryDocumentSnapshotFacade<T>(d)));
  }
}

class QueryFacade<T = DocumentData> {
  constructor(protected _q: MQuery<T>) {}
  where(field: string, op: WhereFilterOp, value: unknown): QueryFacade<T> {
    return new QueryFacade<T>(mQueryFn(this._q, mWhere(field, op, value)));
  }
  orderBy(field: string, dir?: OrderByDirection): QueryFacade<T> {
    return new QueryFacade<T>(mQueryFn(this._q, mOrderBy(field, dir)));
  }
  limit(n: number): QueryFacade<T> {
    return new QueryFacade<T>(mQueryFn(this._q, mLimit(n)));
  }
  startAfter(...values: unknown[]): QueryFacade<T> {
    return new QueryFacade<T>(mQueryFn(this._q, mStartAfter(...values)));
  }
  endBefore(...values: unknown[]): QueryFacade<T> {
    return new QueryFacade<T>(mQueryFn(this._q, mEndBefore(...values)));
  }
  async get(): Promise<QuerySnapshotFacade<T>> {
    return new QuerySnapshotFacade<T>(await mGetDocs(this._q));
  }
  onSnapshot(
    onNext: (snap: QuerySnapshotFacade<T>) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return mOnSnapshot(
      this._q,
      (s) => onNext(new QuerySnapshotFacade<T>(s)),
      onError,
    );
  }
  /** Internal: underlying modular Query. */
  _modular(): MQuery<T> {
    return this._q;
  }
}

class CollectionRefFacade<T = DocumentData> extends QueryFacade<T> {
  constructor(private _col: MCollectionReference<T>) {
    super(_col);
  }
  get id(): string {
    return this._col.id;
  }
  get path(): string {
    return this._col.path;
  }
  doc(id?: string): DocumentRefFacade<T> {
    return new DocumentRefFacade<T>(id ? mDoc(this._col, id) : mDoc(this._col));
  }
  async add(data: T): Promise<DocumentRefFacade<T>> {
    return new DocumentRefFacade<T>(await mAddDoc(this._col, data));
  }
}

class DocumentRefFacade<T = DocumentData> {
  constructor(private _ref: MDocumentReference<T>) {}
  get id(): string {
    return this._ref.id;
  }
  get path(): string {
    return this._ref.path;
  }
  collection(name: string): CollectionRefFacade {
    return new CollectionRefFacade(mCollection(this._ref, name) as MCollectionReference);
  }
  async get(): Promise<DocumentSnapshotFacade<T>> {
    return new DocumentSnapshotFacade<T>(await mGetDoc(this._ref));
  }
  async set(data: Partial<T>, options?: SetOptions): Promise<void> {
    if (options) await mSetDoc(this._ref, data as T, options);
    else await mSetDoc(this._ref, data as T);
  }
  async update(data: Record<string, unknown>): Promise<void> {
    // Modular `updateDoc` is strict about field paths; cast through
    // unknown so callers can keep using string-keyed payloads.
    await mUpdateDoc(this._ref as MDocumentReference, data);
  }
  async delete(): Promise<void> {
    await mDeleteDoc(this._ref);
  }
  onSnapshot(
    onNext: (snap: DocumentSnapshotFacade<T>) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return mOnSnapshot(
      this._ref,
      (s) => onNext(new DocumentSnapshotFacade<T>(s)),
      onError,
    );
  }
  /** Internal: underlying modular DocumentReference. */
  _modular(): MDocumentReference<T> {
    return this._ref;
  }
}

class WriteBatchFacade {
  constructor(private _b: WriteBatch) {}
  set<T extends DocumentData>(
    ref: DocumentRefFacade<T>,
    data: Partial<T>,
    options?: SetOptions,
  ): WriteBatchFacade {
    if (options) this._b.set(ref._modular(), data as T, options);
    else this._b.set(ref._modular(), data as T);
    return this;
  }
  update<T>(ref: DocumentRefFacade<T>, data: Record<string, unknown>): WriteBatchFacade {
    this._b.update(ref._modular() as MDocumentReference, data);
    return this;
  }
  delete<T>(ref: DocumentRefFacade<T>): WriteBatchFacade {
    this._b.delete(ref._modular());
    return this;
  }
  async commit(): Promise<void> {
    await this._b.commit();
  }
}

class TransactionFacade {
  constructor(private _tx: MTransaction) {}
  async get<T extends DocumentData>(
    ref: DocumentRefFacade<T>,
  ): Promise<DocumentSnapshotFacade<T>> {
    return new DocumentSnapshotFacade<T>(await this._tx.get(ref._modular()));
  }
  set<T extends DocumentData>(
    ref: DocumentRefFacade<T>,
    data: Partial<T>,
    options?: SetOptions,
  ): TransactionFacade {
    if (options) this._tx.set(ref._modular(), data as T, options);
    else this._tx.set(ref._modular(), data as T);
    return this;
  }
  update<T>(ref: DocumentRefFacade<T>, data: Record<string, unknown>): TransactionFacade {
    this._tx.update(ref._modular() as MDocumentReference, data);
    return this;
  }
  delete<T>(ref: DocumentRefFacade<T>): TransactionFacade {
    this._tx.delete(ref._modular());
    return this;
  }
}

class FirestoreFacade {
  collection(path: string): CollectionRefFacade {
    return new CollectionRefFacade(mCollection(_firestore, path) as MCollectionReference);
  }
  collectionGroup(name: string): QueryFacade {
    return new QueryFacade(mCollectionGroup(_firestore, name));
  }
  doc(path: string): DocumentRefFacade {
    return new DocumentRefFacade(mDoc(_firestore, path) as MDocumentReference);
  }
  batch(): WriteBatchFacade {
    return new WriteBatchFacade(mWriteBatch(_firestore));
  }
  runTransaction<T>(fn: (tx: TransactionFacade) => Promise<T>): Promise<T> {
    return mRunTransaction(_firestore, (tx) => fn(new TransactionFacade(tx)));
  }
  /** Internal: underlying modular Firestore. */
  _modular(): Firestore {
    return _firestore;
  }
}

export const db = new FirestoreFacade();

// ── `firestore.*` value namespace ────────────────────────────────────
// Matches the static helpers exposed by `@react-native-firebase/firestore`.
// `Timestamp` is the modular SDK's class directly — its instances are
// structurally identical (same `.toDate()`, `.toMillis()`, `.seconds`,
// `.nanoseconds`).
export const firestore = {
  FieldValue: {
    serverTimestamp: (): unknown => mServerTimestamp(),
    arrayUnion: (...elements: unknown[]): unknown => mArrayUnion(...elements),
    arrayRemove: (...elements: unknown[]): unknown => mArrayRemove(...elements),
    increment: (n: number): unknown => mIncrement(n),
    delete: (): unknown => mDeleteField(),
  },
  Timestamp: MTimestamp,
};

// ── `FirebaseFirestoreTypes.*` type namespace ────────────────────────
// Re-exports facade types under the same import name the rest of the
// codebase uses. Adding new aliases here is the only way to widen the
// surface — keep the list focused on what we actually consume.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace FirebaseFirestoreTypes {
  export type Timestamp = MTimestamp;
  export type Query<T = DocumentData> = QueryFacade<T>;
  export type CollectionReference<T = DocumentData> = CollectionRefFacade<T>;
  export type DocumentReference<T = DocumentData> = DocumentRefFacade<T>;
  export type DocumentSnapshot<T = DocumentData> = DocumentSnapshotFacade<T>;
  export type QuerySnapshot<T = DocumentData> = QuerySnapshotFacade<T>;
  export type QueryDocumentSnapshot<T = DocumentData> = QueryDocumentSnapshotFacade<T>;
  export type Module = FirestoreFacade;
}

// ── Cloud Functions over plain HTTPS ─────────────────────────────────
// Region + project id of our Cloud Functions deployment. These mirror
// what `firebase deploy --only functions` ships and what
// `GoogleService-Info.plist` declares for `PROJECT_ID`. If we ever move
// regions, change `FUNCTIONS_REGION` here.
const FUNCTIONS_REGION = 'us-central1';
const FIREBASE_PROJECT_ID = 'sitexpens';

/** Payload shape Firebase sends on `error.details` for callable HTTPS errors. */
export type FirebaseCallableErrorDetails = {
  reason?: string;
  tier?: string;
  limit?: number;
  used?: number;
};

/**
 * Structured failure from `callFunction` when the response includes
 * `body.error` (Google Cloud HTTP error mapping). Lets billing code
 * read `code` + `details` like the official Functions SDK.
 */
export class FirebaseCallableHttpError extends Error {
  constructor(
    message: string,
    /** gRPC-style code parsed from `error.status`, e.g. `failed-precondition`. */
    public readonly code: string,
    public readonly details?: FirebaseCallableErrorDetails,
  ) {
    super(message);
    this.name = 'FirebaseCallableHttpError';
  }
}

/** Maps `FAILED_PRECONDITION` → `failed-precondition` per callable wire format. */
function mapRpcStatusToGrpcCode(status: string | undefined): string {
  if (!status) return 'internal';
  return status.toLowerCase().replace(/_/g, '-');
}

function normalizeCallableDetails(
  details: unknown,
): FirebaseCallableErrorDetails | undefined {
  if (details == null) return undefined;
  if (typeof details === 'object' && !Array.isArray(details)) {
    const o = details as Record<string, unknown>;
    if (
      typeof o.reason === 'string' ||
      typeof o.tier === 'string' ||
      typeof o.limit === 'number'
    ) {
      return {
        reason: typeof o.reason === 'string' ? o.reason : undefined,
        tier: typeof o.tier === 'string' ? o.tier : undefined,
        limit: typeof o.limit === 'number' ? o.limit : undefined,
        used: typeof o.used === 'number' ? o.used : undefined,
      };
    }
  }
  if (Array.isArray(details)) {
    for (const item of details) {
      const one = normalizeCallableDetails(item);
      if (one && (one.reason || one.tier !== undefined)) return one;
    }
  }
  return undefined;
}

/**
 * Call a Firebase `onCall` v2 Cloud Function over plain HTTPS.
 *
 * Wire format (matches what the official Functions SDK speaks):
 *   POST https://<region>-<projectId>.cloudfunctions.net/<name>
 *   Authorization: Bearer <firebase id token>      (when signed-in)
 *   Content-Type: application/json
 *   Body:    { "data": <payload> }
 *   Success: { "result": <data> }                  → returned as { data }
 *   Error:   { "error": { "message": "...", ... } }
 *
 * We mirror the `httpsCallable` API surface (returns `{ data }`) so
 * callers don't need to change their result-handling code.
 */
export async function callFunction<TPayload, TResult>(
  name: string,
  payload: TPayload,
): Promise<{ data: TResult }> {
  const user = _auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const url = `https://${FUNCTIONS_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/${name}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ data: payload }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Network error calling ${name}: ${msg}`);
  }

  let body: {
    result?: TResult;
    error?: { message?: string; status?: string; details?: unknown };
  };
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new Error(`${name} failed: HTTP ${res.status}`);
    throw new Error(`${name} returned a non-JSON response`);
  }

  if (body.error) {
    const rpc = body.error;
    const grpcCode = mapRpcStatusToGrpcCode(rpc.status);
    const details = normalizeCallableDetails(rpc.details);
    throw new FirebaseCallableHttpError(
      rpc.message ?? `HTTP ${res.status}`,
      grpcCode,
      details,
    );
  }

  if (!res.ok) {
    throw new FirebaseCallableHttpError(
      `${name} failed: HTTP ${res.status}`,
      'internal',
      undefined,
    );
  }

  return { data: body.result as TResult };
}
