import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { calculateTenantDues } from '@/lib/db/repositories/paymentRepo';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const billingMonth = searchParams.get('billingMonth');

    if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
      return errorResponse(
        'VALIDATION_ERROR',
        'billingMonth query parameter (YYYY-MM) is required.',
        { billingMonth: 'required format YYYY-MM' },
        400
      );
    }

    const dues = await calculateTenantDues(auth.context.ownerId, id, billingMonth);
    if (!dues) {
      return errorResponse('NOT_FOUND', 'Tenant not found.', undefined, 404);
    }

    return successResponse(dues);
  } catch (err) {
    console.error('Calculate dues error:', err);
    return errorResponse('INTERNAL', 'Failed to calculate dues.', undefined, 500);
  }
}
