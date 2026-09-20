import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { setTenantNotice } from '@/lib/db/repositories/tenantRepo';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { expectedCheckOutDate } = body;

    if (!expectedCheckOutDate || typeof expectedCheckOutDate !== 'string') {
      return errorResponse(
        'VALIDATION_ERROR',
        'expectedCheckOutDate (YYYY-MM-DD) is required.',
        { expectedCheckOutDate: 'required' },
        400
      );
    }

    const result = await setTenantNotice(auth.context.ownerId, id, expectedCheckOutDate);
    if (!result.success) {
      if (result.error?.includes('not found')) {
        return errorResponse('NOT_FOUND', result.error, undefined, 404);
      }
      return errorResponse('CONFLICT', result.error || 'Failed to set notice.', undefined, 409);
    }

    return successResponse({ tenant: result.tenant });
  } catch (err) {
    console.error('Set notice error:', err);
    return errorResponse('INTERNAL', 'Failed to put tenant on notice.', undefined, 500);
  }
}
