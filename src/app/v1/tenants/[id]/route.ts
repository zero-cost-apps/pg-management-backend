import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { getTenant, updateTenant } from '@/lib/db/repositories/tenantRepo';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const tenant = await getTenant(auth.context.ownerId, id);

    if (!tenant) {
      return errorResponse('NOT_FOUND', 'Tenant not found.', undefined, 404);
    }

    return successResponse({ tenant });
  } catch (err) {
    console.error('Get tenant error:', err);
    return errorResponse('INTERNAL', 'Failed to get tenant.', undefined, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const existing = await getTenant(auth.context.ownerId, id);
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Tenant not found.', undefined, 404);
    }

    const body = await req.json();

    // Not allowed to change via simple patch: status, roomId, buildingId, checkInDate
    delete body.id;
    delete body.status;
    delete body.roomId;
    delete body.buildingId;
    delete body.checkInDate;
    delete body.documents;

    const updated = await updateTenant(auth.context.ownerId, id, body);
    return successResponse({ tenant: updated });
  } catch (err) {
    console.error('Update tenant error:', err);
    return errorResponse('INTERNAL', 'Failed to update tenant.', undefined, 500);
  }
}
