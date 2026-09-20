import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/envelope';
import { authenticateRequest } from '@/lib/auth/authGuard';
import {
  getRoom,
  updateRoom,
  deleteRoom,
} from '@/lib/db/repositories/roomRepo';

export async function GET(
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

    return successResponse({ room });
  } catch (err) {
    console.error('Get room error:', err);
    return errorResponse('INTERNAL', 'Failed to get room.', undefined, 500);
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
    const existing = await getRoom(auth.context.ownerId, id);
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Room not found.', undefined, 404);
    }

    const body = await req.json();

    // Cannot set status or primaryTenantId via PATCH /rooms/:id
    delete body.id;
    delete body.status;
    delete body.primaryTenantId;
    delete body.occupantCount;

    const updated = await updateRoom(auth.context.ownerId, id, body);
    return successResponse({ room: updated });
  } catch (err) {
    console.error('Update room error:', err);
    return errorResponse('INTERNAL', 'Failed to update room.', undefined, 500);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.success) return auth.response;

  try {
    const { id } = await context.params;
    const existing = await getRoom(auth.context.ownerId, id);
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Room not found.', undefined, 404);
    }

    const result = await deleteRoom(auth.context.ownerId, id);
    if (!result.success) {
      if (result.conflictReason === 'ROOM_NOT_VACANT') {
        return errorResponse(
          'ROOM_NOT_VACANT',
          'Cannot delete room because it is not vacant or has an active occupant.',
          undefined,
          409
        );
      }
      return errorResponse('INTERNAL', 'Failed to delete room.', undefined, 500);
    }

    return successResponse({ deleted: true, id });
  } catch (err) {
    console.error('Delete room error:', err);
    return errorResponse('INTERNAL', 'Failed to delete room.', undefined, 500);
  }
}
