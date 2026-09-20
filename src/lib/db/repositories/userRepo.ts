import { StoredUser, User, Session, PasswordOtp } from '@/types';
import { getFirestoreDb, COLLECTIONS } from '../firebase';

export function sanitizeUser(stored: StoredUser): User {
  const { passwordHash: _hash, ...safeUser } = stored;
  return {
    ...safeUser,
    bankDetails: safeUser.bankDetails
      ? {
          ...safeUser.bankDetails,
          accountNumber: safeUser.bankDetails.accountNumber
            ? safeUser.bankDetails.accountNumber.length > 4
              ? 'X'.repeat(safeUser.bankDetails.accountNumber.length - 4) +
                safeUser.bankDetails.accountNumber.slice(-4)
              : safeUser.bankDetails.accountNumber
            : null,
        }
      : {
          accountNumber: null,
          ifscCode: null,
          accountHolderName: null,
          bankName: null,
          upiId: null,
        },
  };
}

export async function getAllStoredUsers(): Promise<StoredUser[]> {
  const db = getFirestoreDb();
  const snapshot = await db.collection(COLLECTIONS.USERS).get();
  return snapshot.docs.map((doc: any) => doc.data() as StoredUser);
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const db = getFirestoreDb();
  const doc = await db.collection(COLLECTIONS.USERS).doc(id).get();
  if (!doc.exists) return null;
  return doc.data() as StoredUser;
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = email.trim().toLowerCase();
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.USERS)
    .where('email', '==', normalized)
    .limit(1)
    .get();
  if (snapshot.empty) {
    // In case email was saved with different casing in older records
    const all = await getAllStoredUsers();
    return all.find((u) => u.email.toLowerCase() === normalized) || null;
  }
  return snapshot.docs[0].data() as StoredUser;
}

export async function findUserByPhone(phone: string): Promise<StoredUser | null> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  const db = getFirestoreDb();
  const snapshot = await db.collection(COLLECTIONS.USERS).get();
  for (const doc of snapshot.docs) {
    const u = doc.data() as StoredUser;
    if (u.phone && u.phone.replace(/\D/g, '').slice(-10) === digits) {
      return u;
    }
  }
  return null;
}

export async function findUserByEmailOrPhone(identifier: string): Promise<StoredUser | null> {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return findUserByEmail(trimmed);
  }
  return findUserByPhone(trimmed);
}

export async function createUser(newUser: StoredUser): Promise<User> {
  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.USERS).doc(newUser.id).set(newUser);
  return sanitizeUser(newUser);
}

export async function updateUser(
  id: string,
  updates: Partial<StoredUser>
): Promise<User | null> {
  const db = getFirestoreDb();
  const docRef = db.collection(COLLECTIONS.USERS).doc(id);
  const existing = await docRef.get();
  if (!existing.exists) return null;
  const current = existing.data() as StoredUser;
  const updated: StoredUser = {
    ...current,
    ...updates,
    bankDetails: updates.bankDetails
      ? { ...current.bankDetails, ...updates.bankDetails }
      : current.bankDetails,
  };
  await docRef.set(updated);
  return sanitizeUser(updated);
}

// ---------------- Sessions ----------------

export async function getAllSessions(): Promise<Session[]> {
  const db = getFirestoreDb();
  const snapshot = await db.collection(COLLECTIONS.SESSIONS).get();
  return snapshot.docs.map((d: any) => d.data() as Session);
}

export async function createSession(session: Session): Promise<Session> {
  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.SESSIONS).doc(session.id).set(session);
  return session;
}

export async function findSessionByTokenHash(
  tokenHash: string
): Promise<Session | null> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.SESSIONS)
    .where('refreshTokenHash', '==', tokenHash)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const s = snapshot.docs[0].data() as Session;
  if (s.revokedAt || new Date(s.expiresAt) <= new Date()) {
    return null;
  }
  return s;
}

export async function revokeSession(tokenHash: string): Promise<void> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.SESSIONS)
    .where('refreshTokenHash', '==', tokenHash)
    .limit(1)
    .get();
  if (!snapshot.empty) {
    await snapshot.docs[0].ref.update({
      revokedAt: new Date().toISOString(),
    });
  }
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.SESSIONS)
    .where('userId', '==', userId)
    .get();
  const batch = db.batch();
  const now = new Date().toISOString();
  snapshot.docs.forEach((doc: any) => {
    const data = doc.data() as Session;
    if (!data.revokedAt) {
      batch.update(doc.ref, { revokedAt: now });
    }
  });
  await batch.commit();
}

// ---------------- Password OTPs ----------------

export async function createPasswordOtp(otp: PasswordOtp): Promise<void> {
  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.OTPS).doc(otp.id).set(otp);
}

export async function findValidOtp(
  userId: string,
  otpHash: string
): Promise<PasswordOtp | null> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection(COLLECTIONS.OTPS)
    .where('userId', '==', userId)
    .where('otpHash', '==', otpHash)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const o = snapshot.docs[0].data() as PasswordOtp;
  if (o.consumedAt || new Date(o.expiresAt) <= new Date()) {
    return null;
  }
  return o;
}

export async function consumeOtp(otpId: string): Promise<void> {
  const db = getFirestoreDb();
  await db.collection(COLLECTIONS.OTPS).doc(otpId).update({
    consumedAt: new Date().toISOString(),
  });
}
