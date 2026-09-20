import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { listPayments, createPayment } from '@/lib/db/repositories/paymentRepo';
import { PaymentStatus } from '@/types';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const buildingId = searchParams.get('buildingId') || undefined;
    const tenantId = searchParams.get('tenantId') || undefined;
    const billingMonth = searchParams.get('billingMonth') || undefined;
    const status = (searchParams.get('status') as PaymentStatus) || undefined;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10));

    const payments = await listPayments(auth.context.ownerId, {
      buildingId,
      tenantId,
      billingMonth,
      status,
    });

    const total = payments.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const paginated = payments.slice(offset, offset + pageSize);

    return successResponse(
      { payments: paginated },
      {
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      }
    );
  } catch (err) {
    console.error('List payments error:', err);
    return errorResponse('INTERNAL', 'Failed to list payments.', undefined, 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const idempotencyKey = req.headers.get('idempotency-key');
    const body = await req.json();
    const {
      tenantId,
      billingMonth,
      rentAmount,
      amountPaid,
      paymentDate,
      paymentMode,
    } = body;

    const fields: Record<string, string> = {};
    if (!tenantId) fields.tenantId = 'tenantId is required.';
    if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
      fields.billingMonth = 'billingMonth in YYYY-MM format is required.';
    }
    if (rentAmount === undefined || rentAmount < 0) fields.rentAmount = 'rentAmount must be >= 0.';
    if (amountPaid === undefined || amountPaid < 0) fields.amountPaid = 'amountPaid must be >= 0.';
    if (!paymentDate) fields.paymentDate = 'paymentDate is required.';
    if (!paymentMode) fields.paymentMode = 'paymentMode is required.';

    if (Object.keys(fields).length > 0) {
      return errorResponse('VALIDATION_ERROR', 'Validation failed.', fields, 400);
    }

    const result = await createPayment(auth.context.ownerId, body, idempotencyKey);
    if (!result.success) {
      if (result.error?.includes('not found')) {
        return errorResponse('NOT_FOUND', result.error, undefined, 404);
      }
      return errorResponse('CONFLICT', result.error || 'Failed to record payment.', undefined, 409);
    }

    return successResponse({ payment: result.payment }, undefined, 201);
  } catch (err) {
    console.error('Create payment error:', err);
    return errorResponse('INTERNAL', 'Failed to create payment.', undefined, 500);
  }
}
