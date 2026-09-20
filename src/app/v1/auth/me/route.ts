import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { sanitizeUser, findUserById } from '@/lib/db/repositories/userRepo';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { requireOnboarded: false });
  if (!auth.success) return auth.response;

  // Retrieve fresh user state
  const stored = await findUserById(auth.context.user.id);
  const user = stored ? sanitizeUser(stored) : auth.context.user;

  return successResponse({ user });
}
