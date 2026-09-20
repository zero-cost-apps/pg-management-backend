import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import {
  findSessionByTokenHash,
  revokeSession,
  createSession,
  findUserById,
  sanitizeUser,
  revokeAllUserSessions,
} from '@/lib/db/repositories/userRepo';
import {
  hashToken,
  generateRefreshToken,
  createAccessToken,
} from '@/lib/auth/jwt';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'refreshToken is required.', undefined, 400);
    }

    const tokenHash = hashToken(refreshToken);
    const session = await findSessionByTokenHash(tokenHash);

    if (!session) {
      // Could be reuse of a revoked token
      return errorResponse('UNAUTHENTICATED', 'Invalid or expired refresh token.', undefined, 401);
    }

    // Revoke old session (token rotation)
    await revokeSession(tokenHash);

    const user = await findUserById(session.userId);
    if (!user) {
      await revokeAllUserSessions(session.userId);
      return errorResponse('UNAUTHENTICATED', 'User no longer exists.', undefined, 401);
    }

    const newSessionId = uuidv4();
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await createSession({
      id: newSessionId,
      userId: user.id,
      refreshTokenHash: newRefreshTokenHash,
      createdAt: new Date().toISOString(),
      expiresAt,
      revokedAt: null,
    });

    const safeUser = sanitizeUser(user);
    const tokens = await createAccessToken(safeUser, newSessionId);

    return successResponse({
      accessToken: tokens.accessToken,
      refreshToken: newRefreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (err) {
    console.error('Refresh error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred.', undefined, 500);
  }
}
