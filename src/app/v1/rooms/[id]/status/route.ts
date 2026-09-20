import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import { getRoom, updateRoom } from '@/lib/db/repositories/roomRepo';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const room = await getRoom(auth.context.ownerId, id);
    if (!room) {
      return errorResponse('NOT_FOUND', 'Room not found.', undefined, 404);
    }

    const body = await req.json();
    const { status, reason } = body;

    if (!status || !['vacant', 'maintenance'].includes(status)) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Status must be "vacant" or "maintenance". Use check-in to make room occupied.',
        undefined,
        400
      );
    }

    if (room.status === 'occupied') {
      if (status === 'maintenance') {
        return errorResponse(
          'ROOM_OCCUPIED',
          'Cannot put occupied room into maintenance. Please vacate or relocate resident first.',
          undefined,
          409
        );
      }
      return errorResponse(
        'CONFLICT',
        'Cannot directly change occupied room to vacant. Use POST /tenants/:id/vacate.',
        undefined,
        409
      );
    }

    if (status === 'maintenance') {
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return errorResponse(
          'VALIDATION_ERROR',
          'Reason is required when moving room to maintenance.',
          { reason: 'required' },
          400
        );
      }

      const updated = await updateRoom(auth.context.ownerId, id, {
        status: 'maintenance',
        maintenanceReason: reason.trim(),
      });
      return successResponse({ room: updated });
    }

    if (status === 'vacant') {
      const updated = await updateRoom(auth.context.ownerId, id, {
        status: 'vacant',
        maintenanceReason: null,
        primaryTenantId: null,
      });
      return successResponse({ room: updated });
    }

    return errorResponse('VALIDATION_ERROR', 'Invalid status transition.', undefined, 400);
  } catch (err) {
    console.error('Update room status error:', err);
    return errorResponse('INTERNAL', 'Failed to update room status.', undefined, 500);
  }
}
