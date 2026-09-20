import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import fs from 'fs';
import path from 'path';

export const firebaseConfig = {
  apiKey: "AIzaSyBlNDT3Nxrore2hD8JoHJh7Cd23m6DZZ_4",
  authDomain: "pg-management-4e5f4.firebaseapp.com",
  projectId: "pg-management-4e5f4",
  storageBucket: "pg-management-4e5f4.firebasestorage.app",
  messagingSenderId: "788310595999",
  appId: "1:788310595999:web:4c3443208fe844c743c5aa",
  measurementId: "G-QF0RFHNWWB"
};

let firestoreInstance: any = null;

export function isFirebaseConfigured(): boolean {
  return true;
}

export function getFirestoreDb(): any {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  // 1. If Service Account key is provided (file or env), use Admin SDK for elevated server privileges
  const localKeyPath = path.join(process.cwd(), 'serviceAccountKey.json');
  const hasLocalKey = fs.existsSync(localKeyPath);

  if (
    hasLocalKey ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
  ) {
    try {
      const existing = getAdminApps();
      let adminApp;
      if (existing.length > 0) {
        adminApp = existing[0]!;
      } else if (hasLocalKey) {
        const keyData = JSON.parse(fs.readFileSync(localKeyPath, 'utf-8'));
        adminApp = initAdminApp({
          credential: cert(keyData),
        });
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        adminApp = initAdminApp({
          credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
        });
      } else {
        let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
        privateKey = privateKey.replace(/\\n/g, '\n');
        adminApp = initAdminApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey,
          }),
        });
      }
      const adminDb = getAdminFirestore(adminApp);
      adminDb.settings({ ignoreUndefinedProperties: true });
      firestoreInstance = adminDb;
      return adminDb;
    } catch (err) {
      console.warn('[Firebase] Admin SDK init failed, falling back to firebaseConfig:', err);
    }
  }

  // 2. Initialize Firestore using the user's firebaseConfig
  try {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    const db = app.firestore();
    firestoreInstance = db;
    return db;
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firestore with firebaseConfig:', err);
    throw err;
  }
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

export type Firestore = any;
