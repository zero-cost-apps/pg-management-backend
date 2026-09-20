import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { vacateTenant } from '@/lib/db/repositories/tenantRepo';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const refundDeposit = body.refundDeposit !== undefined ? !!body.refundDeposit : true;

    const result = await vacateTenant(auth.context.ownerId, id, refundDeposit);
    if (!result.success) {
      if (result.error?.includes('not found')) {
        return errorResponse('NOT_FOUND', result.error, undefined, 404);
      }
      return errorResponse('CONFLICT', result.error || 'Failed to vacate tenant.', undefined, 409);
    }

    return successResponse({
      tenant: result.tenant,
      room: result.room,
    });
  } catch (err) {
    console.error('Vacate error:', err);
    return errorResponse('INTERNAL', 'Failed to vacate tenant.', undefined, 500);
  }
}
