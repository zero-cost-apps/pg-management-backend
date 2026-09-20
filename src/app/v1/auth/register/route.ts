import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import {
  findUserByEmail,
  findUserByPhone,
  createUser,
  createSession,
} from '@/lib/db/repositories/userRepo';
import {
  hashPassword,
  createAccessToken,
  generateRefreshToken,
  hashToken,
} from '@/lib/auth/jwt';
import { StoredUser } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, phone, password, businessName } = body;

    const fields: Record<string, string> = {};

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 80) {
      fields.fullName = 'Full name must be between 2 and 80 characters.';
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      fields.email = 'Valid email is required.';
    }

    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      fields.phone = 'Phone must be a 10-digit Indian mobile number.';
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      fields.password = 'Password must be at least 6 characters.';
    }

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    // Check unique email
    const existingEmail = await findUserByEmail(cleanEmail);
    if (existingEmail) {
      return errorResponse('CONFLICT', 'Email is already registered.', { email: 'already in use' }, 409);
    }

    // Check unique phone
    const existingPhone = await findUserByPhone(cleanPhone);
    if (existingPhone) {
      return errorResponse('CONFLICT', 'Phone number is already registered.', { phone: 'already in use' }, 409);
    }

    const userId = uuidv4();
    const passwordHash = await hashPassword(password);
    const resolvedBusinessName = businessName && typeof businessName === 'string' && businessName.trim()
      ? businessName.trim()
      : `${fullName.trim()}'s PG Accommodations`;

    const storedUser: StoredUser = {
      id: userId,
      fullName: fullName.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      role: 'owner',
      businessName: resolvedBusinessName,
      avatarUrl: null,
      isOnboarded: false,
      createdAt: new Date().toISOString(),
      gstNumber: null,
      businessAddress: null,
      bankDetails: {
        accountNumber: null,
        ifscCode: null,
        accountHolderName: null,
        bankName: null,
        upiId: null,
      },
      passwordHash,
    };

    const safeUser = await createUser(storedUser);

    const sessionId = uuidv4();
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await createSession({
      id: sessionId,
      userId,
      refreshTokenHash,
      createdAt: new Date().toISOString(),
      expiresAt,
      revokedAt: null,
    });

    const tokens = await createAccessToken(safeUser, sessionId);

    return successResponse(
      {
        user: safeUser,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken,
          expiresIn: tokens.expiresIn,
        },
      },
      undefined,
      201
    );
  } catch (err) {
    console.error('Registration error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred.', undefined, 500);
  }
}
