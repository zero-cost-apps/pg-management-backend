import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '@/types';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'pg_staysync_jwt_secret_key_2026_super_secure'
);

export interface AccessTokenClaims {
  sub: string;
  role: string;
  sid: string;
  email: string;
  isOnboarded: boolean;
}

export async function createAccessToken(
  user: User,
  sid: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const expiresIn = 900; // 15 minutes in seconds
  const token = await new SignJWT({
    sub: user.id,
    role: user.role,
    sid,
    email: user.email,
    isOnboarded: user.isOnboarded,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);

  return { accessToken: token, expiresIn };
}

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return `rt_${crypto.randomBytes(32).toString('hex')}`;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}
