import { StoredUser, User, Session, PasswordOtp } from '@/types';
import {
  getGlobalUsersPath,
  getGlobalSessionsPath,
  getGlobalOtpsPath,
  readJson,
  writeJson,
} from '../jsonStore';

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
  return readJson<StoredUser[]>(getGlobalUsersPath(), []);
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const users = await getAllStoredUsers();
  return users.find((u) => u.id === id) || null;
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const users = await getAllStoredUsers();
  const normalized = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === normalized) || null;
}

export async function findUserByPhone(phone: string): Promise<StoredUser | null> {
  const digits = phone.replace(/\D/g, '').slice(-10);
  const users = await getAllStoredUsers();
  return (
    users.find((u) => {
      const uDigits = u.phone.replace(/\D/g, '').slice(-10);
      return uDigits === digits;
    }) || null
  );
}

export async function findUserByEmailOrPhone(identifier: string): Promise<StoredUser | null> {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return findUserByEmail(trimmed);
  }
  return findUserByPhone(trimmed);
}

export async function createUser(newUser: StoredUser): Promise<User> {
  const users = await getAllStoredUsers();
  users.push(newUser);
  await writeJson(getGlobalUsersPath(), users);
  return sanitizeUser(newUser);
}

export async function updateUser(
  id: string,
  updates: Partial<StoredUser>
): Promise<User | null> {
  const users = await getAllStoredUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return null;

  users[index] = {
    ...users[index],
    ...updates,
    bankDetails: updates.bankDetails
      ? { ...users[index].bankDetails, ...updates.bankDetails }
      : users[index].bankDetails,
  };

  await writeJson(getGlobalUsersPath(), users);
  return sanitizeUser(users[index]);
}

// ---------------- Sessions ----------------

export async function getAllSessions(): Promise<Session[]> {
  return readJson<Session[]>(getGlobalSessionsPath(), []);
}

export async function createSession(
  session: Session
): Promise<Session> {
  const sessions = await getAllSessions();
  sessions.push(session);
  await writeJson(getGlobalSessionsPath(), sessions);
  return session;
}

export async function findSessionByTokenHash(
  tokenHash: string
): Promise<Session | null> {
  const sessions = await getAllSessions();
  return (
    sessions.find(
      (s) => s.refreshTokenHash === tokenHash && !s.revokedAt && new Date(s.expiresAt) > new Date()
    ) || null
  );
}

export async function revokeSession(tokenHash: string): Promise<void> {
  const sessions = await getAllSessions();
  const index = sessions.findIndex((s) => s.refreshTokenHash === tokenHash);
  if (index !== -1) {
    sessions[index].revokedAt = new Date().toISOString();
    await writeJson(getGlobalSessionsPath(), sessions);
  }
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const sessions = await getAllSessions();
  let changed = false;
  const now = new Date().toISOString();
  for (const s of sessions) {
    if (s.userId === userId && !s.revokedAt) {
      s.revokedAt = now;
      changed = true;
    }
  }
  if (changed) {
    await writeJson(getGlobalSessionsPath(), sessions);
  }
}

// ---------------- Password OTPs ----------------

export async function createPasswordOtp(otp: PasswordOtp): Promise<void> {
  const otps = await readJson<PasswordOtp[]>(getGlobalOtpsPath(), []);
  otps.push(otp);
  await writeJson(getGlobalOtpsPath(), otps);
}

export async function findValidOtp(
  userId: string,
  otpHash: string
): Promise<PasswordOtp | null> {
  const otps = await readJson<PasswordOtp[]>(getGlobalOtpsPath(), []);
  const now = new Date();
  const found = otps.find(
    (o) =>
      o.userId === userId &&
      o.otpHash === otpHash &&
      !o.consumedAt &&
      new Date(o.expiresAt) > now
  );
  return found || null;
}

export async function consumeOtp(otpId: string): Promise<void> {
  const otps = await readJson<PasswordOtp[]>(getGlobalOtpsPath(), []);
  const index = otps.findIndex((o) => o.id === otpId);
  if (index !== -1) {
    otps[index].consumedAt = new Date().toISOString();
    await writeJson(getGlobalOtpsPath(), otps);
  }
}
