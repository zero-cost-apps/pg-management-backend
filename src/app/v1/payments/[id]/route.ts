import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { getPayment } from '@/lib/db/repositories/paymentRepo';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const payment = await getPayment(auth.context.ownerId, id);

    if (!payment) {
      return errorResponse('NOT_FOUND', 'Payment not found.', undefined, 404);
    }

    return successResponse({ payment });
  } catch (err) {
    console.error('Get payment error:', err);
    return errorResponse('INTERNAL', 'Failed to get payment.', undefined, 500);
  }
}
