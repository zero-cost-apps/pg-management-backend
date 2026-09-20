import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let isInitialized = false;

export function isFirebaseConfigured(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return true;
  }
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

export function initFirebase(): App | null {
  const existingApps = getApps();
  if (isInitialized && existingApps.length > 0) {
    return existingApps[0]!;
  }

  if (!isFirebaseConfigured()) {
    return null;
  }

  try {
    if (existingApps.length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        initializeApp({
          credential: cert(serviceAccount),
        });
      } else {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

        // Handle escaped newlines from environment variables
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, '\n');

        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      }
    }
    isInitialized = true;
    return getApps()[0]!;
  } catch (error) {
    console.error('[Firebase] Failed to initialize Firebase Admin SDK:', error);
    return null;
  }
}

export function getFirestoreDb(): Firestore | null {
  const app = initFirebase();
  if (!app) return null;
  const db = getFirestore(app);
  // Ensure undefined values are ignored rather than throwing errors
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

// Typed collections
export const COLLECTIONS = {
  USERS: 'users',
  SESSIONS: 'sessions',
  OTPS: 'otps',
  BUILDINGS: 'buildings',
  ROOMS: 'rooms',
  TENANTS: 'tenants',
  CO_OCCUPANTS: 'coOccupants',
  ELECTRICITY: 'electricity',
  PAYMENTS: 'payments',
  DOCUMENTS: 'documents',
  IDEMPOTENCY: 'idempotency',
} as const;

export type { Firestore };
