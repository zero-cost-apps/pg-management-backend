import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { revokeSession, revokeAllUserSessions } from '@/lib/db/repositories/userRepo';
import { hashToken } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req, { requireOnboarded: false });
  if (!auth.success) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { refreshToken } = body;

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await revokeSession(tokenHash);
    } else {
      await revokeAllUserSessions(auth.context.user.id);
    }

    return successResponse({ loggedOut: true });
  } catch (err) {
    console.error('Logout error:', err);
    return errorResponse('INTERNAL', 'An unexpected error occurred.', undefined, 500);
  }
}
