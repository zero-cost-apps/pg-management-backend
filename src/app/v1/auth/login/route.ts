import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import {
  findUserByEmailOrPhone,
  createSession,
  sanitizeUser,
} from '@/lib/db/repositories/userRepo';
import {
  comparePassword,
  createAccessToken,
  generateRefreshToken,
  hashToken,
} from '@/lib/auth/jwt';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { emailOrPhone, password } = body;

    if (!emailOrPhone || !password) {
      return errorResponse(
        'VALIDATION_ERROR',
        'emailOrPhone and password are required.',
        undefined,
        400
      );
    }

    const user = await findUserByEmailOrPhone(emailOrPhone);
    if (!user) {
      return errorResponse('UNAUTHENTICATED', 'Invalid email/phone or password.', undefined, 401);
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return errorResponse('UNAUTHENTICATED', 'Invalid email/phone or password.', undefined, 401);
    }

    const sessionId = uuidv4();
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await createSession({
      id: sessionId,
      userId: user.id,
      refreshTokenHash,
      createdAt: new Date().toISOString(),
      expiresAt,
      revokedAt: null,
    });

    const safeUser = sanitizeUser(user);
    const tokens = await createAccessToken(safeUser, sessionId);

    return successResponse({
      user: safeUser,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken,
        expiresIn: tokens.expiresIn,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred.', undefined, 500);
  }
}
