import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from './jwt';
import { findUserById } from '../db/repositories/userRepo';
import { errorResponse } from '../utils/envelope';
import { User } from '@/types';

export interface AuthContext {
  user: User;
  ownerId: string;
}

export type AuthResult =
  | { success: true; context: AuthContext }
  | { success: false; response: NextResponse };

export async function authenticateRequest(
  req: NextRequest,
  options: { requireOnboarded?: boolean } = { requireOnboarded: true }
): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      response: errorResponse(
        'UNAUTHENTICATED',
        'Authentication required. Please provide a valid Bearer token in the Authorization header.',
        undefined,
        401
      ),
    };
  }

  const token = authHeader.substring(7).trim();
  const payload = await verifyAccessToken(token);
  if (!payload) {
    return {
      success: false,
      response: errorResponse(
        'TOKEN_EXPIRED',
        'Invalid or expired access token.',
        undefined,
        401
      ),
    };
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    return {
      success: false,
      response: errorResponse('UNAUTHENTICATED', 'User not found.', undefined, 401),
    };
  }

  if (options.requireOnboarded && !user.isOnboarded) {
    return {
      success: false,
      response: errorResponse(
        'NOT_ONBOARDED',
        'Account onboarding is not completed. Please complete onboarding first.',
        undefined,
        403
      ),
    };
  }

  const { passwordHash: _hash, ...safeUser } = user;
  return {
    success: true,
    context: {
      user: safeUser,
      ownerId: safeUser.id,
    },
  };
}
